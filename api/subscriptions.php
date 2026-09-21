<?php
// api/subscriptions.php — Абонементы
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'plans';

// GET — тарифные планы (публичный)
if ($method === 'GET' && $action === 'plans') {
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM subscription_plans WHERE active=1 ORDER BY sort_order');
    $stmt->execute();
    ok($stmt->fetchAll());
}

// GET — мои абонементы
if ($method === 'GET' && $action === 'my') {
    $user = authUser();
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT s.*, p.name AS plan_name, p.sessions AS plan_sessions
        FROM subscriptions s
        JOIN subscription_plans p ON s.plan_id = p.id
        WHERE s.user_id=? AND s.status="active"
        ORDER BY s.expires_at DESC
    ');
    $stmt->execute([$user['id']]);
    ok($stmt->fetchAll());
}

// GET — все продажи (admin)
if ($method === 'GET' && $action === 'all') {
    authAdmin();
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT s.*, p.name AS plan_name, u.name AS user_name, u.email AS user_email
        FROM subscriptions s
        JOIN subscription_plans p ON s.plan_id=p.id
        JOIN users u ON s.user_id=u.id
        ORDER BY s.created_at DESC
    ');
    $stmt->execute();
    ok($stmt->fetchAll());
}

// POST — создать план (admin)
if ($method === 'POST' && $action === 'create_plan') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'price', 'sessions']);

    $db   = getDB();
    $stmt = $db->prepare('INSERT INTO subscription_plans (name,sessions,price,validity,color,features) VALUES (?,?,?,?,?,?)');
    $stmt->execute([
        $d['name'], $d['sessions'], $d['price'],
        $d['validity'] ?? 30, $d['color'] ?? '#00BAB3',
        json_encode($d['features'] ?? []),
    ]);
    ok(['id' => $db->lastInsertId()], 'План создан');
}

// POST — продать абонемент клиенту (admin)
if ($method === 'POST' && $action === 'sell') {
    authAdmin();
    $d = input();
    require_fields($d, ['user_id', 'plan_id']);

    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM subscription_plans WHERE id=? AND active=1');
    $stmt->execute([$d['plan_id']]);
    $plan = $stmt->fetch();
    if (!$plan) err('План не найден');

    $expires = date('Y-m-d', strtotime('+' . $plan['validity'] . ' days'));
    $stmt    = $db->prepare('INSERT INTO subscriptions (user_id,plan_id,sessions_left,expires_at,price_paid,payment_id)
                             VALUES (?,?,?,?,?,?)');
    $stmt->execute([
        $d['user_id'], $d['plan_id'], $plan['sessions'],
        $expires, $plan['price'], $d['payment_id'] ?? null,
    ]);
    ok(['id' => $db->lastInsertId()], 'Абонемент продан');
}

// PUT — обновить план (admin)
if ($method === 'PUT' && $action === 'update_plan') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    $db = getDB();
    $db->prepare('UPDATE subscription_plans SET name=?,sessions=?,price=?,validity=?,features=? WHERE id=?')
       ->execute([$d['name'], $d['sessions'], $d['price'], $d['validity'],
                  json_encode($d['features'] ?? []), $id]);
    ok(null, 'План обновлён');
}

// DELETE — удалить план (admin)
if ($method === 'DELETE' && $action === 'delete_plan') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE subscription_plans SET active=0 WHERE id=?')->execute([$id]);
    ok(null, 'План удалён');
}

err('Неизвестный endpoint', 404);
