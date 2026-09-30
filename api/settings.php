<?php
// api/settings.php — Параметры студии, которые меняет администратор:
// значения по умолчанию (таблица settings) и время на переезд между филиалами (location_travel).
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

// GET ?action=list — все параметры (admin)
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
    $user = authAdmin();
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

// GET ?action=travel_list — все пары действующих филиалов: [{location_a_id, location_b_id, a_name, b_name, minutes|null}] (admin).
// minutes = null — для пары действует значение по умолчанию
if ($method === 'GET' && $action === 'travel_list') {
    authAdmin();
    $rows = getDB()->query('SELECT a.id AS location_a_id, b.id AS location_b_id, a.name AS a_name, b.name AS b_name, t.minutes
        FROM locations a JOIN locations b ON a.id < b.id
        LEFT JOIN location_travel t ON t.location_a_id = a.id AND t.location_b_id = b.id AND t.active = 1
        WHERE a.active = 1 AND b.active = 1
        ORDER BY a.id, b.id')->fetchAll();
    ok(array_map(fn($r) => [
        'location_a_id' => (int)$r['location_a_id'], 'location_b_id' => (int)$r['location_b_id'],
        'a_name' => $r['a_name'], 'b_name' => $r['b_name'],
        'minutes' => $r['minutes'] !== null ? (int)$r['minutes'] : null,
    ], $rows));
}

// PUT ?action=travel_save — время для пар блоком (admin): {pairs: [{location_a_id, location_b_id, minutes}, …]};
// пустое minutes — для пары действует время по умолчанию (active = 0)
if ($method === 'PUT' && $action === 'travel_save') {
    $user = authAdmin();
    $pairs = (array)(input()['pairs'] ?? []);
    if (!$pairs) err('Нет значений для сохранения');
    $db = getDB();
    $names = $db->query('SELECT id, name FROM locations')->fetchAll(PDO::FETCH_KEY_PAIR);
    $rule = SETTINGS_RULES['location_travel_minutes'];
    $clean = [];
    foreach ($pairs as $p) {
        $a = (int)($p['location_a_id'] ?? 0); $b = (int)($p['location_b_id'] ?? 0);
        if (!$a || !$b || $a === $b) err('Укажите два разных филиала');
        if (!isset($names[$a], $names[$b])) err('Филиал не найден', 404);
        [$a, $b] = [min($a, $b), max($a, $b)];
        $raw = trim((string)($p['minutes'] ?? ''));
        if ($raw !== '' && (!preg_match('/^\d+$/', $raw) || (int)$raw < $rule['min'] || (int)$raw > $rule['max'])) {
            err($names[$a] . ' ↔ ' . $names[$b] . ': целое число минут от ' . $rule['min'] . ' до ' . $rule['max']);
        }
        $clean[] = [$a, $b, $raw === '' ? null : (int)$raw];
    }
    $db->beginTransaction();
    $off = $db->prepare('UPDATE location_travel SET active = 0, updated_by = ? WHERE location_a_id = ? AND location_b_id = ?');
    $set = $db->prepare('INSERT INTO location_travel (location_a_id, location_b_id, minutes, active, updated_by) VALUES (?, ?, ?, 1, ?)
                         ON DUPLICATE KEY UPDATE minutes = VALUES(minutes), active = 1, updated_by = VALUES(updated_by)');
    foreach ($clean as [$a, $b, $m]) {
        if ($m === null) $off->execute([(int)$user['id'], $a, $b]);
        else $set->execute([$a, $b, $m, (int)$user['id']]);
    }
    $db->commit();
    ok(null, 'Время на переезд сохранено');
}

err('Неизвестный endpoint', 404);
