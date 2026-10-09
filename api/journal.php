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
//           bookings: [{id, user_id, name, phone, station_id, payment_status, notes}], blocked: [station_id]}]}
// Дни филиала подряд: $days дней, начиная с $from. Каждый день — в виде, описанном выше (action=day).
// Данные берутся запросами на весь период (занятия, записи, блокировки станков — по одному запросу; график
// специалиста — два запроса на специалиста), а не на каждый день: число запросов не растёт с длиной периода
function journalDays(PDO $db, int $locId, string $from, int $days): array {
    $start = new DateTimeImmutable($from);
    $dates = [];
    for ($i = 0; $i < $days; $i++) $dates[] = $start->modify('+' . $i . ' day')->format('Y-m-d');
    $to = $dates[count($dates) - 1];

    $st = $db->prepare('SELECT s.id, s.label, t.name AS type_name FROM stations s
                        JOIN station_type t ON t.id = s.type_id
                        WHERE s.location_id = ? AND s.active = 1 ORDER BY s.sort_order, s.id');
    $st->execute([$locId]);
    $stations = array_map(fn($r) => ['id' => (int)$r['id'], 'label' => $r['label'], 'type_name' => $r['type_name']], $st->fetchAll());

    // Занятия периода: $slots — по id, $byDate — id занятий каждого дня по порядку
    $st = $db->prepare('SELECT s.id, s.slot_date, s.library_id, s.name, s.start_time, s.duration, s.price, s.specialist_id, s.auto_created,
                               dc.code AS cat, dt.code AS type, sp.name AS spec_name, sp.full_name AS spec_full
                        FROM slots s
                        JOIN dictionaries dc ON dc.id = s.category_id
                        LEFT JOIN library l ON l.id = s.library_id
                        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                        LEFT JOIN specialists_view sp ON sp.id = s.specialist_id
                        WHERE s.location_id = ? AND s.slot_date BETWEEN ? AND ? AND s.active = 1
                        ORDER BY s.slot_date, s.start_time, s.id');
    $st->execute([$locId, $from, $to]);
    $slots = [];
    $byDate = array_fill_keys($dates, []);
    foreach ($st->fetchAll() as $r) {
        $begin = specTimeToMin(substr($r['start_time'], 0, 5));
        $slots[(int)$r['id']] = [
            'id' => (int)$r['id'], 'library_id' => $r['library_id'] !== null ? (int)$r['library_id'] : null,
            'name' => $r['name'], 'cat' => $r['cat'], 'type' => $r['type'],
            'from' => $begin, 'to' => $begin + (int)$r['duration'], 'price' => (int)$r['price'],
            'specialist_id' => $r['specialist_id'] !== null ? (int)$r['specialist_id'] : null,
            'specialist' => $r['spec_full'] ?: $r['spec_name'],
            'individual' => (bool)$r['auto_created'],   // слот создан записью клиента — один клиент
            'bookings' => [], 'blocked' => [],
        ];
        $byDate[$r['slot_date']][] = (int)$r['id'];
    }

    // Кто записан (без отменённых) и какие станки заблокированы на занятие
    $st = $db->prepare("SELECT b.id, b.slot_id, b.station_id, b.payment_status, b.notes, u.id AS user_id, u.name, u.phone,
                               u.has_account, u.phone_verified_at, " . consentsOkSql($db, 'u.id') . " AS consents_ok
                        FROM bookings b
                        JOIN slots s ON s.id = b.slot_id
                        JOIN users u ON u.id = b.user_id
                        WHERE s.location_id = ? AND s.slot_date BETWEEN ? AND ? AND s.active = 1 AND b.status <> 'cancelled'
                        ORDER BY b.id");
    $st->execute([$locId, $from, $to]);
    foreach ($st->fetchAll() as $r) {
        $slots[(int)$r['slot_id']]['bookings'][] = [
            'id' => (int)$r['id'], 'user_id' => (int)$r['user_id'], 'name' => $r['name'], 'phone' => phoneView($r['phone']),
            'station_id' => $r['station_id'] !== null ? (int)$r['station_id'] : null,
            'payment_status' => $r['payment_status'], 'notes' => $r['notes'],
            // для пометок «нет кабинета», «номер не подтверждён», «согласий нет»
            'has_account' => (bool)$r['has_account'], 'phone_verified' => $r['phone_verified_at'] !== null,
            'consents_ok' => (bool)$r['consents_ok'],
        ];
    }
    $st = $db->prepare('SELECT k.slot_id, k.station_id FROM slot_station_blocks k
                        JOIN slots s ON s.id = k.slot_id
                        WHERE s.location_id = ? AND s.slot_date BETWEEN ? AND ? AND s.active = 1');
    $st->execute([$locId, $from, $to]);
    foreach ($st->fetchAll() as $r) $slots[(int)$r['slot_id']]['blocked'][] = (int)$r['station_id'];

    // Услуги филиала — вкладки журнала рядом с «Тренировками»: категории услуг, доступные в филиале
    // (к ним в каждом дне добавляются категории, на которые в этот день уже есть запись, даже если их отключили)
    $st = $db->prepare("SELECT c.code, c.name FROM dictionaries c
                        JOIN location_dictionaries ld ON ld.dictionary_id = c.id AND ld.location_id = ? AND ld.active = 1
                        WHERE c.group_code = 'service_category' AND c.active = 1 ORDER BY c.id");
    $st->execute([$locId]);
    $baseCats = array_map(fn($r) => ['code' => $r['code'], 'name' => $r['name']], $st->fetchAll());
    $catNames = [];   // названия отключённых категорий — по мере надобности

    // Специалисты услуг этого филиала (cats — в каких вкладках показывать) и их часы работы здесь на каждый день периода
    $st = $db->prepare("SELECT sp.id, sp.name, sp.full_name, c.code AS cat FROM specialists_view sp
                        JOIN user_roles t ON t.user_id = sp.user_id AND t.amnd_state = 'A'
                        JOIN dictionaries c ON c.ref_id = t.role_id AND c.group_code = 'service_category' AND c.active = 1
                        JOIN location_dictionaries ld ON ld.dictionary_id = c.id AND ld.location_id = ? AND ld.active = 1
                                                     AND ld.location_id = t.location_id
                        WHERE sp.active = 1 ORDER BY sp.name, sp.id");
    $st->execute([$locId]);
    $byId = [];
    foreach ($st->fetchAll() as $r) {
        $id = (int)$r['id'];
        $byId[$id] ??= ['id' => $id, 'name' => $r['name'], 'full_name' => $r['full_name'], 'cats' => [], 'work' => []];
        $byId[$id]['cats'][] = $r['cat'];
    }
    $work = [];   // специалист => дата => [{from, to}] в этом филиале
    foreach ($byId as $id => $sp) {
        foreach (specialistAvailability($db, $id, $from, $to) as $day) {
            foreach ($day['intervals'] as $iv) {
                if ((int)$iv['location_id'] === $locId) $work[$id][$day['date']][] = ['from' => specTimeToMin($iv['from']), 'to' => specTimeToMin($iv['to'])];
            }
        }
    }

    // Режим работы филиала по дням недели (то же правило, что slotBranchHours)
    $loc = specLocationOrNull($db, $locId);
    $hoursOf = function (string $date) use ($loc): ?array {
        if (!$loc) return null;
        if ($loc['days'] === null) return ['from' => 0, 'to' => 24 * 60];
        $h = $loc['days'][specDayName($date)] ?? null;
        return $h ? ['from' => specTimeToMin($h['from']), 'to' => specTimeToMin($h['to'])] : null;
    };

    $out = [];
    foreach ($dates as $date) {
        $daySlots = array_map(fn($id) => $slots[$id], $byDate[$date]);

        $categories = $baseCats;
        foreach ($daySlots as $s) {
            if ($s['cat'] !== 'training' && !in_array($s['cat'], array_column($categories, 'code'), true)) {
                $catNames[$s['cat']] ??= slotDict($db, 'service_category', $s['cat'])['name'];
                $categories[] = ['code' => $s['cat'], 'name' => $catNames[$s['cat']]];
            }
        }

        // Колонки услуг: специалисты, которые работают здесь в этот день, плюс те, на кого в этот день уже есть
        // запись на услугу (даже если график или роль с тех пор изменили)
        $booked = [];   // специалист => категории услуг, на которые к нему записаны в этот день
        foreach ($daySlots as $s) {
            if ($s['cat'] !== 'training' && $s['specialist_id']) {
                $booked[$s['specialist_id']]['name'] = $s['specialist'];
                $booked[$s['specialist_id']]['cats'][$s['cat']] = true;
            }
        }
        $specialists = [];
        foreach ($byId as $id => $sp) {
            $sp['work'] = $work[$id][$date] ?? [];
            if (!$sp['work'] && !isset($booked[$id])) continue;
            $sp['cats'] = array_values(array_unique(array_merge($sp['cats'], array_keys($booked[$id]['cats'] ?? []))));
            $specialists[] = $sp;
            unset($booked[$id]);
        }
        foreach ($booked as $id => $b) {
            $specialists[] = ['id' => (int)$id, 'name' => $b['name'], 'full_name' => $b['name'], 'cats' => array_keys($b['cats']), 'work' => []];
        }

        $out[] = [
            'date' => $date, 'location_id' => $locId,
            'hours' => $hoursOf($date),
            'stations' => $stations,
            'categories' => $categories,
            'specialists' => $specialists,
            'slots' => $daySlots,
        ];
    }
    return $out;
}

// Филиал и дата из запроса (общие для day и range): право journal в этом филиале, дата — YYYY-MM-DD
function journalArgs(PDO $db, string $dateParam): array {
    $locId = (int)($_GET['location_id'] ?? 0);
    authCan('journal', $locId);
    $date = (string)($_GET[$dateParam] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) err('Некорректная дата');
    if (!specLocationOrNull($db, $locId)) err('Филиал не найден или недействующий', 404);
    return [$locId, $date];
}

if ($method === 'GET' && $action === 'day') {
    $db = getDB();
    [$locId, $date] = journalArgs($db, 'date');
    ok(journalDays($db, $locId, $date, 1)[0]);
}

// GET ?action=range&location_id=&from=YYYY-MM-DD[&days=63] — несколько дней подряд одним ответом (недельный вид
// услуги в журнале): [день, день, …] — каждый в том же виде, что у action=day. Не больше 63 дней
const JOURNAL_RANGE_MAX = 63;   // девять полных недель — два месяца вперёд
if ($method === 'GET' && $action === 'range') {
    $db = getDB();
    [$locId, $from] = journalArgs($db, 'from');
    $days = max(1, min(JOURNAL_RANGE_MAX, (int)($_GET['days'] ?? JOURNAL_RANGE_MAX)));
    ok(journalDays($db, $locId, $from, $days));
}

err('Неизвестный endpoint', 404);
