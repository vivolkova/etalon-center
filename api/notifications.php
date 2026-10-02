<?php
// api/notifications.php — Уведомления
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Что видит клиент: уведомления, адресованные лично ему, и объявления для всех (анонс, информация, акция).
// Служебные записи о чужих действиях (booking, cancel — «Иван — Байкфит 02.10 11:00») создаются без получателя
// и предназначены администратору: клиенту их не отдаём — в них имена и занятия других клиентов.
const NOTIF_PUBLIC_TYPES = ['announce', 'info', 'promo'];
function notifClientWhere(): string {
    return "(target_user = ? OR (target_user IS NULL AND type IN ('" . implode("','", NOTIF_PUBLIC_TYPES) . "')))";
}

// GET — список уведомлений
if ($method === 'GET' && $action === 'list') {
    $auth = authUser();
    $db   = getDB();

    // Администратор видит все; клиент — адресованные ему и объявления для всех (notifClientWhere)
    if ($auth['role'] === 'admin') {
        $stmt = $db->prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
        $stmt->execute();
    } else {
        $stmt = $db->prepare('SELECT * FROM notifications WHERE ' . notifClientWhere() . ' ORDER BY created_at DESC LIMIT 20');
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

// PUT — пометить прочитанным: администратор — любое, клиент — только то, что он видит
if ($method === 'PUT' && $action === 'read') {
    $auth = authUser();
    $id = (int)(input()['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    if ($auth['role'] === 'admin') {
        $db->prepare('UPDATE notifications SET is_read=1 WHERE id=?')->execute([$id]);
    } else {
        $db->prepare('UPDATE notifications SET is_read=1 WHERE id=? AND ' . notifClientWhere())->execute([$id, $auth['id']]);
    }
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
