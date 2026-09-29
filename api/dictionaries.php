<?php
// api/dictionaries.php — Справочники (общие) и в каких филиалах доступно значение.
// Редактировать можно только прикладные группы; системные (роли, типы слотов) — только чтение:
// на их коды опирается код приложения.
// Доступность по филиалам (прикладные группы): значение доступно только в филиалах с активной строкой
// location_dictionaries — всегда явным списком, хотя бы один филиал.
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

// Филиалы значения из запроса: [location_id…] — хотя бы один, существующий
function dictLocations(PDO $db, array $d): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)($d['location_ids'] ?? [])))));
    if (!$ids) err('Выберите хотя бы один филиал');
    $st = $db->prepare('SELECT COUNT(*) FROM locations WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $st->execute($ids);
    if ((int)$st->fetchColumn() !== count($ids)) err('Филиал не найден', 404);
    return $ids;
}

// Заменить список филиалов значения: убранные — active = 0, выбранные — active = 1
function saveDictLocations(PDO $db, int $dictId, array $locIds): void {
    $db->prepare('UPDATE location_dictionaries SET active = 0 WHERE dictionary_id = ?')->execute([$dictId]);
    $ins = $db->prepare('INSERT INTO location_dictionaries (dictionary_id, location_id, active) VALUES (?, ?, 1)
                         ON DUPLICATE KEY UPDATE active = 1');
    foreach ($locIds as $l) $ins->execute([$dictId, $l]);
}

// GET ?action=list[&group=...] — значения справочников (публичный).
// location_ids — в каких филиалах доступно значение; editable — можно ли менять на экране «Справочники».
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    $sql = 'SELECT d.id, d.group_code, d.code, d.name, d.active, d.ref_id,
                   r.code AS ref_code, r.name AS ref_name,
                   (SELECT GROUP_CONCAT(ld.location_id ORDER BY ld.location_id) FROM location_dictionaries ld
                     WHERE ld.dictionary_id = d.id AND ld.active = 1) AS location_ids
            FROM dictionaries d
            LEFT JOIN dictionaries r ON r.id = d.ref_id';
    $params = [];
    if (!empty($_GET['group'])) { $sql .= ' WHERE d.group_code = ?'; $params[] = $_GET['group']; }
    $sql .= ' ORDER BY d.group_code, d.id';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok(array_map(function ($r) {
        $r['id'] = (int)$r['id'];
        $r['active'] = (int)$r['active'];
        $r['location_ids'] = $r['location_ids'] !== null ? array_map('intval', explode(',', $r['location_ids'])) : [];
        $r['ref_id'] = $r['ref_id'] !== null ? (int)$r['ref_id'] : null;
        $r['editable'] = in_array($r['group_code'], DICT_EDITABLE, true);
        return $r;
    }, $stmt->fetchAll()));
}

// GET ?action=availability — филиалы значений прикладных групп: [{dictionary_id, location_ids}] (публичный, для форм)
if ($method === 'GET' && $action === 'availability') {
    $db = getDB();
    $rows = $db->query('SELECT d.id, (SELECT GROUP_CONCAT(ld.location_id) FROM location_dictionaries ld WHERE ld.dictionary_id = d.id AND ld.active = 1) AS locs
                        FROM dictionaries d WHERE d.group_code IN (\'' . implode("','", DICT_EDITABLE) . '\')')->fetchAll();
    ok(array_map(fn($r) => [
        'dictionary_id' => (int)$r['id'],
        'location_ids'  => $r['locs'] !== null ? array_map('intval', explode(',', $r['locs'])) : [],
    ], $rows));
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
    $locIds = dictLocations($db, $d);
    $db->beginTransaction();
    try {
        $db->prepare('INSERT INTO dictionaries (group_code, code, name, ref_id, active) VALUES (?,?,?,?,?)')
           ->execute([$d['group_code'], $d['code'], $d['name'], $ref, isset($d['active']) ? (int)(bool)$d['active'] : 1]);
    } catch (PDOException $e) {
        $db->rollBack();
        err('Значение с таким кодом уже есть');
    }
    $id = (int)$db->lastInsertId();
    saveDictLocations($db, $id, $locIds);
    $db->commit();
    ok(['id' => $id], 'Значение добавлено');
}

// PUT ?action=update — изменить название / связь / филиалы / активность (admin). Код и группа не меняются.
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
    $locIds = dictLocations($db, $d);
    $db->beginTransaction();
    $db->prepare('UPDATE dictionaries SET name = ?, ref_id = ?, active = ? WHERE id = ?')
       ->execute([$d['name'], $ref, isset($d['active']) ? (int)(bool)$d['active'] : 1, $id]);
    saveDictLocations($db, $id, $locIds);
    $db->commit();
    ok(null, 'Значение обновлено');
}

err('Неизвестный endpoint', 404);
