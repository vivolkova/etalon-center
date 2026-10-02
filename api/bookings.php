<?php
// api/bookings.php — Записи на тренировки (с выбором станка/места)
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
require_once __DIR__ . '/../middleware/booking_client.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — мои записи
if ($method === 'GET' && $action === 'my') {
    $user = authUser();
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT b.*, s.name AS slot_name, s.slot_date, s.start_time, s.duration, s.price AS price, dc.code AS category,
               dt.code AS type, s.location_id, s.library_id, s.specialist_id, s.auto_created,
               t.name AS specialist_name, st.label AS station_label, stt.icon AS station_icon
        FROM bookings b
        JOIN slots s ON b.slot_id = s.id
        JOIN dictionaries dc ON s.category_id = dc.id
        LEFT JOIN library l ON l.id = s.library_id
        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
        LEFT JOIN specialists t ON s.specialist_id = t.id
        LEFT JOIN stations st ON b.station_id = st.id
        LEFT JOIN station_type stt ON stt.id = st.type_id
        WHERE b.user_id = ?
        ORDER BY s.slot_date DESC, s.start_time DESC
    ');
    $stmt->execute([$user['id']]);
    ok($stmt->fetchAll());
}

// GET — все записи (admin)
if ($method === 'GET' && $action === 'all') {
    authAdmin();
    $db     = getDB();
    $status = $_GET['status'] ?? null;
    $search = $_GET['search'] ?? null;
    // Период — по дате занятия. По умолчанию окно вокруг сегодня (−7 … +30 дней); from/to — для истории.
    $isDate = fn($v) => is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v);
    $from   = $isDate($_GET['from'] ?? null) ? $_GET['from'] : date('Y-m-d', strtotime('-7 days'));
    $to     = $isDate($_GET['to'] ?? null)   ? $_GET['to']   : date('Y-m-d', strtotime('+30 days'));
    $locId  = (int)($_GET['location_id'] ?? 0);   // 0 — все филиалы

    $sql = 'SELECT b.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
                   s.name AS slot_name, s.slot_date, s.start_time, s.price AS price, s.location_id,
                   dc.code AS category, dt.code AS type,
                   t.name AS specialist_name, t.full_name AS specialist_full,
                   st.label AS station_label, stt.name AS station_type_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN slots s ON b.slot_id = s.id
            JOIN dictionaries dc       ON s.category_id = dc.id
            LEFT JOIN library l        ON l.id = s.library_id
            LEFT JOIN dictionaries dt  ON dt.id = l.slot_type_id
            LEFT JOIN specialists t    ON s.specialist_id = t.id
            LEFT JOIN stations st      ON b.station_id = st.id
            LEFT JOIN station_type stt ON st.type_id = stt.id
            WHERE s.slot_date BETWEEN ? AND ?';
    $params = [$from, $to];
    if ($locId) { $sql .= ' AND s.location_id = ?'; $params[] = $locId; }

    if ($status) { $sql .= ' AND b.status=?'; $params[] = $status; }
    if ($search) {
        $sql .= ' AND (u.name LIKE ? OR u.email LIKE ? OR s.name LIKE ?)';
        $like = "%$search%";
        $params = array_merge($params, [$like, $like, $like]);
    }
    $sql .= ' ORDER BY b.created_at DESC';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok($stmt->fetchAll());
}

// Станок для записи на занятие: активен, из филиала занятия, не заблокирован на него и не занят другой записью.
// Текст ошибки или null. $skipBooking — запись, которую не считаем (перенос: её собственный станок не помеха)
function bookingStationError(PDO $db, int $slotId, int $locId, int $stationId, int $skipBooking = 0): ?string {
    $st = $db->prepare('SELECT id FROM stations WHERE id=? AND active=1 AND location_id=?');
    $st->execute([$stationId, $locId]);
    if (!$st->fetch()) return 'Станок недоступен';
    // Станок не заблокирован на это занятие (ремонт и т.п.)
    $st = $db->prepare('SELECT id FROM slot_station_blocks WHERE slot_id=? AND station_id=?');
    $st->execute([$slotId, $stationId]);
    if ($st->fetch()) return 'Станок недоступен на это занятие';
    // Быстрая понятная проверка «место свободно»; гарантия от гонки — UNIQUE-индекс uq_booking_station_active
    $st = $db->prepare('SELECT id FROM bookings WHERE slot_id=? AND station_id=? AND status <> "cancelled" AND id <> ?');
    $st->execute([$slotId, $stationId, $skipBooking]);
    return $st->fetch() ? 'Это место уже занято' : null;
}

