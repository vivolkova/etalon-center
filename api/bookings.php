<?php
// api/bookings.php — Записи на тренировки
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — мои записи
if ($method === 'GET' && $action === 'my') {
    $user = authUser();
    $db   = getDB();
    $stmt = $db->prepare('
        SELECT b.*, s.name AS slot_name, s.slot_date, s.start_time, s.duration, s.category,
               t.name AS trainer_name
        FROM bookings b
        JOIN slots s ON b.slot_id = s.id
        LEFT JOIN trainers t ON s.trainer_id = t.id
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

    $sql = 'SELECT b.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
                   s.name AS slot_name, s.slot_date, s.start_time, s.category,
                   t.name AS trainer_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN slots s ON b.slot_id = s.id
            LEFT JOIN trainers t ON s.trainer_id = t.id
            WHERE 1=1';
    $params = [];

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

// POST — создать запись
if ($method === 'POST' && $action === 'create') {
    $user = authUser();
    $d    = input();
    require_fields($d, ['slot_id']);

    $slotId = (int)$d['slot_id'];
    $db     = getDB();

    // Проверяем слот
    $stmt = $db->prepare('SELECT * FROM slots WHERE id=? AND active=1');
    $stmt->execute([$slotId]);
    $slot = $stmt->fetch();
    if (!$slot) err('Слот не найден');
    if ($slot['taken'] >= $slot['max_people']) err('Мест нет');

    // Проверяем дубль
    $stmt = $db->prepare('SELECT id FROM bookings WHERE user_id=? AND slot_id=? AND status != "cancelled"');
    $stmt->execute([$user['id'], $slotId]);
    if ($stmt->fetch()) err('Вы уже записаны на это занятие');

    // Создаём запись
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('INSERT INTO bookings (user_id, slot_id, price, status) VALUES (?,?,?,?)');
        $stmt->execute([$user['id'], $slotId, $slot['price'], 'pending']);
        $bookingId = $db->lastInsertId();

        $db->prepare('UPDATE slots SET taken = taken + 1 WHERE id=?')->execute([$slotId]);

        // Статус клиента → active
        $db->prepare('UPDATE users SET status="active" WHERE id=? AND status="new"')->execute([$user['id']]);

        // Уведомление администратору
        $stmt = $db->prepare('INSERT INTO notifications (type,title,message) VALUES (?,?,?)');
        $stmt->execute(['booking', 'Новая запись', $user['name'] . ' — ' . $slot['name'] . ' ' . $slot['slot_date']]);

        $db->commit();
        ok(['id' => $bookingId], 'Запись создана');
    } catch (Exception $e) {
        $db->rollBack();
        err('Ошибка при создании записи');
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

    $db->beginTransaction();
    try {
        $db->prepare('UPDATE bookings SET status=? WHERE id=?')->execute([$status, $id]);

        // При отмене — освобождаем место
        if ($status === 'cancelled' && $booking['status'] !== 'cancelled') {
            $db->prepare('UPDATE slots SET taken = GREATEST(taken-1, 0) WHERE id=?')
               ->execute([$booking['slot_id']]);
        }

        // Уведомление
        $db->prepare('INSERT INTO notifications (type,title,message) VALUES (?,?,?)')
           ->execute([
               $status === 'confirmed' ? 'booking' : 'cancel',
               $status === 'confirmed' ? 'Запись подтверждена' : 'Запись отменена',
               $booking['slot_name'] . ' (запись #' . $id . ')',
           ]);

        $db->commit();
        ok(null, 'Статус обновлён');
    } catch (Exception $e) {
        $db->rollBack();
        err('Ошибка обновления');
    }
}

// PUT — обновить статус оплаты
if ($method === 'PUT' && $action === 'payment') {
    // Только администратор: иначе клиент может пометить свою запись оплаченной
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
