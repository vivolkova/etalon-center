<?php
// ═══════════════════════════════════════════════════════════
// middleware/helpers.php — Общие хелперы
// ═══════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';

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
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
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

// ── JWT (простая реализация без библиотек) ────────────────
function jwtEncode(array $payload): string {
    $header  = base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['exp'] = time() + JWT_EXPIRE;
    $payload = base64url(json_encode($payload));
    $sig     = base64url(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$sig";
}

function jwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $sig] = $parts;
    $expected = base64url(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
    if (!$data || ($data['exp'] ?? 0) < time()) return null;
    return $data;
}

function base64url(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// ── Авторизация ───────────────────────────────────────────
function authUser(): array {
    $token = getBearerToken();
    if (!$token) err('Требуется авторизация', 401);
    $payload = jwtDecode($token);
    if (!$payload) err('Токен недействителен', 401);
    return $payload;
}

function authAdmin(): array {
    $user = authUser();
    if ($user['role'] !== 'admin') err('Недостаточно прав', 403);
    return $user;
}

function getBearerToken(): ?string {
    // Способ 1: стандартный заголовок (если Apache передаёт)
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    // Способ 2: через RewriteRule [E=HTTP_AUTHORIZATION:...]
    if (empty($h)) $h = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    // Способ 3: Apache mod_rewrite ENV
    if (empty($h)) $h = getallheaders()['Authorization'] ?? '';
    // Способ 4: через $_SERVER напрямую
    if (empty($h)) $h = $_SERVER['Authorization'] ?? '';

    // Способ 5: из cookie (резервный)
    if (empty($h)) $h = 'Bearer ' . ($_COOKIE['ec_token'] ?? '');

    if (!empty($h) && preg_match('/Bearer\s+(.+)/i', $h, $m)) {
        $token = trim($m[1]);
        return $token !== 'undefined' && strlen($token) > 10 ? $token : null;
    }
    return null;
}

// ── Валидация ─────────────────────────────────────────────
function require_fields(array $data, array $fields): void {
    foreach ($fields as $f) {
        if (empty($data[$f])) err("Поле '$f' обязательно");
    }
}
