<?php
// api/auth.php — Регистрация, вход, выход, профиль, смена пароля. Логин — номер телефона.
// Вход создаёт сессию (middleware/session.php): cookie ec_session + ключ сессии в ответе (session_key).
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Пользователь для ответа
function authUserData(PDO $db, int $id): ?array {
    $st = $db->prepare('SELECT id, first_name, last_name, name, phone, type, active, has_account, birth_date, notes, created_at
                        FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) return null;
    $u['id']    = (int)$u['id'];
    $u['phone'] = phoneView($u['phone']);
    $u['role']  = userRole($db, $u['id']);
    // rights — что доступно в панели, branches — в каких филиалах (null — во всех); сервер проверяет это сам на каждом вызове
    $u += userAccess(['roles' => userRoles($db, $u['id'])]);
    // Обязательные документы, новую редакцию которых клиент ещё не принял (администратора это не касается)
    $u['pending_docs'] = $u['role'] === 'admin' ? [] : pendingDocs($db, $u['id']);
    return $u;
}

// POST /api/auth.php?action=register — имя, фамилия, телефон, пароль и три галочки:
// agree_offer (оферта и правила студии) и agree_pd (обработка персональных данных) обязательны, agree_photo — нет
if ($method === 'POST' && $action === 'register') {
    originGuard();
    $d = input();
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    $pass  = (string)($d['password'] ?? '');
    if ($first === '') err('Укажите имя');
    if ($last === '')  err('Укажите фамилию');
    $phone = phoneDigits((string)($d['phone'] ?? ''));
    if ($phone === null) err('Укажите номер телефона полностью');
    if ($problem = passwordProblem($pass, ['phone' => $phone, 'names' => [$first, $last]])) err($problem);
    if (empty($d['agree_offer'])) err('Чтобы зарегистрироваться, нужно согласиться с офертой и правилами студии');
    if (empty($d['agree_pd']))    err('Чтобы зарегистрироваться, нужно дать согласие на обработку персональных данных');

    $db = getDB();
    if ($blocked = registerBlocked($db)) err($blocked, 429);

    $st = $db->prepare('SELECT has_account, active FROM users WHERE phone = ?');
    $st->execute([$phone]);
    if ($ex = $st->fetch()) {
        attemptLog($db, 'register', $phone, false);
        if ((int)$ex['active'] === 0) err('Учётная запись с этим номером отключена — обратитесь к администратору');
        if ((int)$ex['has_account'] === 1) err('Этот номер уже зарегистрирован. Войдите, а если забыли пароль — обратитесь к администратору');
        err('Вы уже есть в нашей базе: администратор записывал вас по телефону. Чтобы получить доступ к кабинету и своим записям, обратитесь к администратору');
    }

    try {
        $db->prepare('INSERT INTO users (first_name, last_name, phone, password, has_account, account_created_at)
                      VALUES (?, ?, ?, ?, 1, NOW())')
           ->execute([$first, $last, $phone, password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12])]);
    } catch (PDOException $e) {
        // второй запрос с тем же номером успел раньше
        if (isDuplicatePhone($e)) { attemptLog($db, 'register', $phone, false); err('Этот номер уже зарегистрирован'); }
        throw $e;
    }
    $userId  = (int)$db->lastInsertId();
    consentAccept($db, $userId, array_merge(CONSENT_OFFER, CONSENT_PD, !empty($d['agree_photo']) ? CONSENT_PHOTO : []));
    $session = sessionStart($db, $userId);
    attemptLog($db, 'register', $phone, true, $session['id']);
    logAction($db, ['id' => $userId, 'session_id' => $session['id']], 'auth.register', 'users', $userId);
    ok(['user' => authUserData($db, $userId), 'session_key' => $session['key']]);
}

