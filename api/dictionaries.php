<?php
// api/dictionaries.php — Справочники (общие) и их доступность по филиалам (location_dictionaries).
// Редактировать можно только прикладные группы; системные (роли, типы слотов) — только чтение:
// на их коды опирается код приложения.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

const DICT_EDITABLE = ['activity_category', 'specialist_type'];

function dictRow(PDO $db, int $id): array {
    $st = $db->prepare('SELECT id, group_code, code FROM dictionaries WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) err('Значение справочника не найдено', 404);
    return $row;
}

// ref_id допустим только для activity_category и только на specialist_type
function checkRef(PDO $db, string $group, $refId): ?int {
    if ($refId === null || $refId === '' || (int)$refId === 0) return null;
    if ($group !== 'activity_category') err('Связь с типом специалиста задаётся только для категорий');
    $ref = dictRow($db, (int)$refId);
    if ($ref['group_code'] !== 'specialist_type') err('Связь должна указывать на тип специалиста');
    return (int)$refId;
}

// GET ?action=list[&location_id=X][&group=...] — значения справочников (публичный).
// loc_active — доступно ли в филиале (нет строки в location_dictionaries — доступно).
// editable — можно ли менять значение на экране «Справочники».
if ($method === 'GET' && $action === 'list') {
    $db    = getDB();
    $locId = (int)($_GET['location_id'] ?? 0);
    $sql = 'SELECT d.id, d.group_code, d.code, d.name, d.active, d.ref_id,
                   r.code AS ref_code, r.name AS ref_name,
                   COALESCE(ld.active, 1) AS loc_active
            FROM dictionaries d
            LEFT JOIN dictionaries r ON r.id = d.ref_id
            LEFT JOIN location_dictionaries ld ON ld.dictionary_id = d.id AND ld.location_id = ?';
    $params = [$locId];
    if (!empty($_GET['group'])) { $sql .= ' WHERE d.group_code = ?'; $params[] = $_GET['group']; }
    $sql .= ' ORDER BY d.group_code, d.id';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok(array_map(function ($r) {
        $r['id'] = (int)$r['id'];
        $r['active'] = (int)$r['active'];
        $r['loc_active'] = (int)$r['loc_active'];
        $r['ref_id'] = $r['ref_id'] !== null ? (int)$r['ref_id'] : null;
        $r['editable'] = in_array($r['group_code'], DICT_EDITABLE, true);
        return $r;
    }, $stmt->fetchAll()));
}

// GET ?action=availability — где что отключено: [{dictionary_id, location_id}] (публичный, для форм)
if ($method === 'GET' && $action === 'availability') {
    $db = getDB();
    $rows = $db->query('SELECT dictionary_id, location_id FROM location_dictionaries WHERE active = 0')->fetchAll();
    ok(array_map(fn($r) => ['dictionary_id' => (int)$r['dictionary_id'], 'location_id' => (int)$r['location_id']], $rows));
}

// POST ?action=create — новое значение прикладной группы (admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['group_code', 'code', 'name']);
    if (!in_array($d['group_code'], DICT_EDITABLE, true)) err('Эту группу справочника менять нельзя');
    if (!preg_match('/^[a-z][a-z0-9_]{1,39}$/', $d['code'])) err('Код — латиница в нижнем регистре, цифры и _ (например, massage)');
    $db = getDB();
    $ref = checkRef($db, $d['group_code'], $d['ref_id'] ?? null);
    try {
        $db->prepare('INSERT INTO dictionaries (group_code, code, name, ref_id, active) VALUES (?,?,?,?,?)')
           ->execute([$d['group_code'], $d['code'], $d['name'], $ref, isset($d['active']) ? (int)(bool)$d['active'] : 1]);
    } catch (PDOException $e) {
        err('Значение с таким кодом уже есть');
    }
    ok(['id' => (int)$db->lastInsertId()], 'Значение добавлено');
}

// PUT ?action=update — изменить название / связь / активность (admin). Код и группа не меняются.
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    require_fields($d, ['name']);
    $db  = getDB();
    $row = dictRow($db, $id);
    if (!in_array($row['group_code'], DICT_EDITABLE, true)) err('Эту группу справочника менять нельзя');
    $ref = checkRef($db, $row['group_code'], $d['ref_id'] ?? null);
    $db->prepare('UPDATE dictionaries SET name = ?, ref_id = ?, active = ? WHERE id = ?')
       ->execute([$d['name'], $ref, isset($d['active']) ? (int)(bool)$d['active'] : 1, $id]);
    ok(null, 'Значение обновлено');
}

// PUT ?action=location — доступность значения в филиале (admin): {location_id, dictionary_id, active}
if ($method === 'PUT' && $action === 'location') {
    authAdmin();
    $d = input();
    require_fields($d, ['location_id', 'dictionary_id']);
    $db  = getDB();
    $row = dictRow($db, (int)$d['dictionary_id']);
    if (!in_array($row['group_code'], DICT_EDITABLE, true)) err('Для этой группы доступность по филиалам не задаётся');
    $db->prepare('INSERT INTO location_dictionaries (location_id, dictionary_id, active) VALUES (?,?,?)
                  ON DUPLICATE KEY UPDATE active = VALUES(active)')
       ->execute([(int)$d['location_id'], (int)$d['dictionary_id'], !empty($d['active']) ? 1 : 0]);
    ok(null, !empty($d['active']) ? 'Доступно в филиале' : 'Отключено в филиале');
}

err('Неизвестный endpoint', 404);
