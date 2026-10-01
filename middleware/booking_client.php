<?php
// ═══════════════════════════════════════════════════════════
// middleware/booking_client.php — Для кого создаётся запись
// ═══════════════════════════════════════════════════════════
// Клиент записывает себя. Администратор записывает клиента, который звонит по телефону (журнал записи):
// существующего — user_id, нового — new_client: {name, phone} (создаётся вместе с записью).
// Один телефон — один клиент: нового с уже известным номером завести нельзя.
// Новый клиент — без личного кабинета (users.has_account = 0): пароля он не знает, email служебный
// <телефон>@phone.invalid (зона .invalid зарезервирована — письма на такой адрес никуда не уходят).
// Вызывать внутри транзакции записи: если запись не пройдёт, новый клиент не останется.

const PHONE_EMAIL_DOMAIN = 'phone.invalid';

// Номер цифрами в виде 7XXXXXXXXXX (10 цифр — добавляем 7, «8…» — это тот же «7…») или null
function phoneDigits(string $phone): ?string {
    $d = preg_replace('/\D+/', '', $phone);
    if (strlen($d) === 10) $d = '7' . $d;
    if (strlen($d) === 11 && $d[0] === '8') $d = '7' . substr($d, 1);
    return strlen($d) >= 11 && strlen($d) <= 15 ? $d : null;
}

// Телефон в том же виде, что даёт маска ввода на сайте (maskPhone): +7 (XXX) XXX-XX-XX; не российский номер — +цифры
function phoneView(string $digits): string {
    if (strlen($digits) !== 11 || $digits[0] !== '7') return '+' . $digits;
    return '+7 (' . substr($digits, 1, 3) . ') ' . substr($digits, 4, 3) . '-' . substr($digits, 7, 2) . '-' . substr($digits, 9, 2);
}

// Возвращает ['id', 'name', 'by_admin'] или завершает запрос ошибкой
function bookingClient(PDO $db, array $actor, array $d): array {
    if (($actor['role'] ?? '') !== 'admin') {
        return ['id' => (int)$actor['id'], 'name' => (string)$actor['name'], 'by_admin' => false];
    }
    if (!empty($d['user_id'])) {
        $st = $db->prepare("SELECT u.id, u.name FROM users u
                            JOIN dictionaries r ON r.id = u.role_id AND r.group_code = 'user_role' AND r.code = 'client'
                            WHERE u.id = ? AND u.active = 1");
        $st->execute([(int)$d['user_id']]);
        $u = $st->fetch();
        if (!$u) err('Клиент не найден', 404);
        return ['id' => (int)$u['id'], 'name' => $u['name'], 'by_admin' => true];
    }

    $n = $d['new_client'] ?? null;
    if (!is_array($n)) err('Выберите клиента');
    $name = trim((string)($n['name'] ?? ''));
    if ($name === '') err('Укажите имя клиента');
    $digits = phoneDigits((string)($n['phone'] ?? ''));
    if ($digits === null) err('Укажите телефон клиента полностью, например +7 900 123-45-67');

    // Тот же телефон (сравниваем последние 10 цифр: +7 и 8 — один номер) — клиент уже есть, его надо выбрать, а не заводить заново
    $st = $db->prepare("SELECT name FROM users WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ? LIMIT 1");
    $st->execute([substr($digits, -10)]);
    if ($dup = $st->fetchColumn()) err('Клиент с таким телефоном уже есть: ' . $dup . ' — найдите его по номеру');

    $db->prepare("INSERT INTO users (email, password, name, phone, type, has_account, role_id)
                  VALUES (?, ?, ?, ?, 'new', 0, (SELECT id FROM dictionaries WHERE group_code = 'user_role' AND code = 'client'))")
       ->execute([$digits . '@' . PHONE_EMAIL_DOMAIN, password_hash(bin2hex(random_bytes(8)), PASSWORD_BCRYPT), $name, phoneView($digits)]);
    return ['id' => (int)$db->lastInsertId(), 'name' => $name, 'by_admin' => true, 'created' => true];
}
