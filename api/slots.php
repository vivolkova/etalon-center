<?php
// api/slots.php — Расписание (слоты). Категория и тип берутся из справочника dictionaries.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Проверка: занятие целиком в режиме работы филиала (locations.work_hours).
// work_hours — [{day:'Понедельник', open, from:'HH:MM', to:'HH:MM'}, …]; если не задан — не ограничиваем.
function checkWorkHours($db, $locId, $date, $startTime, $duration) {
    // Время начала — с шагом 15 минут
    if (!preg_match('/^([01]\d|2[0-3]):(00|15|30|45)/', (string)$startTime)) {
        err('Время начала — с шагом 15 минут (например, 10:00, 10:15, 10:30, 10:45)');
    }

    $st = $db->prepare('SELECT work_hours FROM locations WHERE id = ?');
    $st->execute([(int)$locId]);
    $hours = json_decode((string)$st->fetchColumn(), true);
    if (!is_array($hours) || !$hours) return;

    $days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    $ts = strtotime($date);
    if ($ts === false) err('Некорректная дата занятия');
    $dayName = $days[(int)date('N', $ts) - 1];

    $day = null;
    foreach ($hours as $h) { if (($h['day'] ?? '') === $dayName) { $day = $h; break; } }
    if (!$day || empty($day['open']) || empty($day['from']) || empty($day['to'])) {
        err('В этот день (' . $dayName . ') филиал не работает');
    }

    $toMin = function ($t) { $p = explode(':', $t); return (int)$p[0] * 60 + (int)($p[1] ?? 0); };
    $start = $toMin(substr($startTime, 0, 5));
    $end   = $start + (int)$duration;
    if ($start < $toMin($day['from']) || $end > $toMin($day['to'])) {
        err('Занятие должно быть в режиме работы филиала: ' . $day['from'] . '–' . $day['to']);
    }
}

