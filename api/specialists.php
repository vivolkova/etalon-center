<?php
// api/specialists.php — Специалисты (тренеры, байкфиттеры, мастера)
// Специалист не привязан к филиалу (филиал — у интервалов графика), типов может быть несколько.
// Специалист — человек из users: имя, фамилия и телефон хранятся там (читаем через specialists_view).
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/specialist_hours.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Коды типов специалиста -> id справочника specialist_type; нужен хотя бы один, неизвестный код — ошибка
function specTypeIds(PDO $db, $codes): array {
    $codes = array_values(array_unique(array_filter(array_map('strval', is_array($codes) ? $codes : []))));
    if (!$codes) err('Укажите специализацию');
    $st = $db->prepare('SELECT code, id FROM dictionaries WHERE group_code = ? AND code IN ('
        . implode(',', array_fill(0, count($codes), '?')) . ')');
    $st->execute(array_merge(['specialist_type'], $codes));
    $ids = $st->fetchAll(PDO::FETCH_KEY_PAIR);
    foreach ($codes as $c) if (!isset($ids[$c])) err('Неизвестный тип специалиста: ' . $c);
    return array_map('intval', array_values($ids));
}

// Заменить набор типов специалиста (связи specialist_types): снятые — active = 0, выбранные — active = 1
function saveSpecTypes(PDO $db, int $specId, array $typeIds): void {
    $db->prepare('UPDATE specialist_types SET active = 0 WHERE specialist_id = ?')->execute([$specId]);
    $ins = $db->prepare('INSERT INTO specialist_types (specialist_id, type_id, active) VALUES (?, ?, 1)
                         ON DUPLICATE KEY UPDATE active = 1');
    foreach ($typeIds as $t) $ins->execute([$specId, $t]);
}

// Имя, фамилия и телефон специалиста из запроса: [first_name, last_name, phone цифрами]
function specPerson(array $d): array {
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    if ($first === '') err('Укажите имя специалиста');
    if ($last === '')  err('Укажите фамилию специалиста');
    $phone = phoneDigits((string)($d['phone'] ?? ''));
    if ($phone === null) err('Укажите телефон специалиста полностью, например +7 900 123-45-67');
    return [$first, $last, $phone];
}

// GET — список специалистов (публичный; телефон — только администратору). types — коды типов; location_ids — филиалы, где специалист работает
// по графику и особым часам (с сегодняшнего дня); для админки (all=1) ещё актуальные периоды графика и исключения
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    $all = !empty($_GET['all']);
    if ($all) authAdmin();
    $where = $all ? '1' : 'sp.active = 1';
    $stmt = $db->prepare('
        SELECT sp.id, sp.user_id, sp.name, sp.full_name, sp.first_name, sp.last_name, sp.experience, sp.active,' . ($all ? ' sp.phone,' : '') . '
               (SELECT GROUP_CONCAT(d.code ORDER BY d.id) FROM specialist_types stp
                  JOIN dictionaries d ON d.id = stp.type_id WHERE stp.specialist_id = sp.id AND stp.active = 1) AS types,
               (SELECT COUNT(*) FROM slots s WHERE s.specialist_id = sp.id AND s.active = 1) AS sessions_count
        FROM specialists_view sp
        WHERE ' . $where . '
        ORDER BY sp.id
    ');
    $stmt->execute();
    $rows = $stmt->fetchAll();
    $hours = specialistsHoursMap($db, null, date('Y-m-d'));
    foreach ($rows as &$r) {
        $r['types'] = $r['types'] !== null ? explode(',', $r['types']) : [];
        if ($all) $r['phone'] = phoneView($r['phone']);
        $h = $hours[$r['id']] ?? [];
        $r['location_ids'] = specLocationIds($h);
        if ($all) {
            $r['schedules']  = $h['schedules'] ?? [];
            $r['exceptions'] = $h['exceptions'] ?? [];
        }
    }
    unset($r);
    ok($rows);
}

// POST — человек по телефону (admin), для формы нового специалиста: его имя подставляется в форму.
// {id, first_name, last_name, name, specialist_id — если он уже специалист} или null. Телефон — в теле запроса, не в адресе
if ($method === 'POST' && $action === 'person') {
    authAdmin();
    $phone = phoneDigits((string)(input()['phone'] ?? ''));
    if ($phone === null) ok(null);
    $st = getDB()->prepare('SELECT u.id, u.first_name, u.last_name, u.name,
                                   (SELECT sp.id FROM specialists sp WHERE sp.user_id = u.id) AS specialist_id
                            FROM users u WHERE u.phone = ?');
    $st->execute([$phone]);
    $p = $st->fetch();
    if (!$p) ok(null);
    $p['id'] = (int)$p['id'];
    $p['specialist_id'] = $p['specialist_id'] !== null ? (int)$p['specialist_id'] : null;
    ok($p);
}

// POST — создать специалиста (admin): {first_name, last_name, phone, types:[коды] — специализация, experience, active}.
// Человек с таким телефоном уже есть (например, клиент) — специалистом становится он, второй записи в users не будет
if ($method === 'POST' && $action === 'create') {
    authAdmin();
    $d = input();
    [$first, $last, $phone] = specPerson($d);
    $db = getDB();
    $typeIds = specTypeIds($db, $d['types'] ?? []);
    $db->beginTransaction();
    $userId = personByPhone($db, $first, $last, $phone);
    $st = $db->prepare('SELECT id FROM specialists WHERE user_id = ?');
    $st->execute([$userId]);
    if ($st->fetchColumn()) err('Специалист с таким телефоном уже есть');
    $db->prepare('INSERT INTO specialists (user_id, experience, active) VALUES (?,?,?)')
       ->execute([$userId, (int)($d['experience'] ?? 0), isset($d['active']) ? (int)(bool)$d['active'] : 1]);
    $id = (int)$db->lastInsertId();
    saveSpecTypes($db, $id, $typeIds);
    $db->commit();
    ok(['id' => $id], 'Специалист добавлен');
}

// PUT — обновить специалиста (admin): имя, фамилия и телефон меняются в его записи users
if ($method === 'PUT' && $action === 'update') {
    $admin = authAdmin();
    $d = input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) err('Не указан id');
    [$first, $last, $phone] = specPerson($d);
    $db = getDB();
    $typeIds = specTypeIds($db, $d['types'] ?? []);
    $db->beginTransaction();
    lockSpecialist($db, $id);
    $st = $db->prepare('SELECT user_id FROM specialists WHERE id = ?');
    $st->execute([$id]);
    $userId = (int)$st->fetchColumn();
    $db->prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?')->execute([$first, $last, $userId]);
    setUserPhone($db, $userId, $phone, $admin);
    $db->prepare('UPDATE specialists SET experience=?, active=? WHERE id=?')
       ->execute([(int)($d['experience'] ?? 0), isset($d['active']) ? (int)(bool)$d['active'] : 1, $id]);
    saveSpecTypes($db, $id, $typeIds);
    // Деактивация или снятие специализации — только если будущие занятия специалиста остаются возможны
    specialistSlotsGuard($db, $id, null, null, 'сохранить специалиста');
    $db->commit();
    ok(null, 'Специалист обновлён');
}

// DELETE — мягкое удаление (admin)
if ($method === 'DELETE' && $action === 'delete') {
    authAdmin();
    $id = (int)($_GET['id'] ?? 0);
    $db = getDB();
    $db->beginTransaction();
    lockSpecialist($db, $id);
    $db->prepare('UPDATE specialists SET active=0 WHERE id=?')->execute([$id]);
    specialistSlotsGuard($db, $id, null, null, 'удалить специалиста');
    $db->commit();
    ok(null, 'Специалист удалён');
}

err('Неизвестный endpoint', 404);
