<?php
// api/promos.php — Промокоды
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — список (admin)
if ($method === 'GET' && $action === 'list') {
    authAdmin();
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM promo_codes ORDER BY created_at DESC');
    $stmt->execute();
    ok($stmt->fetchAll());
}

// POST — создать (admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['code', 'value']);
    $db   = getDB();
    $stmt = $db->prepare('INSERT INTO promo_codes (code,type,value,max_uses,expires_at,description,active) VALUES (?,?,?,?,?,?,1)');
    $stmt->execute([strtoupper($d['code']),$d['type']??'percent',(int)$d['value'],(int)($d['max_uses']??100),$d['expires_at']??null,$d['description']??'']);
    ok(['id' => $db->lastInsertId()], 'Промокод создан');
}

// PUT — обновить (admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d = input();
    $db = getDB();
    $db->prepare('UPDATE promo_codes SET code=?,type=?,value=?,max_uses=?,expires_at=?,description=? WHERE id=?')
       ->execute([strtoupper($d['code']),$d['type']??'percent',(int)$d['value'],(int)$d['max_uses'],$d['expires_at']??null,$d['description']??'',(int)$d['id']]);
    ok(null, 'Промокод обновлён');
}

// PUT — переключить активность (admin)
if ($method === 'PUT' && $action === 'toggle') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    $db = getDB();
    $db->prepare('UPDATE promo_codes SET active = NOT active WHERE id=?')->execute([$id]);
    ok(null, 'Статус изменён');
}

// DELETE — удалить (admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    $db = getDB();
    $db->prepare('DELETE FROM promo_codes WHERE id=?')->execute([$id]);
    ok(null, 'Промокод удалён');
}

// POST — применить промокод (клиент)
if ($method === 'POST' && $action === 'apply') {
    authUser();
    $code = strtoupper(trim(input()['code'] ?? ''));
    $db   = getDB();
    $stmt = $db->prepare('SELECT * FROM promo_codes WHERE code=? AND active=1 AND (expires_at IS NULL OR expires_at >= CURDATE()) AND used_count < max_uses');
    $stmt->execute([$code]);
    $promo = $stmt->fetch();
    if (!$promo) err('Промокод недействителен или истёк');
    ok(['type' => $promo['type'], 'value' => $promo['value']], 'Промокод применён');
}

err('Неизвестный endpoint', 404);
