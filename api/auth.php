<?php
// api/auth.php — Авторизация
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// POST /api/auth.php?action=register
if ($method === 'POST' && $action === 'register') {
    $d = input();
    require_fields($d, ['email', 'password', 'name']);

    $email = strtolower(trim($d['email']));
    $name  = trim($d['name']);
    $phone = trim($d['phone'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) err('Неверный email');
    if (strlen($d['password']) < 6) err('Пароль минимум 6 символов');

    $db = getDB();
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) err('Email уже зарегистрирован');

    $hash = password_hash($d['password'], PASSWORD_BCRYPT);
    $stmt = $db->prepare('INSERT INTO users (email, password, name, phone, role, status) VALUES (?,?,?,?,?,?)');
    $stmt->execute([$email, $hash, $name, $phone, 'client', 'new']);

    $userId = (int)$db->lastInsertId();
    $token  = jwtEncode(['id' => $userId, 'email' => $email, 'name' => $name, 'role' => 'client']);
    ok([
        'token' => $token,
        'user'  => ['id' => $userId, 'email' => $email, 'name' => $name, 'phone' => $phone, 'role' => 'client', 'status' => 'new'],
    ]);
}

// POST /api/auth.php?action=login
if ($method === 'POST' && $action === 'login') {
    $d = input();
    require_fields($d, ['email', 'password']);

    $email = strtolower(trim($d['email']));
    $db    = getDB();
    $stmt  = $db->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user  = $stmt->fetch();

    if (!$user || !password_verify($d['password'], $user['password'])) {
        err('Неверный email или пароль');
    }

    $token = jwtEncode([
        'id'    => $user['id'],
        'email' => $user['email'],
        'name'  => $user['name'],
        'role'  => $user['role'],
    ]);

    unset($user['password']);
    ok(['token' => $token, 'user' => $user]);
}

// GET /api/auth.php?action=me
if ($method === 'GET' && $action === 'me') {
    $payload = authUser();
    $db      = getDB();
    $stmt    = $db->prepare('SELECT id,email,name,phone,role,status,bike,birth_date,notes,created_at FROM users WHERE id = ?');
    $stmt->execute([$payload['id']]);
    $user = $stmt->fetch();
    if (!$user) err('Пользователь не найден', 404);
    ok($user);
}

// PUT /api/auth.php?action=update
if ($method === 'PUT' && $action === 'update') {
    $payload = authUser();
    $d = input();

    $fields = [];
    $params = [];
    if (!empty($d['name']))   { $fields[] = 'name=?';       $params[] = $d['name']; }
    if (!empty($d['phone']))  { $fields[] = 'phone=?';      $params[] = $d['phone']; }
    if (!empty($d['bike']))   { $fields[] = 'bike=?';       $params[] = $d['bike']; }
    if (!empty($d['birth_date'])) { $fields[] = 'birth_date=?'; $params[] = $d['birth_date']; }
    if (isset($d['notes']))   { $fields[] = 'notes=?';      $params[] = $d['notes']; }

    if (empty($fields)) err('Нет данных для обновления');

    $params[] = $payload['id'];
    $db = getDB();
    $db->prepare('UPDATE users SET ' . implode(',', $fields) . ' WHERE id=?')->execute($params);
    ok(null, 'Профиль обновлён');
}

err('Неизвестный endpoint', 404);