// Сколько клиентов вмещает занятие в зале: вместимость филиала (locations.max_people — единый источник) минус
// станки, заблокированные на это занятие (станок, занятый записью, второй раз не считаем)
function bookingHallCapacity(PDO $db, int $slotId, int $locId): int {
    $lc = $db->prepare('SELECT max_people FROM locations WHERE id=?');
    $lc->execute([$locId]);
    $bl = $db->prepare('SELECT COUNT(*) FROM slot_station_blocks b
                         JOIN stations st ON st.id = b.station_id AND st.active = 1
                        WHERE b.slot_id = ?
                          AND NOT EXISTS (SELECT 1 FROM bookings bk WHERE bk.slot_id = b.slot_id AND bk.station_id = b.station_id AND bk.status <> "cancelled")');
    $bl->execute([$slotId]);
    return (int)$lc->fetchColumn() - (int)$bl->fetchColumn();
}

// POST — создать запись на занятие из расписания (групповая тренировка — на конкретный станок).
// Клиент записывает себя; администратор — клиента из журнала записи: user_id или new_client: {name, phone}
// (middleware/booking_client.php). Клиент не может быть записан на два занятия в одно время.
if ($method === 'POST' && $action === 'create') {
    $user = authUser();
    $d    = input();
    require_fields($d, ['slot_id']);

    $slotId    = (int)$d['slot_id'];
    $notes     = trim($d['notes'] ?? '');
    if ($notes === '') $notes = null;
    $db        = getDB();

    // Слот существует и активен
    $stmt = $db->prepare('SELECT s.*, dc.code AS category FROM slots s
                            JOIN dictionaries dc ON s.category_id = dc.id
                           WHERE s.id=? AND s.active=1');
    $stmt->execute([$slotId]);
    $slot = $stmt->fetch();
    if (!$slot) err('Слот не найден');
    // Индивидуальное занятие создаётся вместе с записью клиента (api/individual.php) — вторую запись не принимаем
    if ((int)$slot['auto_created']) err('Это индивидуальное занятие — на него записан другой клиент');

    // В зале (на станках) проходят только тренировки; сюда доходят только групповые (индивидуальные отсечены выше)
    $usesHall  = $slot['category'] === 'training';
    $stationId = null;

    if ($usesHall) {
        require_fields($d, ['station_id']);
        $stationId = (int)$d['station_id'];
        if ($e = bookingStationError($db, $slotId, (int)$slot['location_id'], $stationId)) err($e);
    }

    beginCheckedTx($db);
    // Для кого запись (нового клиента администратор заводит здесь же — внутри транзакции записи)
    $client = bookingClient($db, $user, $d);
    // Строка клиента — «очередь по клиенту»: две одновременные записи одного клиента (групповая и индивидуальная,
    // сайт и журнал, двойное нажатие) идут по очереди, и проверка пересечений ниже видит запись, сделанную первой
    $db->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE')->execute([$client['id']]);

    // Клиент ещё не записан на этот слот и не занят в это время на другом занятии
    $stmt = $db->prepare('SELECT id FROM bookings WHERE user_id=? AND slot_id=? AND status <> "cancelled"');
    $stmt->execute([$client['id'], $slotId]);
    if ($stmt->fetch()) { $db->rollBack(); err($client['by_admin'] ? 'Клиент уже записан на это занятие' : 'Вы уже записаны на это занятие'); }
    $clash = bookingClientClash($db, $client['id'], $slot['slot_date'], specTimeToMin(substr($slot['start_time'], 0, 5)), (int)$slot['duration'], $client['by_admin']);
    if ($clash) { $db->rollBack(); err($clash); }

    try {
        // Лочим строку слота (FOR UPDATE сериализует все брони этого слота -> без гонки).
        // Вместимость берём из locations.max_people (единый источник), taken — из слота.
        $cap = $db->prepare('SELECT taken, location_id FROM slots WHERE id=? FOR UPDATE');
        $cap->execute([$slotId]);
        $capRow = $cap->fetch();
        // В зале — вместимость филиала минус заблокированные станки; байкфит — один клиент на слот
        // (строка слота залочена — без гонки)
        $maxPeople = $usesHall ? bookingHallCapacity($db, $slotId, (int)($capRow['location_id'] ?? 0)) : 1;
        if ($capRow && (int)$capRow['taken'] >= $maxPeople) {
            $db->rollBack();
            err($usesHall ? 'Свободных мест нет' : 'Это время уже занято');
        }

        $stmt = $db->prepare('INSERT INTO bookings (user_id, slot_id, station_id, notes, status) VALUES (?,?,?,?,\'booked\')');
        $stmt->execute([$client['id'], $slotId, $stationId, $notes]);
        $bookingId = $db->lastInsertId();

        // Кэш занятости слота: атомарный инкремент под блокировкой строки (без гонки).
        // Настоящая защита от овербукинга — UNIQUE-индекс выше; это счётчик для отображения.
        $db->prepare('UPDATE slots SET taken = taken + 1 WHERE id = ?')->execute([$slotId]);


        $db->commit();
        ok(['id' => (int)$bookingId, 'user_id' => $client['id']], 'Запись создана');
    } catch (PDOException $e) {
        $db->rollBack();
        // Гонка: место заняли между проверкой и вставкой — сработал UNIQUE-индекс
        err('Это место только что заняли, выберите другое');
    }
}

// PUT ?action=move — перенос записи на групповую тренировку (администратор — любой, клиент — своей):
// {booking_id, slot_id, station_id}.
// slot_id — та же тренировка (пересадка на другой станок) или другая групповая тренировка этого же филиала.
// Запись, комментарий и отметка об оплате сохраняются. Оплаченную запись нельзя перенести на тренировку с другой
// ценой (оплаты и возвратов пока нет). Запись, которая уже началась, и перенос на прошедшую тренировку — нельзя.
// Клиент переносит не позже чем за client_booking_lead_minutes до начала.
if ($method === 'PUT' && $action === 'move') {
    $user  = authUser();
    $admin = ($user['role'] ?? '') === 'admin';
    $d = input();
    require_fields($d, ['booking_id', 'slot_id', 'station_id']);
    $db = getDB();
    $bookingId = (int)$d['booking_id'];
    $toId      = (int)$d['slot_id'];
    $stationId = (int)$d['station_id'];

    $st = $db->prepare("SELECT b.id, b.user_id, b.slot_id, b.station_id, b.payment_status,
                               s.location_id, s.slot_date, s.start_time, s.price, s.auto_created
                        FROM bookings b JOIN slots s ON s.id = b.slot_id
                        WHERE b.id = ? AND b.status <> 'cancelled' AND s.active = 1");
    $st->execute([$bookingId]);
    $cur = $st->fetch();
    if (!$cur || (int)$cur['auto_created'] || (!$admin && (int)$cur['user_id'] !== (int)$user['id'])) {
        err('Запись не найдена или это не запись на групповую тренировку', 404);
    }
    $fromId = (int)$cur['slot_id'];
    $locId  = (int)$cur['location_id'];

    $st = $db->prepare('SELECT s.id, s.location_id, s.slot_date, s.start_time, s.duration, s.price, s.auto_created, dc.code AS category
                        FROM slots s JOIN dictionaries dc ON dc.id = s.category_id
                        WHERE s.id = ? AND s.active = 1');
    $st->execute([$toId]);
    $to = $st->fetch();
    if (!$to || (int)$to['auto_created'] || $to['category'] !== 'training') err('Тренировка не найдена', 404);
    if ((int)$to['location_id'] !== $locId) err('Перенос между филиалами не делается — отмените запись и создайте новую');
    if ($toId === $fromId && $stationId === (int)$cur['station_id']) err('Ничего не изменено — выберите другую тренировку или станок');

    $now = branchNow($db, $locId);
    $at  = fn(array $slot) => new DateTimeImmutable($slot['slot_date'] . ' ' . substr($slot['start_time'], 0, 5), $now->getTimezone());
    if ($at($cur) < $now) err('Занятие уже началось или прошло — такую запись перенести нельзя');
    if ($toId !== $fromId && $at($to) < $now) err('Нельзя перенести запись на прошедшую тренировку');
    if (!$admin && ($e = bookingMoveLate($db, $locId, $cur['slot_date'], $cur['start_time']))) err($e);

    if ($cur['payment_status'] === 'paid' && (int)$to['price'] !== (int)$cur['price']) {
        err('Запись оплачена (' . number_format((int)$cur['price'], 0, '', ' ') . ' ₽), а у выбранной тренировки цена '
            . number_format((int)$to['price'], 0, '', ' ') . ' ₽. Перенос с изменением цены для оплаченных записей пока недоступен');
    }

    beginCheckedTx($db);
    $fail = function (string $m) use ($db) { $db->rollBack(); err($m); };
    $db->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE')->execute([(int)$cur['user_id']]);
    // Строки обоих занятий — в порядке id (два встречных переноса не заблокируют друг друга)
    $lock = $db->prepare('SELECT taken FROM slots WHERE id = ? FOR UPDATE');
    $taken = [];
    foreach (array_unique([min($fromId, $toId), max($fromId, $toId)]) as $sid) { $lock->execute([$sid]); $taken[$sid] = (int)$lock->fetchColumn(); }

    if ($e = bookingStationError($db, $toId, $locId, $stationId, $bookingId)) $fail($e);
    if ($toId !== $fromId) {
        $st = $db->prepare('SELECT id FROM bookings WHERE user_id=? AND slot_id=? AND status <> "cancelled"');
        $st->execute([(int)$cur['user_id'], $toId]);
        if ($st->fetch()) $fail($admin ? 'Клиент уже записан на эту тренировку' : 'Вы уже записаны на эту тренировку');
        // Клиент не занят в это время на другом занятии (свою переносимую запись не считаем)
        $clash = bookingClientClash($db, (int)$cur['user_id'], $to['slot_date'], specTimeToMin(substr($to['start_time'], 0, 5)), (int)$to['duration'], $admin, $fromId);
        if ($clash) $fail($clash);
        if ($taken[$toId] >= bookingHallCapacity($db, $toId, $locId)) $fail('На этой тренировке свободных мест нет');
    }

    try {
        $db->prepare('UPDATE bookings SET slot_id = ?, station_id = ? WHERE id = ?')->execute([$toId, $stationId, $bookingId]);
        if ($toId !== $fromId) {
            $db->prepare('UPDATE slots SET taken = GREATEST(taken - 1, 0) WHERE id = ?')->execute([$fromId]);
            $db->prepare('UPDATE slots SET taken = taken + 1 WHERE id = ?')->execute([$toId]);
        }
        $db->commit();
    } catch (PDOException $e) {
        $db->rollBack();
        err('Это место только что заняли, выберите другое');   // сработал UNIQUE-индекс станка
    }
    ok(['booking_id' => $bookingId, 'slot_id' => $toId, 'station_id' => $stationId], 'Запись перенесена');
}

// PUT — изменить статус (admin: confirm/cancel; user: cancel своей)
if ($method === 'PUT' && $action === 'status') {
    $auth   = authUser();
    $d      = input();
    $id     = (int)($d['id'] ?? 0);
    $status = $d['status'] ?? '';

    if (!$id || !$status) err('Неверные параметры');

    $db   = getDB();
    $stmt = $db->prepare('SELECT b.*, s.name AS slot_name, s.auto_created, dc.code AS category FROM bookings b
                            JOIN slots s ON b.slot_id=s.id
                            JOIN dictionaries dc ON dc.id = s.category_id
                           WHERE b.id=?');
    $stmt->execute([$id]);
    $booking = $stmt->fetch();
    if (!$booking) err('Запись не найдена', 404);
    // Индивидуальное занятие существует только вместе с записью: отмена снимает и занятие,
    // вернуть отменённую нельзя (время могли занять) — записаться заново
    $individual = (bool)$booking['auto_created'];   // слот создан этой записью (api/individual.php)
    if ($individual && $status === 'booked' && $booking['status'] === 'cancelled') {
        err('Индивидуальное занятие отменено — запишитесь заново');
    }

    // Клиент может только отменять свои записи
    if ($auth['role'] !== 'admin') {
        if ($booking['user_id'] != $auth['id']) err('Нет доступа', 403);
        if ($status !== 'cancelled') err('Нет доступа', 403);
    }

    // допустимые статусы брони
    if (!in_array($status, ['booked', 'cancelled'], true)) err('Неизвестный статус');

    $slotId = (int)$booking['slot_id'];
    $db->beginTransaction();
    try {
        // Меняем статус только при реальном переходе (WHERE status<>new).
        // rowCount()>0 => переход состоялся именно в этом запросе — тогда и правим счётчик.
        // Так двойная отмена/повторная запись не задвоят taken (защита от гонки).
        $upd = $db->prepare('UPDATE bookings SET status=? WHERE id=? AND status<>?');
        $upd->execute([$status, $id, $status]);
        $changed = $upd->rowCount() > 0;

        if ($changed && $status === 'cancelled') {
            $db->prepare('UPDATE slots SET taken = GREATEST(taken - 1, 0)' . ($individual ? ', active = 0' : '') . ' WHERE id = ?')->execute([$slotId]);
        } elseif ($changed && $status === 'booked') {
            $db->prepare('UPDATE slots SET taken = taken + 1 WHERE id = ?')->execute([$slotId]);
        }


        $db->commit();
        ok(null, 'Статус обновлён');
    } catch (Exception $e) {
        $db->rollBack();
        err('Ошибка обновления');
    }
}

// PUT — обновить статус оплаты (только admin)
if ($method === 'PUT' && $action === 'payment') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);

    $db   = getDB();
    $stmt = $db->prepare('SELECT id FROM bookings WHERE id=?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) err('Запись не найдена', 404);

    $db->prepare('UPDATE bookings SET payment_status=?, payment_id=? WHERE id=?')
       ->execute([$d['payment_status'] ?? 'paid', $d['payment_id'] ?? null, $id]);
    ok(null, 'Оплата обновлена');
}

err('Неизвестный endpoint', 404);
