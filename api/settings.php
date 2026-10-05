<?php
// api/settings.php — Параметры студии, которые меняет администратор:
// таблица settings.
// Сохранение — блоком: сначала проверяются все значения, потом записываются в одной транзакции.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/settings.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Проверить значение по правилу SETTINGS_RULES: нормализованная строка или err() с названием параметра
function settingValue(string $code, string $name, $raw): string {
    $value = trim((string)$raw);
    $rule = SETTINGS_RULES[$code] ?? ['type' => 'string'];
    if ($rule['type'] === 'int') {
        if (!preg_match('/^\d+$/', $value)) err($name . ': укажите целое число');
        $n = (int)$value;
        if ($n < $rule['min'] || $n > $rule['max']) err($name . ': от ' . $rule['min'] . ' до ' . $rule['max']);
        return (string)$n;
    }
    if ($value === '') err($name . ': укажите значение');
    return $value;
}

// GET ?action=list — все параметры: видит любой администратор, меняет — администратор системы
if ($method === 'GET' && $action === 'list') {
    authAdmin();
    $rows = getDB()->query('SELECT code, name, value, updated_at FROM settings ORDER BY id')->fetchAll();
    ok(array_map(function ($r) {
        $rule = SETTINGS_RULES[$r['code']] ?? ['type' => 'string'];
        return $r + ['type' => $rule['type'], 'min' => $rule['min'] ?? null, 'max' => $rule['max'] ?? null];
    }, $rows));
}

// PUT ?action=update — сохранить параметры блоком (admin): {values: {code: value, …}}
if ($method === 'PUT' && $action === 'update') {
    $user = authCan('system');
    $values = (array)(input()['values'] ?? []);
    if (!$values) err('Нет значений для сохранения');
    $db = getDB();
    $names = $db->query('SELECT code, name FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR);
    $clean = [];
    foreach ($values as $code => $raw) {
        if (!isset($names[$code])) err('Параметр не найден: ' . $code, 404);
        $clean[$code] = settingValue($code, $names[$code], $raw);
    }
    $db->beginTransaction();
    $st = $db->prepare('UPDATE settings SET value = ?, updated_by = ? WHERE code = ?');
    foreach ($clean as $code => $v) $st->execute([$v, (int)$user['id'], $code]);
    $db->commit();
    ok(null, 'Параметры сохранены');
}

err('Неизвестный endpoint', 404);
