<?php
// api/specialists.php — Специалисты (тренеры, байкфиттеры, мастера)
// Специалист не привязан к филиалу (филиал — у интервалов графика), типов может быть несколько.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/specialist_hours.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Коды типов специалиста -> id справочника specialist_type; нужен хотя бы один, неизвестный код — ошибка
function specTypeIds(PDO $db, $codes): array {
    $codes = array_values(array_unique(array_filter(array_map('strval', is_array($codes) ? $codes : []))));
    if (!$codes) err('Укажите специализацию');
    $st = $db->prepare('SELECT code, id FROM dictionaries WHERE group_code = ? AND code IN ('
        . implode(',', array_fill(0, count($codes), '?')) . ')');
    $st->execute(array_merge(['specialist_type'], $codes));
    $ids = $st->fetchAll(PDO::FETCH_KEY_PAIR);
    foreach ($codes as $c) if (!isset($ids[$c])) err('Неизвестный тип специалиста: ' . $c);
    return array_map('intval', array_values($ids));
}

// Заменить набор типов специалиста (связи specialist_types): снятые — active = 0, выбранные — active = 1
function saveSpecTypes(PDO $db, int $specId, array $typeIds): void {
    $db->prepare('UPDATE specialist_types SET active = 0 WHERE specialist_id = ?')->execute([$specId]);
    $ins = $db->prepare('INSERT INTO specialist_types (specialist_id, type_id, active) VALUES (?, ?, 1)
                         ON DUPLICATE KEY UPDATE active = 1');
    foreach ($typeIds as $t) $ins->execute([$specId, $t]);
}

// GET — список специалистов (публичный). types — коды типов; location_ids — филиалы, где специалист работает
// по графику и особым часам (с сегодняшнего дня); для админки (all=1) ещё актуальные периоды графика и исключения
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    $all = !empty($_GET['all']);
    if ($all) authAdmin();
    $where = $all ? '1' : 'sp.active = 1';
    $stmt = $db->prepare('
        SELECT sp.*,
               (SELECT GROUP_CONCAT(d.code ORDER BY d.id) FROM specialist_types stp
                  JOIN dictionaries d ON d.id = stp.type_id WHERE stp.specialist_id = sp.id AND stp.active = 1) AS types,
               (SELECT COUNT(*) FROM slots s WHERE s.specialist_id = sp.id AND s.active = 1) AS sessions_count
        FROM specialists sp
        WHERE ' . $where . '
        ORDER BY sp.id
    ');
    $stmt->execute();
    $rows = $stmt->fetchAll();
    $hours = specialistsHoursMap($db, null, date('Y-m-d'));
    foreach ($rows as &$r) {
        $r['types'] = $r['types'] !== null ? explode(',', $r['types']) : [];
        $h = $hours[$r['id']] ?? [];
        $r['location_ids'] = specLocationIds($h);
        if ($all) {
            $r['schedules']  = $h['schedules'] ?? [];
            $r['exceptions'] = $h['exceptions'] ?? [];
        }
    }
    unset($r);
    ok($rows);
}

// POST — создать специалиста (admin): {name, full_name, types:[коды] — специализация, experience, active}
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'full_name']);
    $db = getDB();
    $typeIds = specTypeIds($db, $d['types'] ?? []);
    $db->beginTransaction();
    $stmt = $db->prepare('INSERT INTO specialists (name,full_name,experience,active) VALUES (?,?,?,?)');
    $stmt->execute([
        $d['name'], $d['full_name'], $d['experience'] ?? 0,
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
    ]);
    $id = (int)$db->lastInsertId();
    saveSpecTypes($db, $id, $typeIds);
    $db->commit();
    ok(['id' => $id], 'Специалист добавлен');
}

// PUT — обновить специалиста (admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d = input();
    require_fields($d, ['id', 'name', 'full_name']);
    $db = getDB();
    $id = (int)$d['id'];
    $typeIds = specTypeIds($db, $d['types'] ?? []);
    $db->beginTransaction();
    $db->prepare('UPDATE specialists SET name=?,full_name=?,experience=?,active=? WHERE id=?')
       ->execute([
           $d['name'], $d['full_name'], $d['experience'] ?? 0,
           isset($d['active']) ? (int)(bool)$d['active'] : 1,
           $id,
       ]);
    saveSpecTypes($db, $id, $typeIds);
    $db->commit();
    ok(null, 'Специалист обновлён');
}

// DELETE — мягкое удаление (admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    $db = getDB();
    $db->prepare('UPDATE specialists SET active=0 WHERE id=?')->execute([$id]);
    ok(null, 'Специалист удалён');
}

err('Неизвестный endpoint', 404);
