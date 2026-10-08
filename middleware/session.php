<?php
// ═══════════════════════════════════════════════════════════
// middleware/session.php — Сессии входа, защита вызовов, попытки входа, журнал действий
// ═══════════════════════════════════════════════════════════
// Вход создаёт строку в sessions и ставит cookie ec_session: в cookie — случайный секрет, в базе — только его
// отпечаток (SHA-256). Cookie HttpOnly — скрипты страницы прочитать её не могут.
// Ключ сессии — значение, вычисленное из секрета cookie и секрета сервера: страница получает его при входе,
// держит в памяти и передаёт в заголовке X-Session-Key с каждым изменяющим запросом. Запрос, скопированный
// в другую сессию или отправленный с чужого сайта, не пройдёт: ключа этой сессии у него нет.

const SESSION_COOKIE    = 'ec_session';
const SESSION_TOUCH_SEC = 300;   // не чаще раза в 5 минут отмечаем обращение и продлеваем срок

// Защита от перебора (auth_attempts)
const LOGIN_FAILS_PER_PHONE = 5;    // неудачных входов по одному номеру…
const LOGIN_FAILS_PER_IP    = 20;   // …и с одного адреса
const LOGIN_FAILS_MINUTES   = 15;   // …за столько минут
const REGISTERS_PER_IP_HOUR = 5;    // регистраций с одного адреса в час

