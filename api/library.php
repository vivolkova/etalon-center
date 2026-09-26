<?php
// api/library.php — Библиотека тренировок и услуг.
// Единый источник описаний: слоты ссылаются на строку library через slots.library_id.
// В БД хранятся коды (category, difficulty), русские подписи — только на фронте.
// Тренировка или услуга — по категории: activity_category = 'training' — тренировка, остальные — услуги.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// код значения справочника -> id (ошибка, если кода нет)
function libDictId($db, $group, $code) {
    $st = $db->prepare('SELECT id FROM dictionaries WHERE group_code = ? AND code = ?');
    $st->execute([$group, $code]);
    $id = $st->fetchColumn();
    if ($id === false) err('Неизвестное значение справочника ' . $group . ': ' . $code);
    return (int)$id;
}

// строка БД -> объект в терминах фронтенда (dur/max/desc/cat/features)
function libRow($r) {
    return [
        'id'          => (int)$r['id'],
        'location_id' => (int)$r['location_id'],
        'name'       => $r['name'],
        'cat'        => $r['cat'],                  // activity_category: training | bikefit | workshop | …
        'dur'        => (int)$r['duration'],
        'price'      => (int)$r['price'],
        'max'        => $r['max_people'] !== null ? (int)$r['max_people'] : null,
        'difficulty' => $r['difficulty'],           // код: any | beginner | intermediate | advanced
        'desc'       => $r['summary'] ?? '',
        'features'   => $r['details'] ? json_decode($r['details'], true) : [],
        'active'     => (int)$r['active'],
    ];
}

$LIST_SQL = 'SELECT l.id, l.name, l.location_id, l.duration, l.price, loc.max_people, l.difficulty,
                    l.summary, l.details, l.active,
                    dc.code AS cat
             FROM library l
             JOIN dictionaries dc ON l.category_id = dc.id
             JOIN locations   loc ON l.location_id = loc.id';

// GET — список (публичный; нужен и форме слота, и экрану «Библиотека»)
// kind=training — только тренировки, kind=service — только услуги (все категории, кроме training)
if ($method === 'GET' && $action === 'list') {
    $db  = getDB();
    $all = !empty($_GET['all']);
    if ($all) authAdmin();
    $sql = $LIST_SQL . ($all ? ' WHERE 1' : ' WHERE l.active = 1');
    $kind = $_GET['kind'] ?? '';
    if ($kind === 'training') $sql .= " AND dc.code = 'training'";
    if ($kind === 'service')  $sql .= " AND dc.code <> 'training'";
    $sql .= ' ORDER BY l.id';
    $stmt = $db->prepare($sql);
    $stmt->execute();
    ok(array_map('libRow', $stmt->fetchAll()));
}

// GET — категории активностей (activity_category) для фильтров и формы.
// spec_type / spec_name — тип специалиста, который ведёт категорию (dictionaries.ref_id).
if ($method === 'GET' && $action === 'categories') {
    $db   = getDB();
    $stmt = $db->prepare("SELECT d.code, d.name, st.code AS spec_type, st.name AS spec_name
                          FROM dictionaries d
                          LEFT JOIN dictionaries st ON st.id = d.ref_id AND st.group_code = 'specialist_type'
                          WHERE d.group_code = 'activity_category' AND d.active = 1 ORDER BY d.id");
    $stmt->execute();
    ok($stmt->fetchAll());
}

// GET — один элемент
if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db   = getDB();
    $stmt = $db->prepare($LIST_SQL . ' WHERE l.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) err('Элемент библиотеки не найден', 404);
    ok(libRow($row));
}

// POST — создать (только admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'price', 'location_id']);

    $db     = getDB();
    $catId  = libDictId($db, 'activity_category', $d['cat']  ?? 'training');
    $features = isset($d['features']) && is_array($d['features'])
        ? json_encode(array_values($d['features']), JSON_UNESCAPED_UNICODE)
        : null;

    // Вместимость не хранится в библиотеке — она задаётся в locations.max_people.
    $locId = (int)$d['location_id'];   // филиал записи выбирается на форме
    $stmt = $db->prepare('INSERT INTO library
        (location_id, name, category_id, duration, price, difficulty, summary, details, active)
        VALUES (?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $locId, $d['name'], $catId,
        $d['dur']   ?? 60,
        $d['price'],
        $d['difficulty'] ?? 'any',
        $d['desc']  ?? null,
        $features,
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
    ]);
    ok(['id' => $db->lastInsertId()], 'Добавлено в библиотеку');
}

// PUT — обновить (только admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    $db     = getDB();
    $catId  = libDictId($db, 'activity_category', $d['cat']  ?? 'training');
    $features = isset($d['features']) && is_array($d['features'])
        ? json_encode(array_values($d['features']), JSON_UNESCAPED_UNICODE)
        : null;

    require_fields($d, ['location_id']);
    $stmt = $db->prepare('UPDATE library SET
        location_id=?, name=?, category_id=?, duration=?, price=?, difficulty=?, summary=?, details=?, active=?
        WHERE id=?');
    $stmt->execute([
        (int)$d['location_id'], $d['name'], $catId,
        $d['dur']   ?? 60,
        $d['price'],
        $d['difficulty'] ?? 'any',
        $d['desc']  ?? null,
        $features,
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
        $id,
    ]);
    ok(null, 'Обновлено');
}

// DELETE — только мягкое удаление (active=0), физически НЕ удаляем.
// Слоты могут ссылаться на запись (FK ON DELETE RESTRICT — физическое удаление
// запрещено на уровне БД). Слоты остаются, описание берётся из записи по-прежнему.
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE library SET active = 0 WHERE id = ?')->execute([$id]);
    ok(null, 'Удалено из библиотеки');
}

err('Неизвестный endpoint', 404);
