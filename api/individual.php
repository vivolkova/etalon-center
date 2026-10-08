<?php
// api/individual.php — Индивидуальная запись клиента: персональная и самостоятельная тренировка, услуги (байкфит и др.).
// Запись = новый слот (снимок записи библиотеки, один клиент) + бронь клиента — в одной транзакции.
// Правила те же, что у занятий админки (middleware/slot_rules.php): режим работы филиала, зал, специалист
// (график, другие занятия). Дополнительно: клиент не записан в это время на другое занятие,
// запись не позже чем за client_booking_lead_minutes до начала и не дальше client_booking_horizon_days дней.
// На тренировке клиент сам выбирает станок: он должен быть свободен на всём интервале с учётом других занятий,
// которые идут в зале в это же время. На услугу можно записаться, если в филиале есть специалист с графиком.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
require_once __DIR__ . '/../middleware/booking_client.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

const IND_STEP = 30;   // шаг времени начала и длительности самостоятельной, мин

// Можно ли записаться индивидуально: персональная / самостоятельная тренировка или услуга (её оказывает специалист)
function indBookable(string $cat, ?string $type): bool {
    return $cat !== 'training' || in_array($type, ['personal', 'free'], true);
}

// Запись библиотеки для индивидуальной записи (с кодами категории и типа) или ошибка
function indLibrary(PDO $db, int $libId): array {
    $st = $db->prepare('SELECT l.*, dc.code AS cat, dc.ref_id, dt.code AS type FROM library l
                        JOIN dictionaries dc ON dc.id = l.activity_category_id
                        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                        WHERE l.id = ? AND l.active = 1');
    $st->execute([$libId]);
    $lib = $st->fetch();
    if (!$lib) err('Занятие не найдено', 404);
    if (!indBookable($lib['cat'], $lib['type'])) err('На «' . $lib['name'] . '» нельзя записаться индивидуально');
    $locId = (int)$lib['location_id'];
    if (!specLocationOrNull($db, $locId)) err('Филиал недействующий');
    if (!dictAvailableAt($db, (int)$lib['activity_category_id'], $locId)) err('Занятие недоступно в этом филиале');
    return $lib;
}

// Длительности самостоятельной: от длительности библиотеки с шагом 30 мин до free_training_max_minutes.
// У остальных — только длительность из библиотеки
function indDurations(PDO $db, array $lib): array {
    $base = (int)$lib['duration'];
    if ($lib['type'] !== 'free') return [$base];
    $max = settingInt($db, 'free_training_max_minutes', 180);
    $out = [];
    for ($m = $base; $m <= $max; $m += IND_STEP) $out[] = $m;
    return $out ?: [$base];
}

// Цена занятия длительностью $dur минут. У самостоятельной тренировки цена библиотеки — за её длительность
// (первый час), за каждые следующие IND_STEP минут — доплата free_training_extra_price. У остальных — цена библиотеки
function indPrice(PDO $db, array $lib, int $dur): int {
    $price = (int)$lib['price'];
    if ($lib['type'] !== 'free') return $price;
    $steps = (int)ceil(max(0, $dur - (int)$lib['duration']) / IND_STEP);
    return $price + $steps * settingInt($db, 'free_training_extra_price', 500);
}

// Окно записи: дата от сегодня до горизонта, начало не раньше чем через lead минут (по времени филиала).
// Текст ошибки или null
function indWindowError(PDO $db, int $locId, string $date, ?int $startMin = null): ?string {
    $now = branchNow($db, $locId);
    $horizon = settingInt($db, 'client_booking_horizon_days', 30);
    if ($date < $now->format('Y-m-d')) return 'Эта дата уже прошла';
    if ($date > $now->modify('+' . $horizon . ' days')->format('Y-m-d')) return 'Записаться можно не больше чем на ' . $horizon . ' дн. вперёд';
    if ($startMin !== null) {
        $lead = settingInt($db, 'client_booking_lead_minutes', 60);
        $start = new DateTimeImmutable($date . ' ' . minToTimeStr($startMin), $now->getTimezone());
        if ($start < $now->modify('+' . $lead . ' minutes')) {
            return 'Записаться можно не позже чем за ' . fmtMinutes($lead) . ' до начала';
        }
    }
    return null;
}

// Данные для правил занятия (checkSlot / slotRuleError)
function indSlot(array $lib, ?int $specId, string $date, int $start, int $dur): array {
    return ['id' => null, 'location_id' => (int)$lib['location_id'], 'date' => $date, 'start' => minToTimeStr($start),
            'duration' => $dur, 'cat' => $lib['cat'], 'type' => $lib['type'], 'specialist_id' => $specId];
}

// Специалисты, которые ведут занятие в его филиале: работающие, с ролью категории в этом филиале,
// в графике есть часы в этом филиале. [{id, name, full_name}]
function indSpecialists(PDO $db, array $lib): array {
    if (!activityNeedsSpecialist($lib['cat'], $lib['type']) || !$lib['ref_id']) return [];
    $locId = (int)$lib['location_id'];
    $st = $db->prepare("SELECT s.id, s.name, s.full_name FROM specialists_view s
                        JOIN user_roles ur ON ur.user_id = s.user_id AND ur.role_id = ? AND ur.location_id = ? AND ur.amnd_state = 'A'
                        WHERE s.active = 1 ORDER BY s.name");
    $st->execute([(int)$lib['ref_id'], $locId]);
    $specs = $st->fetchAll();
    if (!$specs) return [];
    // и в его графике есть часы в этом филиале
    $hours = specialistsHoursMap($db, array_column($specs, 'id'), date('Y-m-d'));
    return array_values(array_filter($specs, fn($s) => in_array($locId, specLocationIds($hours[$s['id']] ?? []), true)));
}

// Занятие, специалист и длительность из параметров запроса (общие для times / stations / create / move)
function indArgs(PDO $db, array $p): array {
    $lib = indLibrary($db, (int)($p['library_id'] ?? 0));
    $dur = (int)($p['duration'] ?? 0) ?: (int)$lib['duration'];
    if (!in_array($dur, indDurations($db, $lib), true)) err('Недопустимая длительность');
    $specId = null;
    if (activityNeedsSpecialist($lib['cat'], $lib['type'])) {
        $specId = (int)($p['specialist_id'] ?? 0);
        if (!$specId) err('Выберите специалиста');
        if (!in_array($specId, array_map('intval', array_column(indSpecialists($db, $lib), 'id')), true)) {
            err('Специалист не ведёт это занятие в этом филиале');
        }
    } elseif (!empty($p['specialist_id'])) {
        err('У этого занятия нет специалиста');
    }
    return [$lib, $specId, $dur];
}

// Перенос записи: занятие, которое не считаем занятым (его время и станок свободны для него самого).
// Администратор переносит любую запись; клиент — только свою индивидуальную, чужое занятие не пропускаем
function indSkipSlot(PDO $db, array $user, int $slotId): int {
    if (!$slotId || ($user['role'] ?? '') === 'admin') return $slotId;
    $st = $db->prepare("SELECT 1 FROM bookings b JOIN slots s ON s.id = b.slot_id
                        WHERE s.id = ? AND s.active = 1 AND s.auto_created = 1 AND b.user_id = ? AND b.status <> 'cancelled'");
    $st->execute([$slotId, (int)$user['id']]);
    return $st->fetchColumn() ? $slotId : 0;
}

// ═══ Занятость и свободное время — расчёт в памяти по данным, загруженным один раз на диапазон дат ═══
// Те же правила, что в slot_rules.php (зал, график специалиста, его занятия) плюс записи клиента и станки.
// Используется для показа (times / stations); при записи всё перепроверяет slotRuleError в транзакции.

// Всё, что занимает зал, специалиста, клиента и станки в датах [$from; $to]. Интервалы — в минутах от начала суток:
// hall[дата] — тренировки в зале филиала [{from, to, shared}] (shared — персональная/самостоятельная);
// spec[дата] — занятия специалиста во всех филиалах [{id, from, to, loc}]; avail[дата] — его рабочие интервалы;
// mine[дата] — занятия, на которые записан клиент [{id, name, from, to, loc}];
// stations — активные станки филиала; taken[дата] — занятые и заблокированные станки [{station, from, to}].
// $skipSlot — занятие, которое не учитываем (перенос записи: её собственные время и станок считаются свободными)
function indLoad(PDO $db, array $lib, ?int $specId, int $userId, string $from, string $to, int $skipSlot = 0): array {
    $locId = (int)$lib['location_id'];
    $span  = fn(array $r): array => ['from' => specTimeToMin(substr($r['start_time'], 0, 5)),
                                     'to'   => specTimeToMin(substr($r['start_time'], 0, 5)) + (int)$r['duration']];
    $d = ['hall' => [], 'spec' => [], 'avail' => [], 'mine' => [], 'stations' => [], 'taken' => []];

    if ($lib['cat'] === 'training') {
        $st = $db->prepare("SELECT s.slot_date, s.start_time, s.duration, dt.code AS type FROM slots s
                            JOIN dictionaries dc ON dc.id = s.category_id AND dc.code = 'training'
                            LEFT JOIN library l ON l.id = s.library_id
                            LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                            WHERE s.location_id = ? AND s.active = 1 AND s.slot_date BETWEEN ? AND ? AND s.id <> ?");
        $st->execute([$locId, $from, $to, $skipSlot]);
        foreach ($st->fetchAll() as $r) {
            $d['hall'][$r['slot_date']][] = $span($r) + ['shared' => in_array($r['type'], ['personal', 'free'], true)];
        }
        $st = $db->prepare('SELECT id FROM stations WHERE location_id = ? AND active = 1');
        $st->execute([$locId]);
        $d['stations'] = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        $st = $db->prepare("SELECT b.station_id, s.slot_date, s.start_time, s.duration FROM bookings b
                            JOIN slots s ON s.id = b.slot_id
                            WHERE s.location_id = ? AND s.active = 1 AND s.slot_date BETWEEN ? AND ? AND s.id <> ?
                              AND b.status <> 'cancelled' AND b.station_id IS NOT NULL
                            UNION ALL
                            SELECT k.station_id, s.slot_date, s.start_time, s.duration FROM slot_station_blocks k
                            JOIN slots s ON s.id = k.slot_id
                            WHERE s.location_id = ? AND s.active = 1 AND s.slot_date BETWEEN ? AND ? AND s.id <> ?");
        $st->execute([$locId, $from, $to, $skipSlot, $locId, $from, $to, $skipSlot]);
        foreach ($st->fetchAll() as $r) {
            $d['taken'][$r['slot_date']][] = $span($r) + ['station' => (int)$r['station_id']];
        }
    }
    if ($specId) {
        $st = $db->prepare('SELECT s.id, s.slot_date, s.start_time, s.duration, s.location_id FROM slots s
                            WHERE s.specialist_id = ? AND s.active = 1 AND s.slot_date BETWEEN ? AND ? AND s.id <> ?');
        $st->execute([$specId, $from, $to, $skipSlot]);
        foreach ($st->fetchAll() as $r) {
            $d['spec'][$r['slot_date']][] = $span($r) + ['id' => (int)$r['id'], 'loc' => (int)$r['location_id']];
        }
        foreach (specialistAvailability($db, $specId, $from, $to) as $day) {
            $d['avail'][$day['date']] = array_map(fn($iv) => ['from' => specTimeToMin($iv['from']), 'to' => specTimeToMin($iv['to']),
                                                               'loc' => (int)$iv['location_id']], $day['intervals']);
        }
    }
    if ($userId) {
        $st = $db->prepare("SELECT s.id, s.name, s.slot_date, s.start_time, s.duration, s.location_id FROM bookings b
                            JOIN slots s ON s.id = b.slot_id
                            WHERE b.user_id = ? AND b.status <> 'cancelled' AND s.active = 1 AND s.slot_date BETWEEN ? AND ? AND s.id <> ?");
        $st->execute([$userId, $from, $to, $skipSlot]);
        foreach ($st->fetchAll() as $r) {
            $d['mine'][$r['slot_date']][] = $span($r) + ['id' => (int)$r['id'], 'name' => $r['name'], 'loc' => (int)$r['location_id']];
        }
    }
    return $d;
}

// Станки, свободные на всём интервале [$from; $to) в дату
function indFreeStations(array $d, string $date, int $from, int $to): array {
    $busy = [];
    foreach ($d['taken'][$date] ?? [] as $t) {
        if ($from < $t['to'] && $t['from'] < $to) $busy[$t['station']] = true;
    }
    return array_values(array_filter($d['stations'], fn($id) => !isset($busy[$id])));
}

// Можно ли начать занятие в $m минут в дату: null — да, иначе код причины
// (window — вне окна записи, closed — вне режима работы, off — специалист не работает здесь, busy — у него занятие,
// group — зал занят, mine — клиент уже записан, full — нет свободных станков)
function indStartError(PDO $db, array $lib, ?int $specId, array $d, string $date, int $m, int $dur): ?string {
    $locId = (int)$lib['location_id'];
    $end   = $m + $dur;
    // Окно записи (не позже чем за N минут, не дальше M дней) — только для клиента; администратор записывает без него
    if (empty($d['no_window']) && indWindowError($db, $locId, $date, $m)) return 'window';
    $b = slotBranchHours($db, $locId, $date);
    if (!$b || $m < $b['from'] || $end > $b['to']) return 'closed';
    if ($specId) {
        $fits = false;
        foreach ($d['avail'][$date] ?? [] as $iv) {
            if ($iv['loc'] === $locId && $iv['from'] <= $m && $end <= $iv['to']) { $fits = true; break; }
        }
        if (!$fits) return 'off';
        foreach ($d['spec'][$date] ?? [] as $o) {
            if ($m < $o['to'] && $o['from'] < $end) return 'busy';
        }
    }
    if ($lib['cat'] === 'training') {
        // персональная/самостоятельная может идти одновременно с такой же, но не с групповой
        foreach ($d['hall'][$date] ?? [] as $o) {
            if (!$o['shared'] && $m < $o['to'] && $o['from'] < $end) return 'group';
        }
    }
    foreach ($d['mine'][$date] ?? [] as $o) {
        if ($m < $o['to'] && $o['from'] < $end) return 'mine';
    }
    if ($lib['cat'] === 'training' && !indFreeStations($d, $date, $m, $end)) return 'full';
    return null;
}

// Возможные времена начала в дату (минуты), шаг IND_STEP
function indDayStarts(PDO $db, array $lib, ?int $specId, array $d, string $date, int $dur): array {
    $b = slotBranchHours($db, (int)$lib['location_id'], $date);
    if (!$b) return [];
    $out = [];
    for ($m = (int)ceil($b['from'] / IND_STEP) * IND_STEP; $m + $dur <= $b['to']; $m += IND_STEP) {
        if (indStartError($db, $lib, $specId, $d, $date, $m, $dur) === null) $out[] = $m;
    }
    return $out;
}

// GET ?action=options&location_id=X — на что можно записаться в филиале: занятия со специалистами и длительностями,
// плюс параметры окна записи (публичный)
if ($method === 'GET' && $action === 'options') {
    $locId = (int)($_GET['location_id'] ?? 0);
    $db = getDB();
    if (!specLocationOrNull($db, $locId)) err('Филиал не найден или недействующий', 404);
    $st = $db->prepare('SELECT l.*, dc.code AS cat, dc.ref_id, dt.code AS type FROM library l
                        JOIN dictionaries dc ON dc.id = l.activity_category_id
                        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                        WHERE l.location_id = ? AND l.active = 1 ORDER BY dc.id, l.name');
    $st->execute([$locId]);
    $items = [];
    foreach ($st->fetchAll() as $lib) {
        if (!indBookable($lib['cat'], $lib['type'])) continue;
        if (!dictAvailableAt($db, (int)$lib['activity_category_id'], $locId)) continue;
        $needs = activityNeedsSpecialist($lib['cat'], $lib['type']);
        $specs = indSpecialists($db, $lib);
        // Вести некому: тренировку не предлагаем; услугу показываем на странице «Услуги» без записи (bookable = false)
        if ($needs && !$specs && $lib['cat'] === 'training') continue;
        $items[] = [
            'id' => (int)$lib['id'], 'name' => $lib['name'], 'cat' => $lib['cat'], 'type' => $lib['type'],
            'duration' => (int)$lib['duration'], 'price' => (int)$lib['price'],
            'summary' => $lib['summary'], 'details' => $lib['details'],
            'needs_specialist' => $needs, 'durations' => indDurations($db, $lib), 'specialists' => $specs,
            // prices — цена для каждой длительности из durations (у самостоятельной растёт с длительностью);
            // extra_price — доплата за каждые IND_STEP минут сверх длительности библиотеки (только у самостоятельной)
            'prices' => array_map(fn($m) => indPrice($db, $lib, $m), indDurations($db, $lib)),
            'extra_price' => $lib['type'] === 'free' ? settingInt($db, 'free_training_extra_price', 500) : null,
            'bookable' => !$needs || (bool)$specs,
        ];
    }
    ok([
        'items'        => $items,
        'today'        => branchNow($db, $locId)->format('Y-m-d'),
        'horizon_days' => settingInt($db, 'client_booking_horizon_days', 30),
        'lead_minutes' => settingInt($db, 'client_booking_lead_minutes', 60),
        'step'         => IND_STEP,
    ]);
}

// GET ?action=times&library_id=&specialist_id=&date=&duration=[&user_id=&skip_slot_id=] — свободные времена начала: {times: ['10:00', …], message}
// message — почему свободного времени нет (пустой список)
if ($method === 'GET' && $action === 'times') {
    $user  = authUser();
    $db    = getDB();
    [$lib, $specId, $dur] = indArgs($db, $_GET);
    $date  = (string)($_GET['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) err('Некорректная дата');
    $locId = (int)$lib['location_id'];
    adminAt($user, $locId);

    // Администратор подбирает время для клиента (журнал записи): без окна записи; пересечения — с записями
    // выбранного клиента (user_id), если он уже выбран
    $admin = ($user['role'] ?? '') === 'admin';
    $forId = $admin ? (int)($_GET['user_id'] ?? 0) : (int)$user['id'];
    // Перенос записи: переносимое занятие не считаем занятым временем
    $skip  = indSkipSlot($db, $user, (int)($_GET['skip_slot_id'] ?? 0));

    $none = fn(string $m) => ok(['times' => [], 'message' => $m]);
    if (!$admin && ($e = indWindowError($db, $locId, $date))) $none($e);
    if (!slotBranchHours($db, $locId, $date)) $none('В этот день филиал не работает');
    $d = indLoad($db, $lib, $specId, $forId, $date, $date, $skip);
    $d['no_window'] = $admin;
    if ($specId) {
        $here = array_filter($d['avail'][$date] ?? [], fn($iv) => $iv['loc'] === $locId);
        if (!$here) $none(!empty($d['avail'][$date]) ? 'Специалист в этот день работает в другом филиале' : 'Специалист в этот день не работает');
    }
    $times = array_map('minToTimeStr', indDayStarts($db, $lib, $specId, $d, $date, $dur));
    ok(['times' => $times, 'message' => $times ? '' : 'На этот день свободного времени нет']);
}

// GET ?action=stations&library_id=&date=&start=HH:MM&duration= — схема зала на время занятия:
// {cols, rows, stations: [{id, label, pos_x, pos_y, icon, type_name, state: free|taken}]}. Не тренировка — станков нет
if ($method === 'GET' && $action === 'stations') {
    $user = authUser();
    $db = getDB();
    $skip = indSkipSlot($db, $user, (int)($_GET['skip_slot_id'] ?? 0));   // перенос записи: её станок свободен
    $lib = indLibrary($db, (int)($_GET['library_id'] ?? 0));
    adminAt($user, (int)$lib['location_id']);
    $dur = (int)($_GET['duration'] ?? 0) ?: (int)$lib['duration'];
    if (!in_array($dur, indDurations($db, $lib), true)) err('Недопустимая длительность');
    $date = (string)($_GET['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) err('Некорректная дата');
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)($_GET['start'] ?? ''))) err('Некорректное время начала');
    $start = specTimeToMin((string)$_GET['start']);
    $locId = (int)$lib['location_id'];
    if ($lib['cat'] !== 'training') ok(['cols' => 0, 'rows' => 0, 'stations' => []]);

    $free = indFreeStations(indLoad($db, $lib, null, 0, $date, $date, $skip), $date, $start, $start + $dur);
    $st = $db->prepare('SELECT s.id, s.label, s.pos_x, s.pos_y, t.name AS type_name, t.icon AS icon FROM stations s
                        JOIN station_type t ON t.id = s.type_id
                        WHERE s.location_id = ? AND s.active = 1 ORDER BY s.sort_order, s.id');
    $st->execute([$locId]);
    $stations = array_map(fn($r) => $r + ['state' => in_array((int)$r['id'], $free, true) ? 'free' : 'taken'], $st->fetchAll());
    $lc = $db->prepare('SELECT hall_cols, hall_rows FROM locations WHERE id = ?');
    $lc->execute([$locId]);
    $loc = $lc->fetch();
    ok(['cols' => (int)$loc['hall_cols'], 'rows' => (int)$loc['hall_rows'], 'stations' => $stations]);
}

// POST ?action=create — записаться: {library_id, specialist_id, date, start, duration, station_id, notes}.
// Администратор записывает клиента: плюс user_id или new_client: {first_name, last_name, phone} (middleware/booking_client.php)
if ($method === 'POST' && $action === 'create') {
    $user = authUser();
    $d    = input();
    require_fields($d, ['library_id', 'date', 'start']);
    $db   = getDB();
    [$lib, $specId, $dur] = indArgs($db, $d);
    adminAt($user, (int)$lib['location_id']);   // администратор записывает клиента только в своём филиале
    consentsGuard($db, $user);                  // клиент записывается сам — только приняв действующие документы
    $date = (string)$d['date'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) err('Некорректная дата');
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$d['start'])) err('Некорректное время начала');
    $start = specTimeToMin((string)$d['start']);
    if ($start % IND_STEP) err('Время начала — с шагом ' . IND_STEP . ' минут');
    $notes = trim((string)($d['notes'] ?? ''));
    // Окно записи действует только на клиента; администратор записывает клиента по звонку без него
    $admin = ($user['role'] ?? '') === 'admin';
    if (!$admin && ($e = indWindowError($db, (int)$lib['location_id'], $date, $start))) err($e);
    // Тренировка проходит на станке — клиент выбирает его сам; у услуг (байкфит) станка нет
    $stationId = null;
    if ($lib['cat'] === 'training') {
        $stationId = (int)($d['station_id'] ?? 0);
        if (!$stationId) err('Выберите станок');
    }

    beginCheckedTx($db);
    // Для кого запись: клиент — себя; администратор — выбранного или нового клиента (создаётся в этой же транзакции)
    $client = bookingClient($db, $user, $d);
    // Строка клиента — чтобы две параллельные записи одного клиента не пересеклись
    $db->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE')->execute([$client['id']]);
    // Для тренировки slotRuleError блокирует строку филиала — записи в зал идут по очереди, станок дважды не займут
    $e = slotRuleError($db, indSlot($lib, $specId, $date, $start, $dur), true)
        ?? bookingClientClash($db, $client['id'], $date, $start, $dur, $client['by_admin']);
    if ($e === null && $stationId) {
        $free = indFreeStations(indLoad($db, $lib, null, 0, $date, $date), $date, $start, $start + $dur);
        if (!in_array($stationId, $free, true)) $e = 'Этот станок недоступен на выбранное время — выберите другой';
    }
    if ($e !== null) { $db->rollBack(); err($e); }

    // auto_created = 1: слот создан записью клиента, в расписании админа не показывается
    $db->prepare('INSERT INTO slots (location_id, library_id, name, category_id, slot_date, start_time, duration, specialist_id, price, taken, auto_created)
                  VALUES (?,?,?,?,?,?,?,?,?,1,1)')
       ->execute([(int)$lib['location_id'], (int)$lib['id'], $lib['name'], (int)$lib['activity_category_id'], $date,
                  minToTimeStr($start), $dur, $specId, indPrice($db, $lib, $dur)]);
    $slotId = (int)$db->lastInsertId();
    $db->prepare("INSERT INTO bookings (user_id, slot_id, station_id, notes, status) VALUES (?,?,?,?,'booked')")
       ->execute([$client['id'], $slotId, $stationId, $notes !== '' ? $notes : null]);
    $bookingId = (int)$db->lastInsertId();
    $db->commit();
    ok(['slot_id' => $slotId, 'booking_id' => $bookingId, 'user_id' => $client['id']], 'Запись создана');
}

// PUT ?action=move — перенос индивидуальной записи (администратор — любой, клиент — своей):
// {booking_id, date, start, duration?, specialist_id?, station_id?}. Меняются день, время, длительность, специалист и
// станок; клиент и само занятие (запись библиотеки) остаются. Запись, комментарий и отметка об оплате сохраняются.
// Правила те же, что при записи, только переносимое занятие само себе не мешает. Оплаченную запись нельзя
// перенести с изменением цены (оплаты и возвратов пока нет). Прошедшую запись и на прошедшее время — нельзя.
// Клиент переносит не позже чем за client_booking_lead_minutes до начала, новое время — в окне записи.
if ($method === 'PUT' && $action === 'move') {
    $user  = authUser();
    $admin = ($user['role'] ?? '') === 'admin';
    $d  = input();
    require_fields($d, ['booking_id', 'date', 'start']);
    $db = getDB();
    $st = $db->prepare("SELECT b.id, b.user_id, b.station_id, b.payment_status, u.name AS user_name,
                               s.id AS slot_id, s.library_id, s.slot_date, s.start_time, s.duration, s.specialist_id, s.price
                        FROM bookings b
                        JOIN slots s ON s.id = b.slot_id
                        JOIN users u ON u.id = b.user_id
                        WHERE b.id = ? AND b.status <> 'cancelled' AND s.active = 1 AND s.auto_created = 1");
    $st->execute([(int)$d['booking_id']]);
    $cur = $st->fetch();
    if (!$cur || (!$admin && (int)$cur['user_id'] !== (int)$user['id'])) err('Запись не найдена или это не индивидуальная запись', 404);
    $slotId = (int)$cur['slot_id'];
    adminAt($user, slotBranch($db, $slotId));   // администратор переносит записи только своего филиала

    [$lib, $specId, $dur] = indArgs($db, [
        'library_id'    => (int)$cur['library_id'],
        'duration'      => $d['duration'] ?? (int)$cur['duration'],
        'specialist_id' => $d['specialist_id'] ?? $cur['specialist_id'],
    ]);
    $date = (string)$d['date'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) err('Некорректная дата');
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$d['start'])) err('Некорректное время начала');
    $start = specTimeToMin((string)$d['start']);
    if ($start % IND_STEP) err('Время начала — с шагом ' . IND_STEP . ' минут');
    $stationId = null;
    if ($lib['cat'] === 'training') {
        $stationId = (int)($d['station_id'] ?? $cur['station_id']);
        if (!$stationId) err('Выберите станок');
    }

    $now = branchNow($db, (int)$lib['location_id']);
    $at  = fn(string $day, string $time) => new DateTimeImmutable($day . ' ' . substr($time, 0, 5), $now->getTimezone());
    if ($at($cur['slot_date'], $cur['start_time']) < $now) err('Занятие уже началось или прошло — такую запись перенести нельзя');
    if ($at($date, minToTimeStr($start)) < $now) err('Нельзя перенести запись на прошедшее время');
    if (!$admin) {
        if ($e = bookingMoveLate($db, (int)$lib['location_id'], $cur['slot_date'], $cur['start_time'])) err($e);
        if ($e = indWindowError($db, (int)$lib['location_id'], $date, $start)) err($e);
    }

    $price = indPrice($db, $lib, $dur);
    if ($cur['payment_status'] === 'paid' && $price !== (int)$cur['price']) {
        err('Запись оплачена (' . number_format((int)$cur['price'], 0, '', ' ') . ' ₽), а после переноса цена будет '
            . number_format($price, 0, '', ' ') . ' ₽. Перенос с изменением цены для оплаченных записей пока недоступен');
    }

    beginCheckedTx($db);
    $db->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE')->execute([(int)$cur['user_id']]);
    $slot = indSlot($lib, $specId, $date, $start, $dur);
    $slot['id'] = $slotId;   // само занятие себе не мешает
    $e = slotRuleError($db, $slot, true)
        ?? bookingClientClash($db, (int)$cur['user_id'], $date, $start, $dur, $admin, $slotId);
    if ($e === null && $stationId) {
        $free = indFreeStations(indLoad($db, $lib, null, 0, $date, $date, $slotId), $date, $start, $start + $dur);
        if (!in_array($stationId, $free, true)) $e = 'Этот станок недоступен на выбранное время — выберите другой';
    }
    if ($e !== null) { $db->rollBack(); err($e); }

    $db->prepare('UPDATE slots SET slot_date = ?, start_time = ?, duration = ?, specialist_id = ?, price = ? WHERE id = ?')
       ->execute([$date, minToTimeStr($start), $dur, $specId, $price, $slotId]);
    $db->prepare('UPDATE bookings SET station_id = ? WHERE id = ?')->execute([$stationId, (int)$cur['id']]);
    $db->commit();
    ok(['slot_id' => $slotId, 'booking_id' => (int)$cur['id'], 'price' => $price], 'Запись перенесена');
}

err('Неизвестный endpoint', 404);