// Админ ставит в расписание только групповые тренировки (training + slot_type group) — всегда из записи
// библиотеки этого же филиала. Запись — источник названия и категории слота.
function slotLibrary(PDO $db, $libraryId, int $locId): array {
    if (empty($libraryId)) err('Выберите тренировку из библиотеки');
    $st = $db->prepare('SELECT l.id, l.name, l.location_id, l.activity_category_id, dc.code AS cat, dt.code AS type FROM library l
                        JOIN dictionaries dc ON dc.id = l.activity_category_id
                        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                        WHERE l.id = ? AND l.active = 1');
    $st->execute([(int)$libraryId]);
    $lib = $st->fetch();
    if (!$lib) err('Запись библиотеки не найдена', 404);
    if (!($lib['cat'] === 'training' && $lib['type'] === 'group')) err('В расписание можно добавлять только групповые тренировки');
    if ((int)$lib['location_id'] !== $locId) err('Тренировка «' . $lib['name'] . '» — из библиотеки другого филиала');
    return $lib;
}

// Проверка занятия (middleware/slot_rules.php): зал свободен, специалист может провести.
// $id — изменяемый слот, $lib — запись библиотеки (категория и тип занятия)
function checkSlotRequest(PDO $db, array $d, ?int $id, array $lib): void {
    checkSlot($db, [
        'id'            => $id,
        'location_id'   => (int)$d['location_id'],
        'date'          => $d['slot_date'],
        'start'         => substr((string)$d['start_time'], 0, 5),
        'duration'      => (int)($d['duration'] ?? 60),
        'cat'           => $lib['cat'],
        'type'          => $lib['type'],
        'specialist_id' => !empty($d['specialist_id']) ? (int)$d['specialist_id'] : null,
    ]);
}

// GET — список слотов
if ($method === 'GET' && $action === 'list') {
    $db    = getDB();
    $from  = $_GET['from'] ?? date('Y-m-d');
    $to    = $_GET['to']   ?? date('Y-m-d', strtotime('+14 days'));
    $cat   = $_GET['cat']  ?? null;

    $sql = 'SELECT s.*, dc.code AS category, dc.name AS category_name,
                   dt.code AS type, dt.name AS type_name,
                   t.name AS specialist_name, t.full_name AS specialist_full,
                   l.summary, l.details,
                   loc.max_people,
                   (SELECT COUNT(*) FROM slot_station_blocks b
                                        JOIN stations st ON st.id = b.station_id AND st.active = 1
                                       WHERE b.slot_id = s.id
                                         AND NOT EXISTS (SELECT 1 FROM bookings bk WHERE bk.slot_id = s.id AND bk.station_id = b.station_id AND bk.status <> "cancelled")) AS blocked
            FROM slots s
            LEFT JOIN specialists t   ON s.specialist_id = t.id
            LEFT JOIN library  l   ON s.library_id = l.id
            JOIN locations   loc ON s.location_id = loc.id
            JOIN dictionaries dc ON s.category_id = dc.id
            LEFT JOIN dictionaries dt ON l.slot_type_id = dt.id
            WHERE s.slot_date BETWEEN ? AND ? AND s.active = 1';
    $params = [$from, $to];
    if ($cat) { $sql .= ' AND dc.code = ?'; $params[] = $cat; }
    $sql .= ' ORDER BY s.slot_date, s.start_time';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    ok($stmt->fetchAll());
}

// GET — один слот
if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db   = getDB();
    $stmt = $db->prepare('SELECT s.*, dc.code AS category, dc.name AS category_name,
                                 dt.code AS type, dt.name AS type_name, t.name AS specialist_name,
                                 l.summary, l.details,
                                 loc.max_people,
                   (SELECT COUNT(*) FROM slot_station_blocks b
                                        JOIN stations st ON st.id = b.station_id AND st.active = 1
                                       WHERE b.slot_id = s.id
                                         AND NOT EXISTS (SELECT 1 FROM bookings bk WHERE bk.slot_id = s.id AND bk.station_id = b.station_id AND bk.status <> "cancelled")) AS blocked
                          FROM slots s
                          LEFT JOIN specialists t   ON s.specialist_id = t.id
                          LEFT JOIN library  l   ON s.library_id = l.id
                          JOIN locations   loc ON s.location_id = loc.id
                          JOIN dictionaries dc ON s.category_id = dc.id
                          LEFT JOIN dictionaries dt ON l.slot_type_id = dt.id
                          WHERE s.id = ?');
    $stmt->execute([$id]);
    $slot = $stmt->fetch();
    if (!$slot) err('Слот не найден', 404);
    ok($slot);
}

// POST — создать слот (только admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['slot_date', 'start_time', 'price', 'location_id']);

    $db = getDB();
    $locId = (int)$d['location_id'];   // филиал выбирается на форме
    // Групповая тренировка из библиотеки этого филиала — источник названия и категории
    $lib = slotLibrary($db, $d['library_id'] ?? null, $locId);
    // Время занятия — в пределах режима работы филиала
    checkWorkHours($db, $locId, $d['slot_date'], $d['start_time'], $d['duration'] ?? 60);

    // Зал свободен; специалист нужен ли, работает ли в это время в этом филиале, свободен ли (с блокировкой строк)
    $db->beginTransaction();
    checkSlotRequest($db, $d, null, $lib);

    // Вместимость не хранится в слоте — она берётся из locations.max_people.
    $stmt = $db->prepare('INSERT INTO slots (location_id,library_id,name,category_id,slot_date,start_time,duration,specialist_id,price)
                          VALUES (?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $locId,
        (int)$lib['id'],
        $lib['name'],
        (int)$lib['activity_category_id'],
        $d['slot_date'],
        $d['start_time'],
        $d['duration']    ?? 60,
        $d['specialist_id']  ?? null,
        $d['price'],
    ]);
    $newId = $db->lastInsertId();
    $db->commit();
    ok(['id' => (int)$newId], 'Слот создан');
}

// PUT — обновить слот (только admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    require_fields($d, ['location_id', 'slot_date', 'start_time']);
    $db = getDB();
    $locId = (int)$d['location_id'];
    $lib = slotLibrary($db, $d['library_id'] ?? null, $locId);
    // Время занятия — в пределах режима работы филиала
    checkWorkHours($db, $locId, $d['slot_date'], $d['start_time'], $d['duration'] ?? 60);

    // Зал свободен; специалист нужен ли, работает ли в это время в этом филиале, свободен ли (с блокировкой строк)
    $db->beginTransaction();
    checkSlotRequest($db, $d, $id, $lib);

    // Вместимость не хранится в слоте — она берётся из locations.max_people.
    $stmt = $db->prepare('UPDATE slots SET location_id=?,library_id=?,name=?,category_id=?,slot_date=?,start_time=?,duration=?,specialist_id=?,price=? WHERE id=?');
    $stmt->execute([
        $locId,
        (int)$lib['id'],
        $lib['name'], (int)$lib['activity_category_id'], $d['slot_date'],
        $d['start_time'], $d['duration'] ?? 60,
        $d['specialist_id'] ?? null, $d['price'],
        $id,
    ]);
    $db->commit();
    ok(null, 'Слот обновлён');
}

// DELETE — удалить слот (только admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE slots SET active=0 WHERE id=?')->execute([$id]);
    ok(null, 'Слот удалён');
}

err('Неизвестный endpoint', 404);
