<?php
// api/notifications.php — Уведомления
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — список уведомлений
if ($method === 'GET' && $action === 'list') {
    $auth = authUser();
    $db   = getDB();

    // Клиент видит уведомления адресованные ему или всем (target_user IS NULL)
    // Администратор видит все
    if ($auth['role'] === 'admin') {
        $stmt = $db->prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
        $stmt->execute();
    } else {
        $stmt = $db->prepare('SELECT * FROM notifications WHERE target_user IS NULL OR target_user=? ORDER BY created_at DESC LIMIT 20');
        $stmt->execute([$auth['id']]);
    }
    ok($stmt->fetchAll());
}

// GET — счётчик непрочитанных
if ($method === 'GET' && $action === 'unread') {
    $auth = authAdmin();
    $db   = getDB();
    $stmt = $db->prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE is_read=0');
    $stmt->execute();
    ok($stmt->fetch()['cnt']);
}

// POST — создать уведомление/анонс (admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['title', 'message']);

    $db   = getDB();
    $stmt = $db->prepare('INSERT INTO notifications (type,title,message,target_user) VALUES (?,?,?,?)');
    $stmt->execute([
        $d['type']        ?? 'announce',
        $d['title'],
        $d['message'],
        $d['target_user'] ?? null,
    ]);
    ok(['id' => $db->lastInsertId()], 'Уведомление создано');
}

// PUT — пометить прочитанным
if ($method === 'PUT' && $action === 'read') {
    authUser();
    $id = (int)(input()['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE notifications SET is_read=1 WHERE id=?')->execute([$id]);
    ok(null, 'Прочитано');
}

// DELETE — удалить уведомление (admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('DELETE FROM notifications WHERE id=?')->execute([$id]);
    ok(null, 'Удалено');
}

err('Неизвестный endpoint', 404);
