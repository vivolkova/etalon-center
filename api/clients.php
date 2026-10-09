<?php
// api/clients.php — Клиентская база (только admin)
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/booking_client.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// В клиентской базе — все, кроме администраторов (системы и студий): они работают в панели, а не записываются
const NOT_ADMIN_SQL = "NOT EXISTS (SELECT 1 FROM user_roles ur JOIN dictionaries rd ON rd.id = ur.role_id
                                   WHERE ur.user_id = u.id AND ur.amnd_state = 'A'
                                     AND rd.code IN ('system_admin', 'studio_admin'))";

// Сотрудник (человек с ролью) в запросах клиентской базы от администратора студии. Администраторов в клиентской
// базе нет вовсе — для него их как будто не существует (404). Остальные сотрудники (тренер, байкфиттер, механик)
// в базе есть: они тоже записываются на занятия. Возвращает роли человека; администратору системы доступны все
function staffRolesFor(PDO $db, array $admin, int $id): array {
    $roles = userRoles($db, $id);
    if (!isSystemAdmin($admin) && array_filter($roles, fn($r) => in_array($r['code'], ADMIN_ROLES, true))) err('Клиент не найден', 404);
    return $roles;
}

// Согласия за клиента администратор отмечает и отзывает, только пока у клиента нет личного кабинета (его завёл
// администратор, документы он подписывает в студии). Клиент с кабинетом даёт и отзывает согласия сам на сайте
const CONSENT_SELF = 'У клиента есть личный кабинет — согласия он даёт и отзывает сам на сайте';

// Поля карточки клиента из запроса: [first_name, last_name, type, birth_date, notes]
function clientFields(array $d): array {
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    if ($first === '') err('Укажите имя клиента');
    if ($last === '')  err('Укажите фамилию клиента');
    $type = (string)($d['type'] ?? 'new');
    return [
        $first, $last,
        in_array($type, ['new', 'regular', 'vip'], true) ? $type : 'new',
        !empty($d['birth_date']) ? $d['birth_date'] : null, (string)($d['notes'] ?? ''),
    ];
}

// GET — список клиентов
if ($method === 'GET' && $action === 'list') {
    $user   = authCan('clients');
    $db     = getDB();
    $type = $_GET['type'] ?? null;
    $search = $_GET['search'] ?? null;

    // Только сведения о самих клиентах: число записей и суммы в списке не показываются, и сервер их не считает
    $sql = 'SELECT u.id, u.first_name, u.last_name, u.name, u.phone, u.has_account, u.phone_verified_at, u.type,
                   u.birth_date, u.notes, u.created_at, ' . consentsOkSql($db, 'u.id') . ' AS consents_ok
            FROM users u
            WHERE u.active = 1 AND ' . NOT_ADMIN_SQL;
    $params = [];

    if ($type) { $sql .= ' AND u.type=?'; $params[] = $type; }
    if ($search) {
        // телефон ищем по цифрам: в базе он хранится без скобок и пробелов
        $digits = preg_replace('/\D+/', '', $search);
        $sql .= ' AND (u.name LIKE ?' . ($digits !== '' ? ' OR u.phone LIKE ?' : '') . ')';
        $params[] = "%$search%";
        if ($digits !== '') $params[] = "%$digits%";
    }
    $sql .= ' ORDER BY u.created_at DESC';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok(phoneViewRows($stmt->fetchAll()));
}

