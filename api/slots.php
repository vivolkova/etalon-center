<?php
// api/slots.php — Расписание (слоты). Категория и тип берутся из справочника dictionaries.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// код значения справочника -> id (ошибка, если кода нет)
function dictId($db, $group, $code) {
    $st = $db->prepare('SELECT id FROM dictionaries WHERE group_code = ? AND code = ?');
    $st->execute([$group, $code]);
    $id = $st->fetchColumn();
    if ($id === false) err('Неизвестное значение справочника ' . $group . ': ' . $code);
    return (int)$id;
}

// GET — список слотов
if ($method === 'GET' && $action === 'list') {
    $db    = getDB();
    $from  = $_GET['from'] ?? date('Y-m-d');
    $to    = $_GET['to']   ?? date('Y-m-d', strtotime('+14 days'));
    $cat   = $_GET['cat']  ?? null;

    $sql = 'SELECT s.*, dc.code AS category, dc.name AS category_name,
                   dt.code AS type, dt.name AS type_name,
                   t.name AS trainer_name, t.full_name AS trainer_full,
                   l.summary AS description, l.details AS features
            FROM slots s
            LEFT JOIN trainers t   ON s.trainer_id = t.id
            LEFT JOIN library  l   ON s.library_id = l.id
            JOIN dictionaries dc ON s.category_id = dc.id
            JOIN dictionaries dt ON s.type_id = dt.id
            WHERE s.slot_date BETWEEN ? AND ? AND s.active = 1';
    $params = [$from, $to];
    if ($cat) { $sql .= ' AND dc.code = ?'; $params[] = $cat; }
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
    $stmt = $db->prepare('SELECT s.*, dc.code AS category, dc.name AS category_name,
                                 dt.code AS type, dt.name AS type_name, t.name AS trainer_name,
                                 l.summary AS description, l.details AS features
                          FROM slots s
                          LEFT JOIN trainers t   ON s.trainer_id = t.id
                          LEFT JOIN library  l   ON s.library_id = l.id
                          JOIN dictionaries dc ON s.category_id = dc.id
                          JOIN dictionaries dt ON s.type_id = dt.id
                          WHERE s.id = ?');
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

    // Время занятия — в пределах сетки расписания (08:00–22:00)
    $st = substr($d['start_time'], 0, 5);
    if ($st < '08:00' || $st >= '22:00') err('Время занятия должно быть в диапазоне 08:00–22:00');

    $db = getDB();
    $categoryId = dictId($db, 'activity_category', $d['category'] ?? 'training');
    $typeId     = dictId($db, 'slot_type', $d['type'] ?? 'group');

    $stmt = $db->prepare('INSERT INTO slots (library_id,name,category_id,type_id,slot_date,start_time,duration,trainer_id,price,max_people)
                          VALUES (?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $d['library_id']  ?? null,
        $d['name'],
        $categoryId,
        $typeId,
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

    if (isset($d['start_time'])) {
        $st = substr($d['start_time'], 0, 5);
        if ($st < '08:00' || $st >= '22:00') err('Время занятия должно быть в диапазоне 08:00–22:00');
    }

    $db = getDB();
    $categoryId = dictId($db, 'activity_category', $d['category'] ?? 'training');

    $stmt = $db->prepare('UPDATE slots SET library_id=?,name=?,category_id=?,slot_date=?,start_time=?,duration=?,trainer_id=?,price=?,max_people=? WHERE id=?');
    $stmt->execute([
        $d['library_id'] ?? null,
        $d['name'], $categoryId, $d['slot_date'],
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
