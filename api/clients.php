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
    $bf     = branchFilter($user, 's.location_id');   // клиенты общие, а их записи считаем только по своим филиалам
    $db     = getDB();
    $type = $_GET['type'] ?? null;
    $search = $_GET['search'] ?? null;

    $sql = 'SELECT u.id, u.first_name, u.last_name, u.name, u.phone, u.has_account, u.phone_verified_at, u.type,
                   u.birth_date, u.notes, u.created_at,
                   COUNT(s.id) AS total_bookings,
                   COALESCE(SUM(CASE WHEN b.payment_status="paid" THEN s.price ELSE 0 END), 0) AS total_spent,
                   MAX(s.slot_date) AS last_visit
            FROM users u
            LEFT JOIN bookings b ON u.id = b.user_id AND b.status <> "cancelled"
            LEFT JOIN slots s ON b.slot_id = s.id' . $bf['sql'] . '
            WHERE u.active = 1 AND ' . NOT_ADMIN_SQL;
    $params = $bf['params'];

    if ($type) { $sql .= ' AND u.type=?'; $params[] = $type; }
    if ($search) {
        // телефон ищем по цифрам: в базе он хранится без скобок и пробелов
        $digits = preg_replace('/\D+/', '', $search);
        $sql .= ' AND (u.name LIKE ?' . ($digits !== '' ? ' OR u.phone LIKE ?' : '') . ')';
        $params[] = "%$search%";
        if ($digits !== '') $params[] = "%$digits%";
    }
    $sql .= ' GROUP BY u.id ORDER BY u.created_at DESC';

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
    // Личный кабинет: есть ли, когда создан, подтверждён ли номер (когда и кем), последний вход
    $stmt = $db->prepare('SELECT u.id, u.first_name, u.last_name, u.name, u.phone, u.has_account, u.account_created_at,
                                 u.phone_verified_at, u.phone_verified_method, v.name AS phone_verified_by_name,
                                 (SELECT MAX(se.created_at) FROM sessions se WHERE se.user_id = u.id) AS last_login_at,
                                 u.type, u.birth_date, u.notes, u.created_at
                          FROM users u LEFT JOIN users v ON v.id = u.phone_verified_by
                          WHERE u.id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) err('Клиент не найден', 404);
    $user['phone'] = phoneView($user['phone']);

    $stmt = $db->prepare('
        SELECT b.*, s.name AS slot_name, s.slot_date, s.start_time, dc.code AS category,
               t.name AS specialist_name
        FROM bookings b
        JOIN slots s ON b.slot_id=s.id
        JOIN dictionaries dc ON s.category_id=dc.id
        LEFT JOIN specialists_view t ON s.specialist_id=t.id
        WHERE b.user_id=?' . $bf['sql'] . '
        ORDER BY s.slot_date DESC
    ');
    $stmt->execute(array_merge([$id], $bf['params']));
    $user['bookings'] = $stmt->fetchAll();

    ok($user);
}

// POST — создать клиента: имя и телефон. Кабинета у него нет (has_account = 0), как у записанного по телефону из журнала
if ($method === 'POST' && $action === 'create') {
    authCan('clients');
    $d  = input();
    $f  = clientFields($d);
    $db = getDB();
    $db->beginTransaction();
    $c = createPhoneClient($db, $d);
    $db->prepare('UPDATE users SET type=?, birth_date=?, notes=? WHERE id=?')
       ->execute([$f[2], $f[3], $f[4], $c['id']]);
    $db->commit();
    ok(['id' => $c['id']], 'Клиент добавлен');
}

// PUT — обновить клиента. Телефон — логин: должен остаться уникальным; смена номера сбрасывает его подтверждение
if ($method === 'PUT' && $action === 'update') {
    $admin = authCan('clients');
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    $f = clientFields($d);
    $phone = phoneDigits((string)($d['phone'] ?? ''));
    if ($phone === null) err('Укажите телефон клиента полностью, например +7 900 123-45-67');

    $db = getDB();
    $db->beginTransaction();
    $db->prepare('UPDATE users SET first_name=?, last_name=?, type=?, birth_date=?, notes=? WHERE id=?')
       ->execute([$f[0], $f[1], $f[2], $f[3], $f[4], $id]);
    setUserPhone($db, $id, $phone, $admin);
    $db->commit();
    ok(null, 'Клиент обновлён');
}

// Клиент для действий с кабинетом и номером: действующий и не администратор (у сотрудников — свой раздел)
function clientForAccount(PDO $db, int $id): array {
    if (!$id) err('Не указан id');
    $st = $db->prepare('SELECT u.id, u.phone, u.has_account, u.phone_verified_at FROM users u
                        WHERE u.id = ? AND u.active = 1 AND ' . NOT_ADMIN_SQL . ' FOR UPDATE');
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
    $c = clientForAccount($db, (int)(input()['id'] ?? 0));
    if ($c['phone_verified_at'] !== null) { $db->rollBack(); err('Номер уже подтверждён'); }
    $db->prepare("UPDATE users SET phone_verified_at = NOW(), phone_verified_by = ?, phone_verified_method = 'admin' WHERE id = ?")
       ->execute([(int)$admin['id'], (int)$c['id']]);
    logAction($db, $admin, 'client.phone_verified', 'users', (int)$c['id'], ['phone' => $c['phone'], 'method' => 'admin']);
    $db->commit();
    ok(null, 'Номер подтверждён');
}

// POST ?action=disable_account {id} — отключить личный кабинет: пароль стирается, все сессии клиента завершаются.
// Сам клиент и его записи на занятия остаются; кабинет создаётся заново по ссылке от администратора
if ($method === 'POST' && $action === 'disable_account') {
    $admin = authCan('clients');
    $db = getDB();
    $db->beginTransaction();
    $c = clientForAccount($db, (int)(input()['id'] ?? 0));
    if (!(int)$c['has_account']) { $db->rollBack(); err('У клиента нет личного кабинета'); }
    $db->prepare('UPDATE users SET password = NULL, has_account = 0 WHERE id = ?')->execute([(int)$c['id']]);
    sessionEndAll($db, (int)$c['id'], 'admin');
    logAction($db, $admin, 'account.disabled', 'users', (int)$c['id']);
    $db->commit();
    ok(null, 'Кабинет отключён');
}

// DELETE — удалить клиента
// Удалять клиента может только администратор системы
if ($method === 'DELETE' && $action === 'delete') {
    authCan('system');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    if (userRoles($db, $id)) err('Это сотрудник: сначала снимите с него роли');
    // Soft-delete: пользователя не удаляем (на него ссылаются записи) — гасим флаг.
    $db->prepare('UPDATE users SET active = 0 WHERE id=?')->execute([$id]);
    ok(null, 'Клиент удалён');
}

err('Неизвестный endpoint', 404);