// GET — один клиент с историей
if ($method === 'GET' && $action === 'get') {
    $user = authCan('clients');
    $bf   = branchFilter($user, 's.location_id');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');

    $db   = getDB();
    staffRolesFor($db, $user, $id);
    // Личный кабинет: есть ли, когда создан, подтверждён ли номер (когда и кем), последний вход
    $stmt = $db->prepare('SELECT u.id, u.first_name, u.last_name, u.name, u.phone, u.has_account, u.account_created_at,
                                 u.phone_verified_at, u.phone_verified_method, v.name AS phone_verified_by_name,
                                 (SELECT MAX(se.created_at) FROM sessions se WHERE se.user_id = u.id) AS last_login_at,
                                 (u.has_account = 1 AND u.password IS NULL) AS password_reset,   -- пароль сброшен, новый ещё не задан
                                 u.type, u.birth_date, u.notes, u.created_at
                          FROM users u LEFT JOIN users v ON v.id = u.phone_verified_by
                          WHERE u.id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) err('Клиент не найден', 404);
    $user['phone'] = phoneView($user['phone']);

    // Записи клиента на занятия: от недели назад и дальше без ограничения (по дате занятия), свежие сверху.
    // Администратор студии видит записи только в своих филиалах
    $from = date('Y-m-d', strtotime('-7 days'));
    $stmt = $db->prepare('
        SELECT b.id, b.status, s.name AS slot_name, s.slot_date, s.start_time, dc.code AS category, dt.code AS type,
               t.name AS specialist_name
        FROM bookings b
        JOIN slots s ON b.slot_id=s.id
        JOIN dictionaries dc ON s.category_id=dc.id
        LEFT JOIN library l ON l.id = s.library_id
        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
        LEFT JOIN specialists_view t ON s.specialist_id=t.id
        WHERE b.user_id=? AND s.slot_date >= ?' . $bf['sql'] . '
        ORDER BY s.slot_date DESC, s.start_time DESC, b.id DESC
    ');
    $stmt->execute(array_merge([$id, $from], $bf['params']));
    $user['bookings'] = $stmt->fetchAll();
    $user['bookings_from'] = $from;
    // Согласия клиента по документам: что принято, на какую редакцию, когда и как (на сайте или на бумаге)
    $user['consents'] = userConsents($db, $id);

    ok($user);
}

// POST — создать клиента: имя и телефон. Кабинета у него нет (has_account = 0), как у записанного по телефону из журнала
if ($method === 'POST' && $action === 'create') {
    $admin = authCan('clients');
    $d  = input();
    $f  = clientFields($d);
    $db = getDB();
    $db->beginTransaction();
    $c = createPhoneClient($db, $d);
    // Статус клиента задаёт только администратор системы; у администратора студии новый клиент — «новый»
    $db->prepare('UPDATE users SET type=?, birth_date=?, notes=? WHERE id=?')
       ->execute([isSystemAdmin($admin) ? $f[2] : 'new', $f[3], $f[4], $c['id']]);
    $db->commit();
    ok(['id' => $c['id']], 'Клиент добавлен');
}

// PUT — обновить клиента: имя, фамилия, телефон, дата рождения, заметки; статус — только администратор системы.
// Телефон — логин: должен остаться уникальным; смена номера сбрасывает его подтверждение.
// consents: ['offer', …] — документы, которые клиент без кабинета подписал в студии (галочки на вкладке «Согласия»);
// consents_revoke: ['photo_consent'] — добровольные согласия, с которых галочку сняли (обязательные не отзываются).
// Данные клиента и согласия сохраняются одной транзакцией
if ($method === 'PUT' && $action === 'update') {
    $admin = authCan('clients');
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    $f = clientFields($d);
    $phone = phoneDigits((string)($d['phone'] ?? ''));
    if ($phone === null) err('Укажите телефон клиента полностью, например +7 900 123-45-67');
    $codes  = array_values(array_unique(array_map('strval', (array)($d['consents'] ?? []))));
    $revoke = array_values(array_unique(array_map('strval', (array)($d['consents_revoke'] ?? []))));

    // Статус клиента меняет только администратор системы: у администратора студии он остаётся прежним
    $db = getDB();
    $db->beginTransaction();
    // Имя и телефон (логин) сотрудника меняет только администратор системы — в разделе «Сотрудники»
    if (staffRolesFor($db, $admin, $id) && !isSystemAdmin($admin)) {
        $st = $db->prepare('SELECT first_name, last_name, phone FROM users WHERE id = ?');
        $st->execute([$id]);
        $cur = $st->fetch();
        if ($cur && ($cur['first_name'] !== $f[0] || $cur['last_name'] !== $f[1] || $cur['phone'] !== $phone)) {
            $db->rollBack();
            err('Это сотрудник: его имя, фамилию и телефон меняет главный управляющий', 403);
        }
    }
    if ($codes || $revoke) {
        $st = $db->prepare('SELECT has_account FROM users WHERE id = ? FOR UPDATE');
        $st->execute([$id]);
        if ((int)$st->fetchColumn()) { $db->rollBack(); err(CONSENT_SELF); }
    }
    if (isSystemAdmin($admin)) {
        $db->prepare('UPDATE users SET first_name=?, last_name=?, type=?, birth_date=?, notes=? WHERE id=?')
           ->execute([$f[0], $f[1], $f[2], $f[3], $f[4], $id]);
    } else {
        $db->prepare('UPDATE users SET first_name=?, last_name=?, birth_date=?, notes=? WHERE id=?')
           ->execute([$f[0], $f[1], $f[3], $f[4], $id]);
    }
    setUserPhone($db, $id, $phone, $admin);
    if ($codes) consentAccept($db, $id, $codes, 'admin', (int)$admin['id']);
    foreach ($revoke as $code) consentRevoke($db, $id, $code, $admin);
    $db->commit();
    ok(null, 'Клиент обновлён');
}

// Человек для действий с кабинетом и номером (окно клиента и окно сотрудника — одни и те же вызовы).
// Кабинетом сотрудника (человека с ролью) управляет только администратор системы; администраторов в клиентской
// базе нет, поэтому администратору студии они здесь недоступны вовсе
function clientForAccount(PDO $db, int $id, array $admin): array {
    if (!$id) err('Не указан id');
    if (userRoles($db, $id) && !isSystemAdmin($admin)) err('Это сотрудник: его кабинетом управляет главный управляющий', 403);
    $st = $db->prepare('SELECT u.id, u.phone, u.has_account, u.phone_verified_at, u.password IS NULL AS no_password FROM users u
                        WHERE u.id = ? AND u.active = 1 AND ' . (isSystemAdmin($admin) ? '1' : NOT_ADMIN_SQL) . ' FOR UPDATE');
    $st->execute([$id]);
    $c = $st->fetch();
    if (!$c) err('Клиент не найден', 404);
    return $c;
}

// POST ?action=verify_phone {id} — администратор позвонил на номер из карточки, клиент рядом принял звонок.
// Записываем когда, кто и способ (admin). Смена телефона подтверждение сбрасывает (setUserPhone)
if ($method === 'POST' && $action === 'verify_phone') {
    $admin = authCan('clients');
    $db = getDB();
    $db->beginTransaction();
    $c = clientForAccount($db, (int)(input()['id'] ?? 0), $admin);
    if ($c['phone_verified_at'] !== null) { $db->rollBack(); err('Номер уже подтверждён'); }
    $db->prepare("UPDATE users SET phone_verified_at = NOW(), phone_verified_by = ?, phone_verified_method = 'admin' WHERE id = ?")
       ->execute([(int)$admin['id'], (int)$c['id']]);
    logAction($db, $admin, 'client.phone_verified', 'users', (int)$c['id'], ['phone' => $c['phone'], 'method' => 'admin']);
    $db->commit();
    ok(null, 'Номер подтверждён');
}

// Одноразовая ссылка для клиента: activate — создать кабинет, reset — задать новый пароль. Секрет отдаётся один раз,
// в базе остаётся только его отпечаток (SHA-256). Ссылка живёт AUTH_LINK_HOURS часов и срабатывает один раз;
// новая ссылка отменяет прежние неиспользованные. Возвращает ответ для страницы
const AUTH_LINK_HOURS = 24;
function authLinkIssue(PDO $db, array $admin, array $c, string $purpose): array {
    $token = bin2hex(random_bytes(32));
    authLinksCancel($db, (int)$c['id']);
    $db->prepare('INSERT INTO auth_links (user_id, purpose, token_hash, expires_at, created_by)
                  VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?)')
       ->execute([(int)$c['id'], $purpose, hash('sha256', $token), AUTH_LINK_HOURS, (int)$admin['id']]);
    logAction($db, $admin, 'auth.link_issued', 'users', (int)$c['id'], ['purpose' => $purpose]);
    return ['token' => $token, 'purpose' => $purpose, 'hours' => AUTH_LINK_HOURS, 'phone' => phoneView($c['phone'])];
}

// POST ?action=auth_link {id} — ссылка для создания кабинета: клиенту, у которого кабинета нет
if ($method === 'POST' && $action === 'auth_link') {
    $admin = authCan('clients');
    $db = getDB();
    $db->beginTransaction();
    $c = clientForAccount($db, (int)(input()['id'] ?? 0), $admin);
    if ((int)$c['has_account']) { $db->rollBack(); err('У клиента уже есть кабинет — сбросьте ему пароль'); }
    $link = authLinkIssue($db, $admin, $c, 'activate');
    $db->commit();
    ok($link);
}

// POST ?action=reset_password {id} — сбросить пароль клиенту с кабинетом: пароль стирается, клиент выходит на всех
// устройствах и не войдёт, пока не задаст новый пароль по ссылке из ответа. Кабинет, согласия и записи на занятия
// остаются. Повторный вызов (ссылка потерялась или истекла) выдаёт новую ссылку
if ($method === 'POST' && $action === 'reset_password') {
    $admin = authCan('clients');
    $db = getDB();
    $db->beginTransaction();
    $c = clientForAccount($db, (int)(input()['id'] ?? 0), $admin);
    // свой пароль так не сбрасывают: администратор тут же вышел бы на всех устройствах
    if ((int)$c['id'] === (int)$admin['id']) { $db->rollBack(); err('Свой пароль меняйте в разделе «Профиль»'); }
    if (!(int)$c['has_account']) { $db->rollBack(); err('У клиента нет личного кабинета'); }
    if (!(int)$c['no_password']) {
        $db->prepare('UPDATE users SET password = NULL WHERE id = ?')->execute([(int)$c['id']]);
        sessionEndAll($db, (int)$c['id'], 'admin');
        logAction($db, $admin, 'account.password_reset', 'users', (int)$c['id']);
    }
    $link = authLinkIssue($db, $admin, $c, 'reset');
    $db->commit();
    ok($link);
}

err('Неизвестный endpoint', 404);
