<?php
// api/clients.php — Клиентская база (только admin)
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — список клиентов
if ($method === 'GET' && $action === 'list') {
    authAdmin();
    $db     = getDB();
    $status = $_GET['status'] ?? null;
    $search = $_GET['search'] ?? null;

    $sql = 'SELECT u.id, u.email, u.name, u.phone, (SELECT code FROM dictionaries WHERE id = u.role_id) AS role, u.status, u.bike,
                   u.birth_date, u.notes, u.created_at,
                   COUNT(b.id) AS total_bookings,
                   COALESCE(SUM(CASE WHEN b.payment_status="paid" THEN b.price ELSE 0 END), 0) AS total_spent,
                   MAX(s.slot_date) AS last_visit
            FROM users u
            LEFT JOIN bookings b ON u.id = b.user_id AND b.status <> "cancelled"
            LEFT JOIN slots s ON b.slot_id = s.id
            WHERE u.role_id = (SELECT id FROM dictionaries WHERE group_code = "user_role" AND code = "client")';
    $params = [];

    if ($status) { $sql .= ' AND u.status=?'; $params[] = $status; }
    if ($search) {
        $sql .= ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
        $like = "%$search%";
        $params = array_merge($params, [$like, $like, $like]);
    }
    $sql .= ' GROUP BY u.id ORDER BY u.created_at DESC';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok($stmt->fetchAll());
}

// GET — один клиент с историей
if ($method === 'GET' && $action === 'get') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');

    $db   = getDB();
    $stmt = $db->prepare('SELECT id,email,name,phone,status,bike,birth_date,notes,created_at FROM users WHERE id=?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) err('Клиент не найден', 404);

    $stmt = $db->prepare('
        SELECT b.*, s.name AS slot_name, s.slot_date, s.start_time, dc.code AS category,
               t.name AS trainer_name
        FROM bookings b
        JOIN slots s ON b.slot_id=s.id
        JOIN dictionaries dc ON s.category_id=dc.id
        LEFT JOIN trainers t ON s.trainer_id=t.id
        WHERE b.user_id=?
        ORDER BY s.slot_date DESC
    ');
    $stmt->execute([$id]);
    $user['bookings'] = $stmt->fetchAll();

    ok($user);
}

// POST — создать клиента
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['email', 'name']);

    $email = strtolower(trim($d['email']));
    $db    = getDB();
    $stmt  = $db->prepare('SELECT id FROM users WHERE email=?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) err('Email уже зарегистрирован');

    $hash = password_hash(bin2hex(random_bytes(8)), PASSWORD_BCRYPT);
    $stmt = $db->prepare('INSERT INTO users (email,password,name,phone,status,bike,birth_date,notes,role_id)
                          VALUES (?,?,?,?,?,?,?,?,1)');
    $stmt->execute([
        $email, $hash, $d['name'], $d['phone'] ?? '',
        $d['status'] ?? 'new', $d['bike'] ?? '',
        $d['birth_date'] ?? null, $d['notes'] ?? '',
    ]);
    ok(['id' => $db->lastInsertId()], 'Клиент добавлен');
}

// PUT — обновить клиента
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    $db = getDB();
    $db->prepare('UPDATE users SET name=?,phone=?,status=?,bike=?,birth_date=?,notes=? WHERE id=?')
       ->execute([$d['name'], $d['phone'] ?? '', $d['status'] ?? 'active',
                  $d['bike'] ?? '', $d['birth_date'] ?? null, $d['notes'] ?? '', $id]);
    ok(null, 'Клиент обновлён');
}

// DELETE — удалить клиента
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('DELETE FROM users WHERE id=? AND role_id = (SELECT id FROM dictionaries WHERE group_code = "user_role" AND code = "client")')->execute([$id]);
    ok(null, 'Клиент удалён');
}

err('Неизвестный endpoint', 404);
