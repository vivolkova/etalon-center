<?php
// api/trainers.php — Тренеры
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — список тренеров (публичный)
if ($method === 'GET' && $action === 'list') {
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT t.*,
               COUNT(s.id) AS sessions_count
        FROM trainers t
        LEFT JOIN slots s ON s.trainer_id = t.id AND s.active = 1
        WHERE t.active = 1
        GROUP BY t.id
        ORDER BY t.id
    ');
    $stmt->execute();
    ok($stmt->fetchAll());
}

// POST — создать тренера (admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'full_name']);
    $db   = getDB();
    $stmt = $db->prepare('INSERT INTO trainers (name,full_name,speciality,experience,color) VALUES (?,?,?,?,?)');
    $stmt->execute([$d['name'],$d['full_name'],$d['speciality']??'',$d['experience']??0,$d['color']??'#00BAB3']);
    ok(['id' => $db->lastInsertId()], 'Тренер добавлен');
}

// PUT — обновить тренера (admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d = input();
    $db = getDB();
    $db->prepare('UPDATE trainers SET name=?,full_name=?,speciality=?,experience=?,color=? WHERE id=?')
       ->execute([$d['name'],$d['full_name'],$d['speciality']??'',$d['experience']??0,$d['color']??'#00BAB3',(int)$d['id']]);
    ok(null, 'Тренер обновлён');
}

// DELETE — удалить тренера (admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    $db = getDB();
    $db->prepare('UPDATE trainers SET active=0 WHERE id=?')->execute([$id]);
    ok(null, 'Тренер удалён');
}

err('Неизвестный endpoint', 404);
