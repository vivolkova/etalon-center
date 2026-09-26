<?php
// api/locations.php — Филиалы (локации). Публичный список для выпадающих списков.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET ?action=list — активные филиалы
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    ok($db->query('SELECT id, name, address, hall_cols, hall_rows, max_people, active
                   FROM locations WHERE active = 1 ORDER BY id')->fetchAll());
}

// GET ?action=get&id=X — один филиал
if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $stmt = $db->prepare('SELECT id, name, address, hall_cols, hall_rows, max_people, active
                          FROM locations WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) err('Локация не найдена', 404);
    ok($row);
}

err('Неизвестный endpoint', 404);
