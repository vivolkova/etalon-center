<?php
// api/locations.php — Филиалы (локации). Публичный список для выпадающих списков.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Вместимость — не больше числа мест на схеме зала (колонки × ряды): каждому месту нужна клетка
function checkCapacity(array $d): void {
    $cells = (int)$d['hall_cols'] * (int)$d['hall_rows'];
    if ((int)$d['max_people'] < 1) err('Вместимость должна быть не меньше 1');
    if ((int)$d['max_people'] > $cells) {
        err('Вместимость (' . (int)$d['max_people'] . ') больше числа мест на схеме зала (' . (int)$d['hall_cols'] . '×' . (int)$d['hall_rows'] . ' = ' . $cells . ')');
    }
}

// GET ?action=list — филиалы. По умолчанию только активные; ?all=1 (admin) — все.
if ($method === 'GET' && $action === 'list') {
    $all = !empty($_GET['all']);
    if ($all) authAdmin();
    $db = getDB();
    $where = $all ? '1' : 'active = 1';
    ok($db->query('SELECT id, name, address, hall_cols, hall_rows, max_people, email, phone, work_hours, active
                   FROM locations WHERE ' . $where . ' ORDER BY id')->fetchAll());
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
    require_fields($d, ['name', 'address', 'email', 'phone', 'hall_cols', 'hall_rows', 'max_people']);
    checkCapacity($d);
    $db = getDB();
    $workHours = isset($d['work_hours']) && is_array($d['work_hours'])
        ? json_encode(array_values($d['work_hours']), JSON_UNESCAPED_UNICODE)
        : null;
    $stmt = $db->prepare('INSERT INTO locations (name, address, hall_cols, hall_rows, max_people, email, phone, work_hours, timezone, active)
                          VALUES (?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $d['name'],
        $d['address'],
        (int)$d['hall_cols'],
        (int)$d['hall_rows'],
        (int)$d['max_people'],
        $d['email'],
        $d['phone'],
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
    require_fields($d, ['name', 'address', 'email', 'phone', 'hall_cols', 'hall_rows', 'max_people']);
    checkCapacity($d);
    $db = getDB();
    // Вместимость нельзя уменьшить ниже числа активных станков филиала.
    // Проверяем только при уменьшении — чтобы при уже превышенном лимите можно было править остальные поля.
    $cnt = $db->prepare('SELECT (SELECT COUNT(*) FROM stations WHERE location_id = l.id AND active = 1) AS active_cnt, l.max_people
                         FROM locations l WHERE l.id = ?');
    $cnt->execute([$id]);
    $cur = $cnt->fetch();
    if (!$cur) err('Филиал не найден', 404);
    $activeStations = (int)$cur['active_cnt'];
    if ((int)$d['max_people'] < (int)$cur['max_people'] && (int)$d['max_people'] < $activeStations) {
        err('В филиале ' . $activeStations . ' активных станков — вместимость не может быть меньше. Сначала выключите лишние станки (Настройки → Станки и зал).');
    }
    $workHours = isset($d['work_hours']) && is_array($d['work_hours'])
        ? json_encode(array_values($d['work_hours']), JSON_UNESCAPED_UNICODE)
        : null;
    $stmt = $db->prepare('UPDATE locations SET name=?, address=?, hall_cols=?, hall_rows=?, max_people=?, email=?, phone=?, work_hours=?, timezone=?, active=? WHERE id=?');
    $stmt->execute([
        $d['name'],
        $d['address'],
        (int)$d['hall_cols'],
        (int)$d['hall_rows'],
        (int)$d['max_people'],
        $d['email'],
        $d['phone'],
        $workHours,
        $d['timezone'] ?? 'Europe/Moscow',
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
        $id,
    ]);
    ok(null, 'Филиал обновлён');
}

err('Неизвестный endpoint', 404);
