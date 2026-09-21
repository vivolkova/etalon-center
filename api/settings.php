<?php
// api/settings.php — Настройки студии
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'get';

// Файл для хранения настроек (простое JSON-хранилище)
$settingsFile = __DIR__ . '/../config/studio_settings.json';

function loadSettings(string $file): array {
    if (!file_exists($file)) return [];
    return json_decode(file_get_contents($file), true) ?? [];
}

// GET — получить настройки (публичный)
if ($method === 'GET' && $action === 'get') {
    ok(loadSettings($settingsFile));
}

// PUT — сохранить настройки (admin)
if ($method === 'PUT' && $action === 'save') {
    authAdmin();
    $d = input();
    $current = loadSettings($settingsFile);
    $updated = array_merge($current, array_filter([
        'name'    => $d['name']    ?? null,
        'address' => $d['address'] ?? null,
        'phone'   => $d['phone']   ?? null,
        'email'   => $d['email']   ?? null,
        'hours'   => $d['hours']   ?? null,
    ], function($v) { return $v !== null; }));
    file_put_contents($settingsFile, json_encode($updated, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    ok(null, 'Настройки сохранены');
}

err('Неизвестный endpoint', 404);
