<?php
// ═══════════════════════════════════════════════════════════
// middleware/helpers.php — Общие хелперы
// ═══════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/roles.php';

// ── CORS ──────────────────────────────────────────────────
function setCORS(): void {
    // Разрешаем запросы с того же домена и с SITE_URL
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = [SITE_URL, 'http://' . ($_SERVER['HTTP_HOST'] ?? ''), 'https://' . ($_SERVER['HTTP_HOST'] ?? '')];
    if (in_array($origin, $allowed) || empty($origin)) {
        header('Access-Control-Allow-Origin: ' . ($origin ?: SITE_URL));
    } else {
        header('Access-Control-Allow-Origin: ' . SITE_URL);
    }
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Session-Key');
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ── Ответы ────────────────────────────────────────────────
function ok(mixed $data = null, string $message = 'ok'): never {
    echo json_encode(['success' => true, 'message' => $message, 'data' => $data]);
    exit;
}

function err(string $message, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

// ── Входящие данные ───────────────────────────────────────
function input(): array {
    $body = file_get_contents('php://input');
    return json_decode($body, true) ?? [];
}

// ── Авторизация ───────────────────────────────────────────
// Пользователь запроса — по сессии из cookie (middleware/session.php): ['id', 'name', 'role', 'roles', 'session_id', 'key'].
// Изменяющий запрос дополнительно проверяется: с нашего сайта и с ключом этой сессии (requestGuard).
function authUser(): array {
    $user = sessionCurrent(getDB());
    if (!$user) err('Требуется авторизация', 401);
    requestGuard($user);
    return $user;
}

// Пользователь, если запрос от вошедшего; иначе null (для публичных данных с личными дополнениями)
function authUserOrNull(): ?array {
    return sessionCurrent(getDB());
}

function authAdmin(): array {
    $user = authUser();
    if ($user['role'] !== 'admin') err('Недостаточно прав', 403);
    return $user;
}

// ── Категории занятий ─────────────────────────────────────
// Две группы справочника: activity_category — тренировки (единственное значение training),
// service_category — услуги (байкфит, мастерская, массаж…). Код категории уникален в обеих группах:
// по нему категорию находят (library, slots хранят id значения любой из групп).
const CATEGORY_GROUPS = ['activity_category', 'service_category'];
const CATEGORY_GROUPS_SQL = "'activity_category','service_category'";

// ── Валидация ─────────────────────────────────────────────
// Транзакция записи / занятия. Проверки «свободно ли» (зал, специалист, станок, клиент не в двух местах) идут
// после блокировки строк (SELECT … FOR UPDATE) и обязаны видеть то, что записал запрос, которого мы ждали.
// При уровне MySQL по умолчанию (REPEATABLE READ) транзакция читает снимок, сделанный при её первом чтении —
// то есть ещё ДО ожидания блокировки, — и только что сделанную чужую запись не видит: блокировка есть, а
// проверка проходит дважды. READ COMMITTED: каждое чтение видит последние зафиксированные данные.
// Действует только на эту транзакцию.
function beginCheckedTx(PDO $db): void {
    $db->exec('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    $db->beginTransaction();
}

function require_fields(array $data, array $fields): void {
    foreach ($fields as $f) {
        if (empty($data[$f])) err("Поле '$f' обязательно");
    }
}
