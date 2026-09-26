<?php
// api/specialists.php — Специалисты (тренеры, байкфиттеры, мастера)
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// код значения справочника -> id
function specTypeId($db, $code) {
    $st = $db->prepare('SELECT id FROM dictionaries WHERE group_code = ? AND code = ?');
    $st->execute(['specialist_type', $code]);
    $id = $st->fetchColumn();
    if ($id === false) err('Неизвестная категория специалиста: ' . $code);
    return (int)$id;
}

// GET — список специалистов (публичный)
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    $all = !empty($_GET['all']);
    if ($all) authAdmin();
    $where = $all ? '1' : 'sp.active = 1';
    $stmt = $db->prepare('
        SELECT sp.*, dt.code AS category,
               COUNT(s.id) AS sessions_count
        FROM specialists sp
        LEFT JOIN slots s ON s.specialist_id = sp.id AND s.active = 1
        LEFT JOIN dictionaries dt ON sp.type_id = dt.id
        WHERE ' . $where . '
        GROUP BY sp.id
        ORDER BY sp.id
    ');
    $stmt->execute();
    ok($stmt->fetchAll());
}

// POST — создать специалиста (admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'full_name', 'category', 'location_id']);
    $db = getDB();
    $typeId = specTypeId($db, $d['category']);
    $stmt = $db->prepare('INSERT INTO specialists (location_id,type_id,name,full_name,speciality,experience,active) VALUES (?,?,?,?,?,?,?)');
    $stmt->execute([
        (int)$d['location_id'], $typeId, $d['name'], $d['full_name'],
        $d['speciality'] ?? '', $d['experience'] ?? 0,
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
    ]);
    ok(['id' => $db->lastInsertId()], 'Специалист добавлен');
}

// PUT — обновить специалиста (admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'full_name', 'category', 'location_id']);
    $db = getDB();
    $typeId = specTypeId($db, $d['category']);
    $db->prepare('UPDATE specialists SET location_id=?,type_id=?,name=?,full_name=?,speciality=?,experience=?,active=? WHERE id=?')
       ->execute([
           (int)$d['location_id'], $typeId, $d['name'], $d['full_name'],
           $d['speciality'] ?? '', $d['experience'] ?? 0,
           isset($d['active']) ? (int)(bool)$d['active'] : 1,
           (int)$d['id'],
       ]);
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
