<?php
// api/chat.php — Чат
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'messages';

// GET — сообщения диалога
if ($method === 'GET' && $action === 'messages') {
    $auth    = authUser();
    $db      = getDB();
    $otherId = (int)($_GET['user_id'] ?? 0);

    // Клиент видит переписку с администратором
    if ($auth['role'] !== 'admin') {
        // Найти первого администратора
        $stmt = $db->prepare('SELECT id FROM users WHERE role="admin" LIMIT 1');
        $stmt->execute();
        $admin = $stmt->fetch();
        $otherId = $admin['id'] ?? 1;
    }

    if (!$otherId) err('Не указан user_id');

    $stmt = $db->prepare('
        SELECT m.*, u.name AS from_name, u.role AS from_role
        FROM chat_messages m
        JOIN users u ON m.from_user = u.id
        WHERE (m.from_user=? AND m.to_user=?)
           OR (m.from_user=? AND m.to_user=?)
        ORDER BY m.created_at ASC
    ');
    $stmt->execute([$auth['id'], $otherId, $otherId, $auth['id']]);

    // Пометить прочитанными
    $db->prepare('UPDATE chat_messages SET is_read=1 WHERE to_user=? AND from_user=? AND is_read=0')
       ->execute([$auth['id'], $otherId]);

    ok($stmt->fetchAll());
}

// GET — список диалогов (только admin)
if ($method === 'GET' && $action === 'dialogs') {
    $auth = authAdmin();
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT u.id, u.name, u.email,
               COUNT(CASE WHEN m.is_read=0 AND m.to_user=? THEN 1 END) AS unread,
               MAX(m.created_at) AS last_message_at,
               (SELECT message FROM chat_messages
                WHERE (from_user=u.id OR to_user=u.id)
                ORDER BY created_at DESC LIMIT 1) AS last_message
        FROM users u
        JOIN chat_messages m ON (m.from_user=u.id OR m.to_user=u.id)
        WHERE u.role = "client"
        GROUP BY u.id
        ORDER BY last_message_at DESC
    ');
    $stmt->execute([$auth['id']]);
    ok($stmt->fetchAll());
}

// GET — счётчик непрочитанных
if ($method === 'GET' && $action === 'unread') {
    $auth = authUser();
    $db   = getDB();
    $stmt = $db->prepare('SELECT COUNT(*) AS cnt FROM chat_messages WHERE to_user=? AND is_read=0');
    $stmt->execute([$auth['id']]);
    ok($stmt->fetch()['cnt']);
}

// POST — отправить сообщение
if ($method === 'POST' && $action === 'send') {
    $auth = authUser();
    $d    = input();
    require_fields($d, ['message']);

    $db     = getDB();
    $toUser = (int)($d['to_user'] ?? 0);

    // Клиент пишет первому администратору
    if ($auth['role'] !== 'admin' || !$toUser) {
        $stmt = $db->prepare('SELECT id FROM users WHERE role="admin" LIMIT 1');
        $stmt->execute();
        $admin  = $stmt->fetch();
        $toUser = $admin['id'] ?? 1;
    }

    $stmt = $db->prepare('INSERT INTO chat_messages (from_user, to_user, message) VALUES (?,?,?)');
    $stmt->execute([$auth['id'], $toUser, trim($d['message'])]);

    ok(['id' => $db->lastInsertId()], 'Сообщение отправлено');
}

err('Неизвестный endpoint', 404);
