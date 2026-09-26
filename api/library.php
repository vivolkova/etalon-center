<?php
// api/library.php — Библиотека тренировок и услуг.
// Единый источник описаний: слоты ссылаются на строку library через slots.library_id.
// В БД хранятся коды (type, category, difficulty), русские подписи — только на фронте.
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
        'id'         => (int)$r['id'],
        'type'       => $r['type'],                 // library_type: training | service
        'name'       => $r['name'],
        'cat'        => $r['cat'],                  // activity_category: training | bikefit | workshop
        'dur'        => (int)$r['duration'],
        'price'      => (int)$r['price'],
        'max'        => $r['max_people'] !== null ? (int)$r['max_people'] : null,
        'difficulty' => $r['difficulty'],           // код: any | beginner | intermediate | advanced
        'desc'       => $r['summary'] ?? '',
        'features'   => $r['details'] ? json_decode($r['details'], true) : [],
    ];
}

$LIST_SQL = 'SELECT l.id, l.name, l.duration, l.price, l.max_people, l.difficulty,
                    l.summary, l.details,
                    lt.code AS type, dc.code AS cat
             FROM library l
             JOIN dictionaries lt ON l.type_id     = lt.id
             JOIN dictionaries dc ON l.category_id = dc.id';

// GET — список (публичный; нужен и форме слота, и экрану «Библиотека»)
if ($method === 'GET' && $action === 'list') {
    $db  = getDB();
    $sql = $LIST_SQL . ' WHERE l.active = 1';
    $params = [];
    if (!empty($_GET['type'])) { $sql .= ' AND lt.code = ?'; $params[] = $_GET['type']; }
    $sql .= ' ORDER BY l.id';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok(array_map('libRow', $stmt->fetchAll()));
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
    require_fields($d, ['name', 'price']);

    $db     = getDB();
    $typeId = libDictId($db, 'library_type',     $d['type'] ?? 'training');
    $catId  = libDictId($db, 'activity_category', $d['cat']  ?? 'training');
    $features = isset($d['features']) && is_array($d['features'])
        ? json_encode(array_values($d['features']), JSON_UNESCAPED_UNICODE)
        : null;

    $stmt = $db->prepare('INSERT INTO library
        (location_id, type_id, name, category_id, duration, price, max_people, difficulty, summary, details)
        VALUES (1,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $typeId, $d['name'], $catId,
        $d['dur']   ?? 60,
        $d['price'],
        $d['max']   ?? null,
        $d['difficulty'] ?? 'any',
        $d['desc']  ?? null,
        $features,
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
    $typeId = libDictId($db, 'library_type',     $d['type'] ?? 'training');
    $catId  = libDictId($db, 'activity_category', $d['cat']  ?? 'training');
    $features = isset($d['features']) && is_array($d['features'])
        ? json_encode(array_values($d['features']), JSON_UNESCAPED_UNICODE)
        : null;

    $stmt = $db->prepare('UPDATE library SET
        type_id=?, name=?, category_id=?, duration=?, price=?, max_people=?, difficulty=?, summary=?, details=?
        WHERE id=?');
    $stmt->execute([
        $typeId, $d['name'], $catId,
        $d['dur']   ?? 60,
        $d['price'],
        $d['max']   ?? null,
        $d['difficulty'] ?? 'any',
        $d['desc']  ?? null,
        $features, $id,
    ]);
    ok(null, 'Обновлено');
}

// DELETE — мягкое удаление (только admin).
// Слоты могут ссылаться на запись — FK ON DELETE SET NULL, но описание в уже
// созданных слотах сохраняем, поэтому просто снимаем active.
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE library SET active = 0 WHERE id = ?')->execute([$id]);
    ok(null, 'Удалено из библиотеки');
}

err('Неизвестный endpoint', 404);
