<?php
// api/journal.php — Журнал записи (админка): всё, что происходит в филиале за день, — по станкам зала и по
// специалистам услуг. Групповая тренировка занимает зал целиком (кто на каком станке — в bookings), персональная и
// самостоятельная — один станок, услуга — время своего специалиста.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// GET ?action=day&location_id=&date=YYYY-MM-DD — день филиала:
// {hours: {from, to}|null (минуты; null — филиал закрыт), stations: [{id, label, type_name}],
//  categories: [{code, name}] — услуги филиала (вкладки журнала),
//  specialists: [{id, name, full_name, cats: [код услуги], work: [{from, to}]}] — колонки услуг (кто работает здесь в этот день или уже записан),
//  slots: [{id, library_id, name, cat, type, from, to, price, specialist_id, specialist, individual,
//           bookings: [{id, user_id, name, phone, email, station_id, payment_status, notes}], blocked: [station_id]}]}
if ($method === 'GET' && $action === 'day') {
    authAdmin();
    $db    = getDB();
    $locId = (int)($_GET['location_id'] ?? 0);
    $date  = (string)($_GET['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) err('Некорректная дата');
    if (!specLocationOrNull($db, $locId)) err('Филиал не найден или недействующий', 404);

    $st = $db->prepare('SELECT s.id, s.label, t.name AS type_name FROM stations s
                        JOIN station_type t ON t.id = s.type_id
                        WHERE s.location_id = ? AND s.active = 1 ORDER BY s.sort_order, s.id');
    $st->execute([$locId]);
    $stations = array_map(fn($r) => ['id' => (int)$r['id'], 'label' => $r['label'], 'type_name' => $r['type_name']], $st->fetchAll());

    // Занятия дня
    $st = $db->prepare('SELECT s.id, s.library_id, s.name, s.start_time, s.duration, s.price, s.specialist_id, s.auto_created,
                               dc.code AS cat, dt.code AS type, sp.name AS spec_name, sp.full_name AS spec_full
                        FROM slots s
                        JOIN dictionaries dc ON dc.id = s.category_id
                        LEFT JOIN library l ON l.id = s.library_id
                        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                        LEFT JOIN specialists sp ON sp.id = s.specialist_id
                        WHERE s.location_id = ? AND s.slot_date = ? AND s.active = 1
                        ORDER BY s.start_time, s.id');
    $st->execute([$locId, $date]);
    $slots = [];
    foreach ($st->fetchAll() as $r) {
        $from = specTimeToMin(substr($r['start_time'], 0, 5));
        $slots[(int)$r['id']] = [
            'id' => (int)$r['id'], 'library_id' => $r['library_id'] !== null ? (int)$r['library_id'] : null,
            'name' => $r['name'], 'cat' => $r['cat'], 'type' => $r['type'],
            'from' => $from, 'to' => $from + (int)$r['duration'], 'price' => (int)$r['price'],
            'specialist_id' => $r['specialist_id'] !== null ? (int)$r['specialist_id'] : null,
            'specialist' => $r['spec_full'] ?: $r['spec_name'],
            'individual' => (bool)$r['auto_created'],   // слот создан записью клиента — один клиент
            'bookings' => [], 'blocked' => [],
        ];
    }

    // Кто записан (без отменённых) и какие станки заблокированы на занятие
    $st = $db->prepare("SELECT b.id, b.slot_id, b.station_id, b.payment_status, b.notes, u.id AS user_id, u.name, u.phone, u.email
                        FROM bookings b
                        JOIN slots s ON s.id = b.slot_id
                        JOIN users u ON u.id = b.user_id
                        WHERE s.location_id = ? AND s.slot_date = ? AND s.active = 1 AND b.status <> 'cancelled'
                        ORDER BY b.id");
    $st->execute([$locId, $date]);
    foreach ($st->fetchAll() as $r) {
        $slots[(int)$r['slot_id']]['bookings'][] = [
            'id' => (int)$r['id'], 'user_id' => (int)$r['user_id'], 'name' => $r['name'], 'phone' => $r['phone'], 'email' => $r['email'],
            'station_id' => $r['station_id'] !== null ? (int)$r['station_id'] : null,
            'payment_status' => $r['payment_status'], 'notes' => $r['notes'],
        ];
    }
    $st = $db->prepare('SELECT k.slot_id, k.station_id FROM slot_station_blocks k
                        JOIN slots s ON s.id = k.slot_id
                        WHERE s.location_id = ? AND s.slot_date = ? AND s.active = 1');
    $st->execute([$locId, $date]);
    foreach ($st->fetchAll() as $r) $slots[(int)$r['slot_id']]['blocked'][] = (int)$r['station_id'];

    // Услуги филиала — вкладки журнала рядом с «Тренировками»: категории услуг, доступные в филиале,
    // плюс категории, на которые в этот день уже есть запись (даже если категорию с тех пор отключили)
    $st = $db->prepare("SELECT c.code, c.name FROM dictionaries c
                        JOIN location_dictionaries ld ON ld.dictionary_id = c.id AND ld.location_id = ? AND ld.active = 1
                        WHERE c.group_code = 'service_category' AND c.active = 1 ORDER BY c.id");
    $st->execute([$locId]);
    $categories = array_map(fn($r) => ['code' => $r['code'], 'name' => $r['name']], $st->fetchAll());
    foreach ($slots as $s) {
        if ($s['cat'] !== 'training' && !in_array($s['cat'], array_column($categories, 'code'), true)) {
            $categories[] = ['code' => $s['cat'], 'name' => slotDict($db, 'service_category', $s['cat'])['name']];
        }
    }

    // Колонки услуг: специалисты, которые оказывают услуги этого филиала и работают здесь в этот день,
    // плюс те, на кого в этот день уже есть запись на услугу (даже если график с тех пор изменили).
    // cats — категории услуг специалиста: в какой вкладке журнала его показывать
    $st = $db->prepare("SELECT sp.id, sp.name, sp.full_name, c.code AS cat FROM specialists sp
                        JOIN specialist_types t ON t.specialist_id = sp.id AND t.active = 1
                        JOIN dictionaries c ON c.ref_id = t.type_id AND c.group_code = 'service_category' AND c.active = 1
                        JOIN location_dictionaries ld ON ld.dictionary_id = c.id AND ld.location_id = ? AND ld.active = 1
                        WHERE sp.active = 1 ORDER BY sp.name, sp.id");
    $st->execute([$locId]);
    $byId = [];
    foreach ($st->fetchAll() as $r) {
        $id = (int)$r['id'];
        $byId[$id] ??= ['id' => $id, 'name' => $r['name'], 'full_name' => $r['full_name'], 'cats' => [], 'work' => []];
        $byId[$id]['cats'][] = $r['cat'];
    }
    $booked = [];   // специалист => категории услуг, на которые к нему записаны в этот день
    foreach ($slots as $s) {
        if ($s['cat'] !== 'training' && $s['specialist_id']) {
            $booked[$s['specialist_id']]['name'] = $s['specialist'];
            $booked[$s['specialist_id']]['cats'][$s['cat']] = true;
        }
    }
    $specialists = [];
    foreach ($byId as $id => $sp) {
        foreach (specialistAvailability($db, $id, $date, $date)[0]['intervals'] as $iv) {
            if ((int)$iv['location_id'] === $locId) $sp['work'][] = ['from' => specTimeToMin($iv['from']), 'to' => specTimeToMin($iv['to'])];
        }
        if (!$sp['work'] && !isset($booked[$id])) continue;
        $sp['cats'] = array_values(array_unique(array_merge($sp['cats'], array_keys($booked[$id]['cats'] ?? []))));
        $specialists[] = $sp;
        unset($booked[$id]);
    }
    foreach ($booked as $id => $b) {
        $specialists[] = ['id' => (int)$id, 'name' => $b['name'], 'full_name' => $b['name'], 'cats' => array_keys($b['cats']), 'work' => []];
    }

    ok([
        'date' => $date, 'location_id' => $locId,
        'hours' => slotBranchHours($db, $locId, $date),
        'stations' => $stations,
        'categories' => $categories,
        'specialists' => $specialists,
        'slots' => array_values($slots),
    ]);
}

err('Неизвестный endpoint', 404);
