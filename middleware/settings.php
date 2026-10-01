<?php
// ═══════════════════════════════════════════════════════════
// middleware/settings.php — Параметры студии (таблица settings)
// ═══════════════════════════════════════════════════════════

// Правила значений по коду настройки: тип и допустимый диапазон (проверяет api/settings.php)
const SETTINGS_RULES = [
    'client_booking_lead_minutes' => ['type' => 'int', 'min' => 0, 'max' => 1440],
    'client_booking_horizon_days' => ['type' => 'int', 'min' => 1, 'max' => 365],
    'free_training_max_minutes'   => ['type' => 'int', 'min' => 30, 'max' => 720],
    'free_training_extra_price'   => ['type' => 'int', 'min' => 0, 'max' => 100000],
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
