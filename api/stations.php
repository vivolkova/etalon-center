<?php
// api/stations.php — Станки и их доступность (тип берётся из справочника station_types)
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET ?action=list — активные станки филиала (для схемы/админки), с типом и иконкой
if ($method === 'GET' && $action === 'list') {
    $locationId = (int)($_GET['location_id'] ?? 1);
    $db = getDB();
    $stmt = $db->prepare('
        SELECT s.id, s.location_id, s.label, s.pos_x, s.pos_y, s.sort_order, s.active,
               s.type_id, t.name AS type_name, t.icon AS icon
        FROM stations s
        JOIN station_types t ON s.type_id = t.id
        WHERE s.location_id = ? AND s.active = 1
        ORDER BY s.sort_order, s.id
    ');
    $stmt->execute([$locationId]);
    ok($stmt->fetchAll());
}

// GET ?action=types — справочник типов станков (для админки)
if ($method === 'GET' && $action === 'types') {
    $db = getDB();
    ok($db->query('SELECT id, name, code, icon, sort_order, active FROM station_types ORDER BY sort_order, id')->fetchAll());
}

// GET ?action=availability&slot_id=X — станки со статусом на слот (free/taken/blocked)
if ($method === 'GET' && $action === 'availability') {
    $slotId = (int)($_GET['slot_id'] ?? 0);
    if (!$slotId) err('Не указан slot_id');

    $db = getDB();
    $stmt = $db->prepare('SELECT id, location_id FROM slots WHERE id = ? AND active = 1');
    $stmt->execute([$slotId]);
    $slot = $stmt->fetch();
    if (!$slot) err('Слот не найден', 404);

    $stmt = $db->prepare('
        SELECT s.id, s.label, s.pos_x, s.pos_y, s.sort_order,
               s.type_id, t.name AS type_name, t.icon AS icon,
               CASE
                   WHEN blk.id IS NOT NULL THEN "blocked"
                   WHEN bk.id IS NOT NULL  THEN "taken"
                   ELSE "free"
               END AS state
        FROM stations s
        JOIN station_types t ON s.type_id = t.id
        LEFT JOIN slot_station_blocks blk ON blk.station_id = s.id AND blk.slot_id = ?
        LEFT JOIN bookings bk ON bk.station_id = s.id AND bk.slot_id = ? AND bk.status <> "cancelled"
        WHERE s.location_id = ? AND s.active = 1
        ORDER BY s.sort_order, s.id
    ');
    $stmt->execute([$slotId, $slotId, (int)$slot['location_id']]);
    $stations = $stmt->fetchAll();

    // Размер сетки зала (колонки × ряды) берём из филиала
    $lc = $db->prepare('SELECT hall_cols, hall_rows FROM locations WHERE id = ?');
    $lc->execute([(int)$slot['location_id']]);
    $loc = $lc->fetch();

    ok([
        'cols'     => (int)($loc['hall_cols'] ?? 6),
        'rows'     => (int)($loc['hall_rows'] ?? 2),
        'stations' => $stations,
    ]);
}

// POST ?action=create — создать станок (admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['type_id', 'label']);
    $typeId = (int)$d['type_id'];

    $db = getDB();
    // Тип должен существовать в справочнике
    $stmt = $db->prepare('SELECT id FROM station_types WHERE id = ?');
    $stmt->execute([$typeId]);
    if (!$stmt->fetch()) err('Неизвестный тип станка');

    $stmt = $db->prepare('
        INSERT INTO stations (location_id, type_id, label, pos_x, pos_y, sort_order, active)
        VALUES (?,?,?,?,?,?,?)
    ');
    $stmt->execute([
        (int)($d['location_id'] ?? 1),
        $typeId,
        $d['label'],
        (int)($d['pos_x'] ?? 0),
        (int)($d['pos_y'] ?? 0),
        (int)($d['sort_order'] ?? 0),
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
    ]);
    ok(['id' => (int)$db->lastInsertId()], 'Станок создан');
}

// PUT ?action=update — обновить станок (admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    $fields = [];
    $params = [];
    foreach (['type_id', 'label', 'pos_x', 'pos_y', 'sort_order', 'active'] as $f) {
        if (array_key_exists($f, $d)) {
            $fields[] = "$f = ?";
            $params[] = in_array($f, ['type_id', 'pos_x', 'pos_y', 'sort_order', 'active'], true)
                ? (int)$d[$f]
                : $d[$f];
        }
    }
    if (!$fields) err('Нет данных для обновления');

    $params[] = $id;
    $db = getDB();
    $db->prepare('UPDATE stations SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
    ok(null, 'Станок обновлён');
}

// DELETE ?action=delete&id=X — удалить станок (admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $stmt = $db->prepare('SELECT COUNT(*) AS c FROM bookings WHERE station_id = ?');
    $stmt->execute([$id]);
    if ((int)$stmt->fetch()['c'] > 0) {
        $db->prepare('UPDATE stations SET active = 0 WHERE id = ?')->execute([$id]);
        ok(null, 'На станок есть брони — помечен неактивным вместо удаления');
    }
    $db->prepare('DELETE FROM stations WHERE id = ?')->execute([$id]);
    ok(null, 'Станок удалён');
}

// POST ?action=block — заблокировать станок на слот (admin)
if ($method === 'POST' && $action === 'block') {
    authAdmin();
    $d = input();
    require_fields($d, ['slot_id', 'station_id']);
    $db = getDB();
    try {
        $stmt = $db->prepare('INSERT INTO slot_station_blocks (slot_id, station_id, reason) VALUES (?,?,?)');
        $stmt->execute([(int)$d['slot_id'], (int)$d['station_id'], $d['reason'] ?? null]);
        ok(['id' => (int)$db->lastInsertId()], 'Станок заблокирован на слот');
    } catch (PDOException $e) {
        err('Станок уже заблокирован на этот слот');
    }
}

// DELETE ?action=unblock&slot_id=X&station_id=Y — снять блокировку (admin)
if ($method === 'DELETE' && $action === 'unblock') {
    authAdmin();
    $slotId    = (int)($_GET['slot_id'] ?? 0);
    $stationId = (int)($_GET['station_id'] ?? 0);
    if (!$slotId || !$stationId) err('Нужны slot_id и station_id');
    $db = getDB();
    $db->prepare('DELETE FROM slot_station_blocks WHERE slot_id = ? AND station_id = ?')
       ->execute([$slotId, $stationId]);
    ok(null, 'Блокировка снята');
}

err('Неизвестный endpoint', 404);
