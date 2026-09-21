<?php
// api/slots.php — Расписание (слоты)
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — список слотов
if ($method === 'GET' && $action === 'list') {
    $db    = getDB();
    $from  = $_GET['from'] ?? date('Y-m-d');
    $to    = $_GET['to']   ?? date('Y-m-d', strtotime('+14 days'));
    $cat   = $_GET['cat']  ?? null;

    $sql = 'SELECT s.*, t.name AS trainer_name, t.full_name AS trainer_full
            FROM slots s
            LEFT JOIN trainers t ON s.trainer_id = t.id
            WHERE s.slot_date BETWEEN ? AND ? AND s.active = 1';
    $params = [$from, $to];
    if ($cat) { $sql .= ' AND s.category = ?'; $params[] = $cat; }
    $sql .= ' ORDER BY s.slot_date, s.start_time';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok($stmt->fetchAll());
}

// GET — один слот
if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db   = getDB();
    $stmt = $db->prepare('SELECT s.*, t.name AS trainer_name FROM slots s LEFT JOIN trainers t ON s.trainer_id=t.id WHERE s.id=?');
    $stmt->execute([$id]);
    $slot = $stmt->fetch();
    if (!$slot) err('Слот не найден', 404);
    ok($slot);
}

// POST — создать слот (только admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'slot_date', 'start_time', 'price']);

    $db   = getDB();
    $stmt = $db->prepare('INSERT INTO slots (library_id,name,category,slot_date,start_time,duration,trainer_id,price,max_people)
                          VALUES (?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $d['library_id']  ?? null,
        $d['name'],
        $d['category']    ?? 'training',
        $d['slot_date'],
        $d['start_time'],
        $d['duration']    ?? 60,
        $d['trainer_id']  ?? null,
        $d['price'],
        $d['max_people']  ?? 12,
    ]);
    ok(['id' => $db->lastInsertId()], 'Слот создан');
}

// PUT — обновить слот (только admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    $db   = getDB();
    $stmt = $db->prepare('UPDATE slots SET name=?,category=?,slot_date=?,start_time=?,duration=?,trainer_id=?,price=?,max_people=? WHERE id=?');
    $stmt->execute([
        $d['name'],    $d['category'], $d['slot_date'],
        $d['start_time'], $d['duration'] ?? 60,
        $d['trainer_id'] ?? null, $d['price'],
        $d['max_people'] ?? 12, $id,
    ]);
    ok(null, 'Слот обновлён');
}

// DELETE — удалить слот (только admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE slots SET active=0 WHERE id=?')->execute([$id]);
    ok(null, 'Слот удалён');
}

err('Неизвестный endpoint', 404);
