<?php
// api/services.php — карточки услуг на главной. Переехали из localStorage в БД.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// строка БД -> объект в терминах фронтенда (cat = цветовая тема)
function svcRow($r) {
    return [
        'id'    => (int)$r['id'],
        'icon'  => $r['icon'] ?? '',
        'name'  => $r['name'],
        'desc'  => $r['description'] ?? '',
        'price' => $r['price'] ?? '',
    ];
}

// GET — список (публичный)
if ($method === 'GET' && $action === 'list') {
    $db   = getDB();
    $stmt = $db->query('SELECT * FROM services WHERE active = 1 ORDER BY sort_order, id');
    ok(array_map('svcRow', $stmt->fetchAll()));
}

// GET — одна услуга
if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM services WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) err('Услуга не найдена', 404);
    ok(svcRow($row));
}

// POST — создать (только admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name']);
    $db = getDB();
    $stmt = $db->prepare('INSERT INTO services (location_id, icon, name, description, price, sort_order)
                          VALUES (1,?,?,?,?,?)');
    $stmt->execute([
        $d['icon']  ?? null,
        $d['name'],
        $d['desc']  ?? null,
        $d['price'] ?? null,
        $d['sort_order'] ?? 0,
    ]);
    ok(['id' => $db->lastInsertId()], 'Услуга добавлена');
}

// PUT — обновить (только admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $stmt = $db->prepare('UPDATE services SET icon=?, name=?, description=?, price=? WHERE id=?');
    $stmt->execute([
        $d['icon']  ?? null,
        $d['name'],
        $d['desc']  ?? null,
        $d['price'] ?? null,
        $id,
    ]);
    ok(null, 'Услуга обновлена');
}

// DELETE — мягкое удаление (только admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE services SET active = 0 WHERE id = ?')->execute([$id]);
    ok(null, 'Услуга удалена');
}

err('Неизвестный endpoint', 404);