// POST /api/auth.php?action=login — телефон и пароль
if ($method === 'POST' && $action === 'login') {
    originGuard();
    $d     = input();
    $phone = phoneDigits((string)($d['phone'] ?? ''));
    $pass  = (string)($d['password'] ?? '');
    $fail  = 'Неверный номер телефона или пароль';
    if ($phone === null || $pass === '') err($fail);

    $db = getDB();
    if ($blocked = loginBlocked($db, $phone)) err($blocked, 429);

    $st = $db->prepare('SELECT id, password, active, has_account FROM users WHERE phone = ?');
    $st->execute([$phone]);
    $row = $st->fetch();

    // Одна и та же ошибка, когда номера нет, пароль неверный или кабинета нет: по ответу нельзя узнать, чей это номер
    if (!$row || !(int)$row['has_account'] || $row['password'] === null || !password_verify($pass, $row['password'])) {
        attemptLog($db, 'login', $phone, false);
        err($fail);
    }
    if ((int)$row['active'] === 0) { attemptLog($db, 'login', $phone, false); err('Учётная запись отключена'); }
    // хэш прежней стойкости обновляем при удачном входе
    if (password_needs_rehash($row['password'], PASSWORD_BCRYPT, ['cost' => 12])) {
        $db->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]), (int)$row['id']]);
    }

    $session = sessionStart($db, (int)$row['id']);
    attemptLog($db, 'login', $phone, true, $session['id']);
    ok(['user' => authUserData($db, (int)$row['id']), 'session_key' => $session['key']]);
}

// POST /api/auth.php?action=logout — завершить эту сессию
if ($method === 'POST' && $action === 'logout') {
    $user = authUser();
    sessionEnd(getDB(), $user['session_id'], 'logout');
    sessionCookieClear();
    ok(null, 'Вы вышли');
}

// POST /api/auth.php?action=logout_all — выйти на всех устройствах
if ($method === 'POST' && $action === 'logout_all') {
    $user = authUser();
    sessionEndAll(getDB(), $user['id'], 'logout');
    sessionCookieClear();
    ok(null, 'Вы вышли на всех устройствах');
}

// GET /api/auth.php?action=me — кто вошёл (по cookie) и ключ сессии для страницы
if ($method === 'GET' && $action === 'me') {
    $user = authUser();
    $u = authUserData(getDB(), $user['id']);
    if (!$u) err('Пользователь не найден', 404);
    ok(['user' => $u, 'session_key' => $user['key']]);
}

// PUT /api/auth.php?action=password — смена пароля: {current, password}. Остальные сессии человека завершаются
if ($method === 'PUT' && $action === 'password') {
    $user = authUser();
    $d    = input();
    $db   = getDB();
    $st   = $db->prepare('SELECT first_name, last_name, phone, password FROM users WHERE id = ?');
    $st->execute([$user['id']]);
    $row  = $st->fetch();
    if ($blocked = loginBlocked($db, $row['phone'])) err($blocked, 429);
    if (!password_verify((string)($d['current'] ?? ''), (string)$row['password'])) {
        attemptLog($db, 'login', $row['phone'], false);   // перебор текущего пароля считается так же, как перебор при входе
        err('Текущий пароль указан неверно');
    }
    $new = (string)($d['password'] ?? '');
    if ($problem = passwordProblem($new, ['phone' => $row['phone'], 'names' => [$row['first_name'], $row['last_name']]])) err($problem);
    if (password_verify($new, (string)$row['password'])) err('Новый пароль совпадает с текущим');
    $db->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_BCRYPT, ['cost' => 12]), $user['id']]);
    sessionEndAll($db, $user['id'], 'password', $user['session_id']);
    logAction($db, $user, 'auth.password_changed', 'users', $user['id']);
    ok(null, 'Пароль изменён');
}

// PUT /api/auth.php?action=update — профиль. Телефон здесь не меняется: он логин, меняет его администратор
if ($method === 'PUT' && $action === 'update') {
    $user = authUser();
    $d = input();

    $fields = [];
    $params = [];
    if (isset($d['first_name'])) {
        $first = trim((string)$d['first_name']);
        if ($first === '') err('Укажите имя');
        $fields[] = 'first_name=?'; $params[] = $first;
    }
    if (isset($d['last_name'])) {
        $last = trim((string)$d['last_name']);
        if ($last === '') err('Укажите фамилию');
        $fields[] = 'last_name=?'; $params[] = $last;
    }
    if (!empty($d['birth_date'])) { $fields[] = 'birth_date=?'; $params[] = $d['birth_date']; }
    if (isset($d['notes']))       { $fields[] = 'notes=?';      $params[] = $d['notes']; }

    if (empty($fields)) err('Нет данных для обновления');

    $params[] = $user['id'];
    $db = getDB();
    $db->prepare('UPDATE users SET ' . implode(',', $fields) . ' WHERE id=?')->execute($params);
    ok(authUserData($db, $user['id']), 'Профиль обновлён');
}

err('Неизвестный endpoint', 404);
