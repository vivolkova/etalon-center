<?php
// ═══════════════════════════════════════════════════════════
// config/db.php — Настройки подключения к БД
// Замените значения на данные из панели REG.RU
// ═══════════════════════════════════════════════════════════

define('DB_HOST', 'localhost');                   // Хост БД (обычно localhost на REG.RU)
define('DB_NAME', 'ВАШЕ_ИМЯ_БД');       // Имя базы данных
define('DB_USER', 'ВАШ_ПОЛЬЗОВАТЕЛЬ_БД');            // Пользователь БД
define('DB_PASS', 'ВАШ_ПАРОЛЬ_БД');           // Пароль БД
define('DB_CHARSET', 'utf8mb4');

// JWT секрет (поменяйте на случайную строку)
define('JWT_SECRET', 'СГЕНЕРИРУЙТЕ_СЛУЧАЙНУЮ_СТРОКУ_32+_СИМВОЛА');
define('JWT_EXPIRE', 86400 * 7);  // 7 дней

// URL сайта (для CORS)
define('SITE_URL', 'https://etalon.center');

// ── Подключение ────────────────────────────────────────────
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}
