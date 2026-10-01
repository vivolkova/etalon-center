<?php
// ═══════════════════════════════════════════════════════════
// middleware/settings.php — Параметры студии (таблица settings)
// ═══════════════════════════════════════════════════════════

// Правила значений по коду настройки: тип и допустимый диапазон (проверяет api/settings.php)
const SETTINGS_RULES = [
    'location_travel_minutes'     => ['type' => 'int', 'min' => 0, 'max' => 600],
    'client_booking_lead_minutes' => ['type' => 'int', 'min' => 0, 'max' => 1440],
    'client_booking_horizon_days' => ['type' => 'int', 'min' => 1, 'max' => 365],
    'free_training_max_minutes'   => ['type' => 'int', 'min' => 30, 'max' => 720],
];

// Значение настройки строкой; нет строки в таблице — $default. Кешируется на время запроса
function getSetting(PDO $db, string $code, ?string $default = null): ?string {
    static $cache = null;
    if ($cache === null) $cache = $db->query('SELECT code, value FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR);
    return array_key_exists($code, $cache) ? $cache[$code] : $default;
}

function settingInt(PDO $db, string $code, int $default): int {
    $v = getSetting($db, $code);
    return $v === null ? $default : (int)$v;
}

// Время на переезд между двумя филиалами, мин: своё для пары (location_travel), иначе значение по умолчанию.
// Один и тот же филиал — 0
function travelMinutes(PDO $db, int $locA, int $locB): int {
    if ($locA === $locB) return 0;
    $st = $db->prepare('SELECT minutes FROM location_travel WHERE location_a_id = ? AND location_b_id = ? AND active = 1');
    $st->execute([min($locA, $locB), max($locA, $locB)]);
    $m = $st->fetchColumn();
    return $m !== false ? (int)$m : settingInt($db, 'location_travel_minutes', 90);
}
