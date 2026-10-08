<?php
// ═══════════════════════════════════════════════════════════
// middleware/booking_client.php — Для кого создаётся запись
// ═══════════════════════════════════════════════════════════
// Клиент записывает себя. Администратор записывает клиента, который звонит по телефону (журнал записи):
// существующего — user_id, нового — new_client: {first_name, last_name, phone, consents} (создаётся вместе с записью).
// Один телефон — один человек (users.uq_users_phone): нового с уже известным номером завести нельзя.
// Новый клиент — без личного кабинета (users.has_account = 0): пароля нет, войти на сайт он не может.
// Вызывать внутри транзакции записи: если запись не пройдёт, новый клиент не останется.

// Новый клиент без кабинета: [id, name]. Телефон уже есть у действующего человека — ошибка с его именем;
// у отключённого (active = 0) — запись включается снова с новым именем (другой строки с этим номером быть не может).
function createPhoneClient(PDO $db, array $n): array {
    $first = trim((string)($n['first_name'] ?? $n['name'] ?? ''));
    $last  = trim((string)($n['last_name'] ?? ''));
    if ($first === '') err('Укажите имя клиента');
    if ($last === '')  err('Укажите фамилию клиента');
    $digits = phoneDigits((string)($n['phone'] ?? ''));
    if ($digits === null) err('Укажите телефон клиента полностью, например +7 900 123-45-67');

    $st = $db->prepare('SELECT id, name, active FROM users WHERE phone = ?');
    $st->execute([$digits]);
    if ($ex = $st->fetch()) {
        if ((int)$ex['active'] === 1) err('Клиент с таким телефоном уже есть: ' . $ex['name'] . ' — найдите его по номеру');
        $db->prepare('UPDATE users SET active = 1, first_name = ?, last_name = ? WHERE id = ?')->execute([$first, $last, (int)$ex['id']]);
        return ['id' => (int)$ex['id'], 'name' => trim($first . ' ' . $last)];
    }
    try {
        $db->prepare('INSERT INTO users (first_name, last_name, phone, has_account) VALUES (?, ?, ?, 0)')
           ->execute([$first, $last, $digits]);
    } catch (PDOException $e) {
        // второй запрос с тем же номером успел раньше
        if (isDuplicatePhone($e)) err('Клиент с таким телефоном уже есть — найдите его по номеру');
        throw $e;
    }
    return ['id' => (int)$db->lastInsertId(), 'name' => trim($first . ' ' . $last)];
}

// Возвращает ['id', 'name', 'by_admin'] или завершает запрос ошибкой
function bookingClient(PDO $db, array $actor, array $d): array {
    if (($actor['role'] ?? '') !== 'admin') {
        return ['id' => (int)$actor['id'], 'name' => (string)$actor['name'], 'by_admin' => false];
    }
    if (!empty($d['user_id'])) {
        $st = $db->prepare('SELECT id, name FROM users WHERE id = ? AND active = 1');
        $st->execute([(int)$d['user_id']]);
        $u = $st->fetch();
        if (!$u) err('Клиент не найден', 404);
        return ['id' => (int)$u['id'], 'name' => $u['name'], 'by_admin' => true];
    }

    $n = $d['new_client'] ?? null;
    if (!is_array($n)) err('Выберите клиента');
    $c = createPhoneClient($db, $n);
    // Документы, которые новый клиент подписал в студии при записи (new_client.consents: ['offer', …]).
    // Необязательны: по звонку клиента записывают без них, подписанное отмечают позже в его карточке
    $codes = array_values(array_unique(array_map('strval', (array)($n['consents'] ?? []))));
    if ($codes) consentAccept($db, $c['id'], $codes, 'admin', (int)$actor['id']);
    return ['id' => $c['id'], 'name' => $c['name'], 'by_admin' => true, 'created' => true];
}

// Клиент переносит свою запись сам, пока до её начала больше client_booking_lead_minutes (тот же параметр,
// что у записи); позже — через администратора. $date, $time — начало переносимого занятия. Текст ошибки или null
function bookingMoveLate(PDO $db, int $locId, string $date, string $time): ?string {
    $now   = branchNow($db, $locId);
    $lead  = settingInt($db, 'client_booking_lead_minutes', 60);
    $start = new DateTimeImmutable($date . ' ' . substr($time, 0, 5), $now->getTimezone());
    if ($start >= $now->modify('+' . $lead . ' minutes')) return null;
    return 'Перенести запись самостоятельно можно не позже чем за ' . fmtMinutes($lead) . ' до начала — свяжитесь с администратором';
}

// Клиент уже записан на другое занятие, пересекающееся по времени. Текст ошибки или null.
// $skipSlot — занятие, которое не считаем (перенос записи: её собственное время не помеха)
function bookingClientClash(PDO $db, int $userId, string $date, int $start, int $dur, bool $byAdmin = false, int $skipSlot = 0): ?string {
    $st = $db->prepare("SELECT s.name, s.start_time, s.duration FROM bookings b JOIN slots s ON s.id = b.slot_id
                        WHERE b.user_id = ? AND b.status <> 'cancelled' AND s.active = 1 AND s.slot_date = ? AND s.id <> ?");
    $st->execute([$userId, $date, $skipSlot]);
    foreach ($st->fetchAll() as $o) {
        $oStart = specTimeToMin(substr($o['start_time'], 0, 5));
        $oEnd = $oStart + (int)$o['duration'];
        if ($start < $oEnd && $oStart < $start + $dur) {
            return ($byAdmin ? 'У клиента уже есть запись на это время: ' : 'В это время вы уже записаны: ') . minToTimeStr($oStart) . '–' . minToTimeStr($oEnd) . ' «' . $o['name'] . '»';
        }
    }
    return null;
}
