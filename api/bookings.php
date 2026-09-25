<?php
// api/bookings.php — Записи на тренировки (с выбором станка/места)
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — мои записи
if ($method === 'GET' && $action === 'my') {
    $user = authUser();
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT b.*, s.name AS slot_name, s.slot_date, s.start_time, s.duration, s.price AS price, dc.code AS category,
               t.name AS trainer_name, st.label AS station_label
        FROM bookings b
        JOIN slots s ON b.slot_id = s.id
        JOIN dictionaries dc ON s.category_id = dc.id
        LEFT JOIN trainers t ON s.trainer_id = t.id
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
    // По умолчанию — окно вокруг сегодня (не «все за всё время»). from/to можно передать для истории.
    $from   = $_GET['from'] ?? date('Y-m-d', strtotime('-7 days'));
    $to     = $_GET['to']   ?? date('Y-m-d', strtotime('+30 days'));

    $sql = 'SELECT b.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
                   s.name AS slot_name, s.slot_date, s.start_time, s.price AS price, dc.code AS category,
                   t.name AS trainer_name, st.label AS station_label
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN slots s ON b.slot_id = s.id
            JOIN dictionaries dc ON s.category_id = dc.id
            LEFT JOIN trainers t ON s.trainer_id = t.id
            LEFT JOIN stations st ON b.station_id = st.id
            WHERE s.slot_date BETWEEN ? AND ?';
    $params = [$from, $to];

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

// POST — создать запись (на конкретный станок)
if ($method === 'POST' && $action === 'create') {
    $user = authUser();
    $d    = input();
    require_fields($d, ['slot_id', 'station_id']);

    $slotId    = (int)$d['slot_id'];
    $stationId = (int)$d['station_id'];
    $notes     = trim($d['notes'] ?? '');
    if ($notes === '') $notes = null;
    $db        = getDB();

    // Слот существует и активен
    $stmt = $db->prepare('SELECT * FROM slots WHERE id=? AND active=1');
    $stmt->execute([$slotId]);
    $slot = $stmt->fetch();
    if (!$slot) err('Слот не найден');

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

    // Пользователь ещё не записан на этот слот
    $stmt = $db->prepare('SELECT id FROM bookings WHERE user_id=? AND slot_id=? AND status <> "cancelled"');
    $stmt->execute([$user['id'], $slotId]);
    if ($stmt->fetch()) err('Вы уже записаны на это занятие');

    $db->beginTransaction();
    try {
        $stmt = $db->prepare('INSERT INTO bookings (user_id, slot_id, station_id, notes, status) VALUES (?,?,?,?,\'booked\')');
        $stmt->execute([$user['id'], $slotId, $stationId, $notes]);
        $bookingId = $db->lastInsertId();

        // Статус клиента → active при первой записи
        $db->prepare('UPDATE users SET status="active" WHERE id=? AND status="new"')->execute([$user['id']]);

        // Уведомление администратору
        $stmt = $db->prepare('INSERT INTO notifications (type,title,message) VALUES (?,?,?)');
        $stmt->execute([
            'booking',
            'Новая запись',
            $user['name'] . ' — ' . $slot['name'] . ' (' . $station['label'] . ') ' . $slot['slot_date'],
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
    $stmt = $db->prepare('SELECT b.*, s.name AS slot_name FROM bookings b JOIN slots s ON b.slot_id=s.id WHERE b.id=?');
    $stmt->execute([$id]);
    $booking = $stmt->fetch();
    if (!$booking) err('Запись не найдена', 404);

    // Клиент может только отменять свои записи
    if ($auth['role'] !== 'admin') {
        if ($booking['user_id'] != $auth['id']) err('Нет доступа', 403);
        if ($status !== 'cancelled') err('Нет доступа', 403);
    }

    // допустимые статусы брони
    if (!in_array($status, ['booked', 'cancelled'], true)) err('Неизвестный статус');

    $db->beginTransaction();
    try {
        $db->prepare('UPDATE bookings SET status=? WHERE id=?')->execute([$status, $id]);

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
