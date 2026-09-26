<?php
// api/slots.php — Расписание (слоты). Категория и тип берутся из справочника dictionaries.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// код значения справочника -> id (ошибка, если кода нет)
function dictId($db, $group, $code) {
    $st = $db->prepare('SELECT id FROM dictionaries WHERE group_code = ? AND code = ?');
    $st->execute([$group, $code]);
    $id = $st->fetchColumn();
    if ($id === false) err('Неизвестное значение справочника ' . $group . ': ' . $code);
    return (int)$id;
}

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
                   loc.max_people
            FROM slots s
            LEFT JOIN specialists t   ON s.specialist_id = t.id
            LEFT JOIN library  l   ON s.library_id = l.id
            JOIN locations   loc ON s.location_id = loc.id
            JOIN dictionaries dc ON s.category_id = dc.id
            JOIN dictionaries dt ON s.type_id = dt.id
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
                                 loc.max_people
                          FROM slots s
                          LEFT JOIN specialists t   ON s.specialist_id = t.id
                          LEFT JOIN library  l   ON s.library_id = l.id
                          JOIN locations   loc ON s.location_id = loc.id
                          JOIN dictionaries dc ON s.category_id = dc.id
                          JOIN dictionaries dt ON s.type_id = dt.id
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
    require_fields($d, ['name', 'slot_date', 'start_time', 'price', 'location_id']);

    $db = getDB();
    // Время занятия — в пределах режима работы филиала
    checkWorkHours($db, $d['location_id'], $d['slot_date'], $d['start_time'], $d['duration'] ?? 60);
    $categoryId = dictId($db, 'activity_category', $d['category'] ?? 'training');
    $typeId     = dictId($db, 'slot_type', $d['type'] ?? 'group');
    $locId      = (int)$d['location_id'];   // филиал выбирается на форме

    // Вместимость не хранится в слоте — она берётся из locations.max_people.
    $stmt = $db->prepare('INSERT INTO slots (location_id,library_id,name,category_id,type_id,slot_date,start_time,duration,specialist_id,price)
                          VALUES (?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $locId,
        $d['library_id']  ?? null,
        $d['name'],
        $categoryId,
        $typeId,
        $d['slot_date'],
        $d['start_time'],
        $d['duration']    ?? 60,
        $d['specialist_id']  ?? null,
        $d['price'],
    ]);
    ok(['id' => $db->lastInsertId()], 'Слот создан');
}

// PUT — обновить слот (только admin)
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    require_fields($d, ['location_id', 'slot_date', 'start_time']);
    $db = getDB();
    // Время занятия — в пределах режима работы филиала
    checkWorkHours($db, $d['location_id'], $d['slot_date'], $d['start_time'], $d['duration'] ?? 60);
    $categoryId = dictId($db, 'activity_category', $d['category'] ?? 'training');

    // Вместимость не хранится в слоте — она берётся из locations.max_people.
    $stmt = $db->prepare('UPDATE slots SET location_id=?,library_id=?,name=?,category_id=?,slot_date=?,start_time=?,duration=?,specialist_id=?,price=? WHERE id=?');
    $stmt->execute([
        (int)$d['location_id'],
        $d['library_id'] ?? null,
        $d['name'], $categoryId, $d['slot_date'],
        $d['start_time'], $d['duration'] ?? 60,
        $d['specialist_id'] ?? null, $d['price'],
        $id,
    ]);
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
