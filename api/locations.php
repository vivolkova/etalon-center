<?php
// api/locations.php — Филиалы (локации). Публичный список для выпадающих списков.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET ?action=list — активные филиалы
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    ok($db->query('SELECT id, name, address, hall_cols, hall_rows, max_people, email, phone, work_hours, active
                   FROM locations WHERE active = 1 ORDER BY id')->fetchAll());
}

// GET ?action=get&id=X — один филиал
if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $stmt = $db->prepare('SELECT id, name, address, hall_cols, hall_rows, max_people, email, phone, work_hours, active
                          FROM locations WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) err('Локация не найдена', 404);
    ok($row);
}

// POST ?action=create — создать филиал (admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'hall_cols', 'hall_rows', 'max_people']);
    $db = getDB();
    $workHours = isset($d['work_hours']) && is_array($d['work_hours'])
        ? json_encode(array_values($d['work_hours']), JSON_UNESCAPED_UNICODE)
        : null;
    $stmt = $db->prepare('INSERT INTO locations (name, address, hall_cols, hall_rows, max_people, email, phone, work_hours, timezone, active)
                          VALUES (?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $d['name'],
        $d['address'] ?? '',
        (int)$d['hall_cols'],
        (int)$d['hall_rows'],
        (int)$d['max_people'],
        $d['email'] ?? null,
        $d['phone'] ?? null,
        $workHours,
        $d['timezone'] ?? 'Europe/Moscow',
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
    ]);
    ok(['id' => (int)$db->lastInsertId()], 'Филиал создан');
}

// PUT ?action=update — обновить филиал (admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    require_fields($d, ['name', 'hall_cols', 'hall_rows', 'max_people']);
    $db = getDB();
    $workHours = isset($d['work_hours']) && is_array($d['work_hours'])
        ? json_encode(array_values($d['work_hours']), JSON_UNESCAPED_UNICODE)
        : null;
    $stmt = $db->prepare('UPDATE locations SET name=?, address=?, hall_cols=?, hall_rows=?, max_people=?, email=?, phone=?, work_hours=?, timezone=?, active=? WHERE id=?');
    $stmt->execute([
        $d['name'],
        $d['address'] ?? '',
        (int)$d['hall_cols'],
        (int)$d['hall_rows'],
        (int)$d['max_people'],
        $d['email'] ?? null,
        $d['phone'] ?? null,
        $workHours,
        $d['timezone'] ?? 'Europe/Moscow',
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
        $id,
    ]);
    ok(null, 'Филиал обновлён');
}

err('Неизвестный endpoint', 404);
