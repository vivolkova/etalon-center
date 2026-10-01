<?php
// api/library.php — Библиотека тренировок и услуг.
// Единый источник описаний: слоты ссылаются на строку library через slots.library_id.
// В БД хранятся коды (category, difficulty), русские подписи — только на фронте.
// Тренировка или услуга — по категории: training (activity_category) — тренировка, значения service_category — услуги.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// код значения справочника -> id (ошибка, если кода нет)
function libDictId($db, $group, $code) {
    $st = $db->prepare('SELECT id FROM dictionaries WHERE group_code = ? AND code = ?');
    $st->execute([$group, $code]);
    $id = $st->fetchColumn();
    if ($id === false) err('Неизвестное значение справочника ' . $group . ': ' . $code);
    return (int)$id;
}

// Категория записи по коду: тренировка (activity_category) или услуга (service_category)
function libCatId($db, $code) {
    $st = $db->prepare('SELECT id FROM dictionaries WHERE group_code IN (' . CATEGORY_GROUPS_SQL . ') AND code = ?');
    $st->execute([$code]);
    $id = $st->fetchColumn();
    if ($id === false) err('Неизвестная категория: ' . $code);
    return (int)$id;
}

// Тренировки проходят в зале: в филиале должен быть настроен зал — хотя бы один активный станок
// (Настройки студии → Станки и зал)
function libCheckHall(PDO $db, int $locId): void {
    $st = $db->prepare('SELECT l.name, (SELECT COUNT(*) FROM stations s WHERE s.location_id = l.id AND s.active = 1) AS n
                        FROM locations l WHERE l.id = ?');
    $st->execute([$locId]);
    $loc = $st->fetch();
    if (!$loc) err('Филиал не найден', 404);
    if (!(int)$loc['n']) err('В филиале «' . $loc['name'] . '» не настроен зал: добавьте станки в «Настройки студии → Станки и зал»');
}

// строка БД -> объект в терминах фронтенда (dur/max/desc/cat/features)
function libRow($r) {
    return [
        'id'          => (int)$r['id'],
        'location_id' => (int)$r['location_id'],
        'name'       => $r['name'],
        'cat'        => $r['cat'],                  // код категории: training | bikefit | workshop | …
        'type'       => $r['type'],                 // slot_type: group | personal | free; у услуг null
        'dur'        => (int)$r['duration'],
        'price'      => (int)$r['price'],
        'max'        => $r['max_people'] !== null ? (int)$r['max_people'] : null,
        'difficulty' => $r['difficulty'],           // код: any | beginner | intermediate | advanced
        'desc'       => $r['summary'] ?? '',
        'features'   => $r['details'] ? json_decode($r['details'], true) : [],
        'active'     => (int)$r['active'],
    ];
}

$LIST_SQL = 'SELECT l.id, l.name, l.location_id, l.duration, l.price, loc.max_people, l.difficulty,
                    l.summary, l.details, l.active,
                    dc.code AS cat, dt.code AS type
             FROM library l
             JOIN dictionaries dc ON l.activity_category_id = dc.id
             LEFT JOIN dictionaries dt ON l.slot_type_id = dt.id
             JOIN locations   loc ON l.location_id = loc.id';

// GET — список (публичный; нужен и форме слота, и экрану «Библиотека»)
// kind=training — только тренировки, kind=service — только услуги (все категории, кроме training)
if ($method === 'GET' && $action === 'list') {
    $db  = getDB();
    $all = !empty($_GET['all']);
    if ($all) authAdmin();
    $sql = $LIST_SQL . ($all ? ' WHERE 1' : ' WHERE l.active = 1');
    $kind = $_GET['kind'] ?? '';
    if ($kind === 'training') $sql .= " AND dc.code = 'training'";
    if ($kind === 'service')  $sql .= " AND dc.code <> 'training'";
    $sql .= ' ORDER BY l.id';
    $stmt = $db->prepare($sql);
    $stmt->execute();
    ok(array_map('libRow', $stmt->fetchAll()));
}

// GET — категории занятий для фильтров и формы: training (activity_category) и услуги (service_category).
// is_service — услуга; spec_type / spec_name — тип специалиста, который ведёт категорию (dictionaries.ref_id).
if ($method === 'GET' && $action === 'categories') {
    $db   = getDB();
    $stmt = $db->prepare("SELECT d.id, d.code, d.name, (d.group_code = 'service_category') AS is_service, st.code AS spec_type, st.name AS spec_name
                          FROM dictionaries d
                          LEFT JOIN dictionaries st ON st.id = d.ref_id AND st.group_code = 'specialist_type'
                          WHERE d.group_code IN (" . CATEGORY_GROUPS_SQL . ") AND d.active = 1 ORDER BY d.group_code, d.id");
    $stmt->execute();
    ok($stmt->fetchAll());
}

// GET — один элемент
if ($method === 'GET' && $action === 'get') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db   = getDB();
    $stmt = $db->prepare($LIST_SQL . ' WHERE l.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) err('Элемент библиотеки не найден', 404);
    ok(libRow($row));
}

// POST — создать (только admin)
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    require_fields($d, ['name', 'price', 'location_id']);

    $db     = getDB();
    $catId  = libCatId($db, $d['cat'] ?? 'training');
    // Тип занятия (групповая / индивидуальная) — только у тренировок; у услуг пусто
    $typeId = ($d['cat'] ?? 'training') === 'training' ? libDictId($db, 'slot_type', $d['type'] ?? 'group') : null;
    $features = isset($d['features']) && is_array($d['features'])
        ? json_encode(array_values($d['features']), JSON_UNESCAPED_UNICODE)
        : null;

    // Вместимость не хранится в библиотеке — она задаётся в locations.max_people.
    $locId = (int)$d['location_id'];   // филиал записи выбирается на форме
    if (($d['cat'] ?? 'training') === 'training') libCheckHall($db, $locId);
    $stmt = $db->prepare('INSERT INTO library
        (location_id, name, activity_category_id, slot_type_id, duration, price, difficulty, summary, details, active)
        VALUES (?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $locId, $d['name'], $catId, $typeId,
        $d['dur']   ?? 60,
        $d['price'],
        $d['difficulty'] ?? 'any',
        $d['desc']  ?? null,
        $features,
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
    ]);
    ok(['id' => $db->lastInsertId()], 'Добавлено в библиотеку');
}

// PUT — обновить (только admin). Филиал, категория и тип занятия записи после создания не меняются: слоты хранят
// снимок занятия (филиал, название, цену…), и их смена разошлась бы с уже поставленными занятиями.
// Нужна такая же тренировка в другом филиале — отдельная запись.
if ($method === 'PUT' && $action === 'update') {
    authAdmin();
    $d  = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');

    $db  = getDB();
    $st  = $db->prepare('SELECT l.location_id, l.activity_category_id, l.slot_type_id, dc.code AS cat, dt.code AS type FROM library l
                         JOIN dictionaries dc ON dc.id = l.activity_category_id
                         LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id WHERE l.id = ?');
    $st->execute([$id]);
    $cur = $st->fetch();
    if (!$cur) err('Запись библиотеки не найдена', 404);
    if (isset($d['location_id']) && (int)$d['location_id'] !== (int)$cur['location_id']) {
        err('Филиал записи библиотеки после создания не меняется — для другого филиала создайте новую запись');
    }
    if (isset($d['cat']) && $d['cat'] !== $cur['cat']) err('Категория записи библиотеки после создания не меняется');
    if ($cur['cat'] === 'training' && isset($d['type']) && $d['type'] !== $cur['type']) err('Тип занятия записи библиотеки после создания не меняется');
    $locId = (int)$cur['location_id'];
    $catId = (int)$cur['activity_category_id'];
    // Тип занятия (групповая / персональная / самостоятельная) — только у тренировок, как был при создании
    $typeId = $cur['slot_type_id'] !== null ? (int)$cur['slot_type_id'] : null;
    $features = isset($d['features']) && is_array($d['features'])
        ? json_encode(array_values($d['features']), JSON_UNESCAPED_UNICODE)
        : null;

    if ($cur['cat'] === 'training') libCheckHall($db, $locId);
    $stmt = $db->prepare('UPDATE library SET
        name=?, activity_category_id=?, slot_type_id=?, duration=?, price=?, difficulty=?, summary=?, details=?, active=?
        WHERE id=?');
    $stmt->execute([
        $d['name'], $catId, $typeId,
        $d['dur']   ?? 60,
        $d['price'],
        $d['difficulty'] ?? 'any',
        $d['desc']  ?? null,
        $features,
        isset($d['active']) ? (int)(bool)$d['active'] : 1,
        $id,
    ]);
    ok(null, 'Обновлено');
}

// DELETE — только мягкое удаление (active=0), физически НЕ удаляем.
// Слоты могут ссылаться на запись (FK ON DELETE RESTRICT — физическое удаление
// запрещено на уровне БД). Слоты остаются, описание берётся из записи по-прежнему.
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $db = getDB();
    $db->prepare('UPDATE library SET active = 0 WHERE id = ?')->execute([$id]);
    ok(null, 'Удалено из библиотеки');
}

err('Неизвестный endpoint', 404);