function clientIp(): string {
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}
// Каким браузером и с какого устройства пришёл запрос — для журнала входов
function clientAgent(): ?string {
    $ua = trim((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    return $ua !== '' ? mb_substr($ua, 0, 255) : null;
}

function sessionCookieSet(string $token, int $expires): void {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    setcookie(SESSION_COOKIE, $token, [
        'expires' => $expires, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $https,
    ]);
}
function sessionCookieClear(): void {
    sessionCookieSet('', time() - 3600);
}

function sessionKey(string $token): string {
    return hash_hmac('sha256', 'session-key:' . $token, JWT_SECRET);
}

// Новая сессия (вход): [id сессии, ключ сессии]
function sessionStart(PDO $db, int $userId): array {
    $token = bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
                  VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?)')
       ->execute([hash('sha256', $token), $userId, JWT_EXPIRE, clientIp(), clientAgent()]);
    sessionCookieSet($token, time() + JWT_EXPIRE);
    return ['id' => (int)$db->lastInsertId(), 'key' => sessionKey($token)];
}

// Текущая сессия запроса: ['id', 'name', 'role', 'roles', 'session_id', 'key'] или null.
// Имя и роли читаются из базы при каждом запросе: снятая роль и отключённая запись перестают действовать сразу.
function sessionCurrent(PDO $db): ?array {
    static $done = false, $cur = null;
    if ($done) return $cur;
    $done = true;
    $token = (string)($_COOKIE[SESSION_COOKIE] ?? '');
    if (!preg_match('/^[0-9a-f]{64}$/', $token)) return null;

    $st = $db->prepare('SELECT s.id, s.user_id, s.ended_at, s.expires_at < NOW() AS expired,
                               TIMESTAMPDIFF(SECOND, s.last_seen_at, NOW()) AS idle,
                               u.name, u.active, u.has_account
                        FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?');
    $st->execute([hash('sha256', $token)]);
    $s = $st->fetch();
    if (!$s || $s['ended_at'] !== null) return null;
    if ((int)$s['expired']) { sessionEnd($db, (int)$s['id'], 'expired'); return null; }
    if (!(int)$s['active'] || !(int)$s['has_account']) { sessionEnd($db, (int)$s['id'], 'admin'); return null; }

    if ((int)$s['idle'] >= SESSION_TOUCH_SEC) {
        $db->prepare('UPDATE sessions SET last_seen_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?')
           ->execute([JWT_EXPIRE, (int)$s['id']]);
        sessionCookieSet($token, time() + JWT_EXPIRE);
    }
    $uid = (int)$s['user_id'];
    $cur = [
        'id' => $uid, 'name' => $s['name'], 'role' => userRole($db, $uid), 'roles' => userRoles($db, $uid),
        'session_id' => (int)$s['id'], 'key' => sessionKey($token),
    ];
    return $cur;
}

// Завершить сессию: logout — вышел сам, password — сменён пароль, admin — завершил администратор или отключена запись,
// expired — истёк срок
function sessionEnd(PDO $db, int $sessionId, string $reason): void {
    $db->prepare('UPDATE sessions SET ended_at = NOW(), end_reason = ? WHERE id = ? AND ended_at IS NULL')
       ->execute([$reason, $sessionId]);
}
// Завершить все сессии человека (кроме $exceptId)
function sessionEndAll(PDO $db, int $userId, string $reason, int $exceptId = 0): void {
    $db->prepare('UPDATE sessions SET ended_at = NOW(), end_reason = ? WHERE user_id = ? AND ended_at IS NULL AND id <> ?')
       ->execute([$reason, $userId, $exceptId]);
}

// Запрос пришёл с нашего сайта: заголовок Origin (браузер сам ставит его у изменяющих запросов) — наш адрес
function originGuard(): void {
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') return;
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    if (!in_array($origin, [SITE_URL, 'http://' . $host, 'https://' . $host], true)) err('Запрос с чужого сайта отклонён', 403);
}
// Изменяющий запрос вошедшего пользователя: с нашего сайта и с ключом именно этой сессии
function requestGuard(array $user): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') return;
    originGuard();
    if (!hash_equals($user['key'], (string)($_SERVER['HTTP_X_SESSION_KEY'] ?? ''))) err('Сессия не подтверждена — обновите страницу', 403);
}

// ── Попытки входа и регистрации ───────────────────────────
function attemptLog(PDO $db, string $kind, ?string $phone, bool $success, ?int $sessionId = null): void {
    $db->prepare('INSERT INTO auth_attempts (kind, phone, success, session_id, ip, user_agent) VALUES (?,?,?,?,?,?)')
       ->execute([$kind, $phone, $success ? 1 : 0, $sessionId, clientIp(), clientAgent()]);
}

// Вход закрыт из-за перебора: текст ошибки или null. По номеру считаем неудачи после последнего удачного входа
function loginBlocked(PDO $db, string $phone): ?string {
    $st = $db->prepare("SELECT a.created_at FROM auth_attempts a
                        WHERE a.kind = 'login' AND a.success = 0 AND a.phone = ?
                          AND a.created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
                          AND a.id > COALESCE((SELECT MAX(b.id) FROM auth_attempts b
                                               WHERE b.kind = 'login' AND b.success = 1 AND b.phone = ?), 0)
                        ORDER BY a.id DESC LIMIT 1 OFFSET " . (LOGIN_FAILS_PER_PHONE - 1));
    $st->execute([$phone, LOGIN_FAILS_MINUTES, $phone]);
    $at = $st->fetchColumn();
    if (!$at) {
        $st = $db->prepare("SELECT created_at FROM auth_attempts
                            WHERE kind = 'login' AND success = 0 AND ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
                            ORDER BY id DESC LIMIT 1 OFFSET " . (LOGIN_FAILS_PER_IP - 1));
        $st->execute([clientIp(), LOGIN_FAILS_MINUTES]);
        $at = $st->fetchColumn();
    }
    if (!$at) return null;
    // закрыто, пока самой старой из учтённых неудач не исполнится LOGIN_FAILS_MINUTES
    $st = $db->prepare('SELECT CEIL(TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(?, INTERVAL ? MINUTE)) / 60)');
    $st->execute([$at, LOGIN_FAILS_MINUTES]);
    return 'Слишком много попыток. Попробуйте через ' . waitMinutesText(max(1, (int)$st->fetchColumn()));
}
function waitMinutesText(int $m): string {
    $n = $m % 100; $k = $m % 10;
    $w = ($n >= 11 && $n <= 14) ? 'минут' : ($k === 1 ? 'минуту' : ($k >= 2 && $k <= 4 ? 'минуты' : 'минут'));
    return $m . ' ' . $w;
}

// ── Одноразовые ссылки от администратора (auth_links) ─────
// Отменить неиспользованные ссылки человека: срок действия заканчивается сейчас
function authLinksCancel(PDO $db, int $userId): void {
    $db->prepare('UPDATE auth_links SET expires_at = NOW() WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()')
       ->execute([$userId]);
}
// Перебор ссылок с одного адреса: столько же неудач, сколько при входе, — и ссылки с этого адреса не принимаются
function linkBlocked(PDO $db): ?string {
    $st = $db->prepare("SELECT COUNT(*) FROM auth_attempts
                        WHERE kind = 'link' AND success = 0 AND ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)");
    $st->execute([clientIp(), LOGIN_FAILS_MINUTES]);
    return (int)$st->fetchColumn() >= LOGIN_FAILS_PER_IP ? 'Слишком много попыток. Попробуйте позже' : null;
}

function registerBlocked(PDO $db): ?string {
    $st = $db->prepare("SELECT COUNT(*) FROM auth_attempts
                        WHERE kind = 'register' AND success = 1 AND ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    $st->execute([clientIp()]);
    return (int)$st->fetchColumn() >= REGISTERS_PER_IP_HOUR ? 'Слишком много регистраций с этого адреса. Попробуйте позже' : null;
}

// ── Журнал действий ───────────────────────────────────────
// Кто ($actor — пользователь из authUser() или null), что сделал ($action — код), над чем ($entity — таблица, $entityId).
// В $details — подробности; пароли и секреты сюда не передавать
function logAction(PDO $db, ?array $actor, string $action, ?string $entity = null, ?int $entityId = null, ?array $details = null): void {
    $db->prepare('INSERT INTO action_log (user_id, session_id, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?,?)')
       ->execute([
           $actor['id'] ?? null, $actor['session_id'] ?? null, $action, $entity, $entityId,
           $details !== null ? json_encode($details, JSON_UNESCAPED_UNICODE) : null, clientIp(),
       ]);
}
