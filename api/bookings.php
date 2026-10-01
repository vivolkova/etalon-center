<?php
// api/bookings.php — Записи на тренировки (с выбором станка/места)
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — мои записи
if ($method === 'GET' && $action === 'my') {
    $user = authUser();
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT b.*, s.name AS slot_name, s.slot_date, s.start_time, s.duration, s.price AS price, dc.code AS category,
               s.location_id, t.name AS specialist_name, st.label AS station_label
        FROM bookings b
        JOIN slots s ON b.slot_id = s.id
        JOIN dictionaries dc ON s.category_id = dc.id
        LEFT JOIN specialists t ON s.specialist_id = t.id
        LEFT JOIN stations st ON b.station_id = st.id
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
                   dc.code AS category,
                   t.name AS specialist_name, t.full_name AS specialist_full,
                   st.label AS station_label, stt.name AS station_type_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN slots s ON b.slot_id = s.id
            JOIN dictionaries dc       ON s.category_id = dc.id
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

// POST — создать запись (на конкретный станок; байкфит — без станка)
if ($method === 'POST' && $action === 'create') {
    $user = authUser();
    $d    = input();
    require_fields($d, ['slot_id']);

    $slotId    = (int)$d['slot_id'];
    $notes     = trim($d['notes'] ?? '');
    if ($notes === '') $notes = null;
    $db        = getDB();

    // Слот существует и активен
    $stmt = $db->prepare('SELECT s.*, dc.code AS category, dt.code AS type FROM slots s
                            JOIN dictionaries dc ON s.category_id = dc.id
                            LEFT JOIN library l ON l.id = s.library_id
                            LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                           WHERE s.id=? AND s.active=1');
    $stmt->execute([$slotId]);
    $slot = $stmt->fetch();
    if (!$slot) err('Слот не найден');
    // Индивидуальное занятие создаётся вместе с записью клиента (api/individual.php) — вторую запись не принимаем
    if (slotIsIndividual($slot['category'], $slot['type'])) err('Это индивидуальное занятие — на него записан другой клиент');

    // В зале (на станках) проходят только тренировки; сюда доходят только групповые (индивидуальные отсечены выше)
    $usesHall  = $slot['category'] === 'training';
    $stationId = null;
    $station   = null;

    if ($usesHall) {
        require_fields($d, ['station_id']);
        $stationId = (int)$d['station_id'];

        // Станок активен и принадлежит филиалу слота
        $stmt = $db->prepare('SELECT * FROM stations WHERE id=? AND active=1 AND location_id=?');
        $stmt->execute([$stationId, (int)$slot['location_id']]);
        $station = $stmt->fetch();
        if (!$station) err('Станок недоступен');

        // Станок не заблокирован на это занятие (персоналка/ремонт)
        $stmt = $db->prepare('SELECT id FROM slot_station_blocks WHERE slot_id=? AND station_id=?');
        $stmt->execute([$slotId, $stationId]);
        if ($stmt->fetch()) err('Станок недоступен на это занятие');

        // Быстрая дружелюбная проверка «место свободно».
        // Настоящая гарантия от гонки — UNIQUE-индекс uq_booking_station_active (ловим ниже).
        $stmt = $db->prepare('SELECT id FROM bookings WHERE slot_id=? AND station_id=? AND status <> "cancelled"');
        $stmt->execute([$slotId, $stationId]);
        if ($stmt->fetch()) err('Это место уже занято');
    }

    // Пользователь ещё не записан на этот слот
    $stmt = $db->prepare('SELECT id FROM bookings WHERE user_id=? AND slot_id=? AND status <> "cancelled"');
    $stmt->execute([$user['id'], $slotId]);
    if ($stmt->fetch()) err('Вы уже записаны на это занятие');

    $db->beginTransaction();
    try {
        // Лочим строку слота (FOR UPDATE сериализует все брони этого слота -> без гонки).
        // Вместимость берём из locations.max_people (единый источник), taken — из слота.
        $cap = $db->prepare('SELECT taken, location_id FROM slots WHERE id=? FOR UPDATE');
        $cap->execute([$slotId]);
        $capRow = $cap->fetch();
        if ($usesHall) {
            $lc = $db->prepare('SELECT max_people FROM locations WHERE id=?');
            $lc->execute([(int)($capRow['location_id'] ?? 0)]);
            $maxPeople = (int)$lc->fetchColumn();
            // Заблокированные на занятие станки (ремонт и т.п.) уменьшают число мест;
            // станок, занятый записью, не считаем второй раз
            $bl = $db->prepare('SELECT COUNT(*) FROM slot_station_blocks b
                                 JOIN stations st ON st.id = b.station_id AND st.active = 1
                                WHERE b.slot_id = ?
                                  AND NOT EXISTS (SELECT 1 FROM bookings bk WHERE bk.slot_id = b.slot_id AND bk.station_id = b.station_id AND bk.status <> "cancelled")');
            $bl->execute([$slotId]);
            $maxPeople -= (int)$bl->fetchColumn();
        } else {
            $maxPeople = 1;   // байкфит: один клиент на слот (строка слота залочена — без гонки)
        }
        if ($capRow && (int)$capRow['taken'] >= $maxPeople) {
            $db->rollBack();
            err($usesHall ? 'Свободных мест нет' : 'Это время уже занято');
        }

        $stmt = $db->prepare('INSERT INTO bookings (user_id, slot_id, station_id, notes, status) VALUES (?,?,?,?,\'booked\')');
        $stmt->execute([$user['id'], $slotId, $stationId, $notes]);
        $bookingId = $db->lastInsertId();

        // Кэш занятости слота: атомарный инкремент под блокировкой строки (без гонки).
        // Настоящая защита от овербукинга — UNIQUE-индекс выше; это счётчик для отображения.
        $db->prepare('UPDATE slots SET taken = taken + 1 WHERE id = ?')->execute([$slotId]);

        // Уведомление администратору
        $stmt = $db->prepare('INSERT INTO notifications (type,title,message) VALUES (?,?,?)');
        $stmt->execute([
            'booking',
            'Новая запись',
            $user['name'] . ' — ' . $slot['name'] . ($station ? ' (' . $station['label'] . ')' : '') . ' ' . $slot['slot_date'],
        ]);

        $db->commit();
        ok(['id' => $bookingId], 'Запись создана');
    } catch (PDOException $e) {
        $db->rollBack();
        // Гонка: место заняли между проверкой и вставкой — сработал UNIQUE-индекс
        err('Это место только что заняли, выберите другое');
    }
}

// PUT — изменить статус (admin: confirm/cancel; user: cancel своей)
if ($method === 'PUT' && $action === 'status') {
    $auth   = authUser();
    $d      = input();
    $id     = (int)($d['id'] ?? 0);
    $status = $d['status'] ?? '';

    if (!$id || !$status) err('Неверные параметры');

    $db   = getDB();
    $stmt = $db->prepare('SELECT b.*, s.name AS slot_name, dc.code AS category, dt.code AS type FROM bookings b
                            JOIN slots s ON b.slot_id=s.id
                            JOIN dictionaries dc ON dc.id = s.category_id
                            LEFT JOIN library l ON l.id = s.library_id
                            LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                           WHERE b.id=?');
    $stmt->execute([$id]);
    $booking = $stmt->fetch();
    if (!$booking) err('Запись не найдена', 404);
    // Индивидуальное занятие существует только вместе с записью: отмена снимает и занятие,
    // вернуть отменённую нельзя (время могли занять) — записаться заново
    $individual = slotIsIndividual($booking['category'], $booking['type']);
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

        $db->prepare('INSERT INTO notifications (type,title,message) VALUES (?,?,?)')
           ->execute([
               $status === 'cancelled' ? 'cancel' : 'booking',
               $status === 'cancelled' ? 'Запись отменена' : 'Запись обновлена',
               $booking['slot_name'] . ' (запись #' . $id . ')',
           ]);

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
