<?php
// api/stations.php — Станки и их доступность (тип берётся из справочника station_types)
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Нарушение уникальности названия типа станка (uq_station_type_name). Иную ошибку БД пробрасываем.
function stationTypeDuplicate(PDOException $e): never {
    if (str_contains($e->getMessage(), 'uq_station_type_name')) err('Тип с таким названием уже есть');
    throw $e;
}

// Активных станков в филиале не больше вместимости зала (locations.max_people).
// Выключенные станки в лимит не входят. $exceptId — станок, который сейчас включают (не считать дважды).
function checkStationLimit(PDO $db, int $locId, int $exceptId = 0): void {
    $st = $db->prepare('SELECT l.max_people,
                               (SELECT COUNT(*) FROM stations s WHERE s.location_id = l.id AND s.active = 1 AND s.id <> ?) AS active_cnt
                        FROM locations l WHERE l.id = ?');
    $st->execute([$exceptId, $locId]);
    $r = $st->fetch();
    if (!$r) err('Филиал не найден', 404);
    if ((int)$r['active_cnt'] >= (int)$r['max_people']) {
        err('В филиале уже ' . (int)$r['active_cnt'] . ' активных станков — это вместимость зала (' . (int)$r['max_people'] .
            '). Выключите другой станок или увеличьте вместимость в настройках филиала.');
    }
}

// GET ?action=list — станки филиала (для схемы/админки), с типом и иконкой.
// all=1 (admin) — вместе с неактивными.
if ($method === 'GET' && $action === 'list') {
    $locationId = (int)($_GET['location_id'] ?? 1);
    $all = !empty($_GET['all']);
    if ($all) authAdmin();   // зал любого филиала администратор видит (и администратор студии — чужой); менять — право hall в своём филиале
    $db = getDB();
    $stmt = $db->prepare('
        SELECT s.id, s.location_id, s.label, s.pos_x, s.pos_y, s.sort_order, s.active,
               s.type_id, t.name AS type_name, t.icon AS icon
        FROM stations s
        JOIN station_type t ON s.type_id = t.id
        WHERE s.location_id = ?' . ($all ? '' : ' AND s.active = 1') . '
        ORDER BY s.sort_order, s.id
    ');
    $stmt->execute([$locationId]);
    ok($stmt->fetchAll());
}

// GET ?action=types — справочник типов станков (общий для всех филиалов);
// stations_count — сколько станков этого типа (во всех филиалах)
if ($method === 'GET' && $action === 'types') {
    $db = getDB();
    ok($db->query('SELECT t.id, t.name, t.icon, t.active, COUNT(s.id) AS stations_count
                   FROM station_type t LEFT JOIN stations s ON s.type_id = t.id
                   GROUP BY t.id ORDER BY t.id')->fetchAll());
}

// POST ?action=type_create — новый тип станка (admin)
if ($method === 'POST' && $action === 'type_create') {
    authCan('system');
    $d = input();
    require_fields($d, ['name']);
    $db = getDB();
    try {
        $db->prepare('INSERT INTO station_type (name, icon, active) VALUES (?,?,?)')
           ->execute([$d['name'], $d['icon'] ?? null, isset($d['active']) ? (int)(bool)$d['active'] : 1]);
    } catch (PDOException $e) {
        stationTypeDuplicate($e);
    }
    ok(['id' => (int)$db->lastInsertId()], 'Тип станка добавлен');
}

// PUT ?action=type_update — изменить тип станка (admin)
if ($method === 'PUT' && $action === 'type_update') {
    authCan('system');
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    require_fields($d, ['name']);
    $db = getDB();
    try {
        $db->prepare('UPDATE station_type SET name = ?, icon = ?, active = ? WHERE id = ?')
           ->execute([$d['name'], $d['icon'] ?? null, isset($d['active']) ? (int)(bool)$d['active'] : 1, $id]);
    } catch (PDOException $e) {
        stationTypeDuplicate($e);
    }
    ok(null, 'Тип станка обновлён');
}

// DELETE ?action=type_delete&id=X — удалить тип (admin); если есть станки этого типа — только выключить
if ($method === 'DELETE' && $action === 'type_delete') {
    authCan('system');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $stmt = $db->prepare('SELECT COUNT(*) FROM stations WHERE type_id = ?');
    $stmt->execute([$id]);
    if ((int)$stmt->fetchColumn() > 0) {
        $db->prepare('UPDATE station_type SET active = 0 WHERE id = ?')->execute([$id]);
        ok(null, 'Есть станки этого типа — тип выключен вместо удаления');
    }
    $db->prepare('DELETE FROM station_type WHERE id = ?')->execute([$id]);
    ok(null, 'Тип станка удалён');
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
               s.type_id, t.name AS type_name, t.icon AS icon, blk.reason AS block_reason,
               CASE
                   WHEN blk.id IS NOT NULL THEN "blocked"
                   WHEN bk.id IS NOT NULL  THEN "taken"
                   ELSE "free"
               END AS state
        FROM stations s
        JOIN station_type t ON s.type_id = t.id
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
    $user = authCan('hall');
    $d = input();
    require_fields($d, ['type_id', 'label', 'location_id']);
    branchGuard($user, (int)$d['location_id']);
    $typeId = (int)$d['type_id'];

    $db = getDB();
    // Тип должен существовать в справочнике
    $stmt = $db->prepare('SELECT id FROM station_type WHERE id = ?');
    $stmt->execute([$typeId]);
    if (!$stmt->fetch()) err('Неизвестный тип станка');
    $active = isset($d['active']) ? (int)(bool)$d['active'] : 1;
    if ($active) checkStationLimit($db, (int)$d['location_id']);

    $stmt = $db->prepare('
        INSERT INTO stations (location_id, type_id, label, pos_x, pos_y, sort_order, active)
        VALUES (?,?,?,?,?,?,?)
    ');
    $stmt->execute([
        (int)$d['location_id'],
        $typeId,
        $d['label'],
        (int)($d['pos_x'] ?? 0),
        (int)($d['pos_y'] ?? 0),
        (int)($d['sort_order'] ?? 0),
        $active,
    ]);
    ok(['id' => (int)$db->lastInsertId()], 'Станок создан');
}

// PUT ?action=update — обновить станок (admin)
if ($method === 'PUT' && $action === 'update') {
    $user = authCan('hall');
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    branchGuard($user, stationBranch(getDB(), $id));

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
    // Включение станка — только в пределах вместимости зала
    if (!empty($d['active'])) {
        $loc = $db->prepare('SELECT location_id FROM stations WHERE id = ?');
        $loc->execute([$id]);
        $locId = $loc->fetchColumn();
        if ($locId === false) err('Станок не найден', 404);
        checkStationLimit($db, (int)$locId, $id);
    }
    $db->prepare('UPDATE stations SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
    ok(null, 'Станок обновлён');
}

// PUT ?action=move — переставить станок на схеме зала (admin): {id, pos_x, pos_y}.
// Если клетка занята другим станком филиала — меняются местами (в одной транзакции).
if ($method === 'PUT' && $action === 'move') {
    $user = authCan('hall');
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id || !isset($d['pos_x'], $d['pos_y'])) err('Нужны id, pos_x, pos_y');
    branchGuard($user, stationBranch(getDB(), $id));
    $x = (int)$d['pos_x']; $y = (int)$d['pos_y'];
    $db = getDB();
    $st = $db->prepare('SELECT s.id, s.location_id, s.pos_x, s.pos_y, l.hall_cols, l.hall_rows
                        FROM stations s JOIN locations l ON l.id = s.location_id WHERE s.id = ?');
    $st->execute([$id]);
    $me = $st->fetch();
    if (!$me) err('Станок не найден', 404);
    if ($x < 0 || $y < 0 || $x >= (int)$me['hall_cols'] || $y >= (int)$me['hall_rows']) err('Клетка вне схемы зала');

    $db->beginTransaction();
    $o = $db->prepare('SELECT id FROM stations WHERE location_id = ? AND pos_x = ? AND pos_y = ? AND id <> ?');
    $o->execute([(int)$me['location_id'], $x, $y, $id]);
    $other = $o->fetchColumn();
    if ($other) {
        $db->prepare('UPDATE stations SET pos_x = ?, pos_y = ? WHERE id = ?')
           ->execute([(int)$me['pos_x'], (int)$me['pos_y'], (int)$other]);
    }
    $db->prepare('UPDATE stations SET pos_x = ?, pos_y = ? WHERE id = ?')->execute([$x, $y, $id]);
    $db->commit();
    ok(null, $other ? 'Станки поменялись местами' : 'Станок перемещён');
}

// DELETE ?action=delete&id=X — удалить станок (admin)
if ($method === 'DELETE' && $action === 'delete') {
    $user = authCan('hall');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    branchGuard($user, stationBranch($db, $id));
    $stmt = $db->prepare('SELECT COUNT(*) AS c FROM bookings WHERE station_id = ?');
    $stmt->execute([$id]);
    if ((int)$stmt->fetch()['c'] > 0) {
        $db->prepare('UPDATE stations SET active = 0 WHERE id = ?')->execute([$id]);
        ok(null, 'На станок есть брони — помечен неактивным вместо удаления');
    }
    $db->prepare('DELETE FROM stations WHERE id = ?')->execute([$id]);
    ok(null, 'Станок удалён');
}

// POST ?action=blocks {slot_id, block: [id станка…], unblock: [id станка…], reason} — заблокировать и разблокировать
// станки на занятие одним запросом и одной транзакцией (право blocks, занятие — своего филиала).
// Станки — только из филиала занятия; уже заблокированный станок повторно не добавляется
if ($method === 'POST' && $action === 'blocks') {
    $user = authCan('blocks');
    $d = input();
    $slotId = (int)($d['slot_id'] ?? 0);
    if (!$slotId) err('Не указано занятие');
    $ids = fn($list) => array_values(array_unique(array_filter(array_map('intval', is_array($list) ? $list : []))));
    $block = $ids($d['block'] ?? []);
    $unblock = $ids($d['unblock'] ?? []);
    $db = getDB();
    $locId = slotBranch($db, $slotId);
    branchGuard($user, $locId);
    $all = array_values(array_unique(array_merge($block, $unblock)));
    if ($all) {
        $in = implode(',', array_fill(0, count($all), '?'));
        $st = $db->prepare('SELECT COUNT(*) FROM stations WHERE location_id = ? AND id IN (' . $in . ')');
        $st->execute(array_merge([$locId], $all));
        if ((int)$st->fetchColumn() !== count($all)) err('Станок и занятие — из разных филиалов');
    }
    $db->beginTransaction();
    if ($unblock) {
        $in = implode(',', array_fill(0, count($unblock), '?'));
        $db->prepare('DELETE FROM slot_station_blocks WHERE slot_id = ? AND station_id IN (' . $in . ')')->execute(array_merge([$slotId], $unblock));
    }
    if ($block) {
        $reason = isset($d['reason']) && $d['reason'] !== '' ? (string)$d['reason'] : null;
        $rows = implode(',', array_fill(0, count($block), '(?,?,?)'));
        $args = [];
        foreach ($block as $stationId) array_push($args, $slotId, $stationId, $reason);
        $db->prepare('INSERT IGNORE INTO slot_station_blocks (slot_id, station_id, reason) VALUES ' . $rows)->execute($args);
    }
    $db->commit();
    ok(null, 'Блокировки сохранены');
}

err('Неизвестный endpoint', 404);
