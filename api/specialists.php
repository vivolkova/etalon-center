<?php
// api/specialists.php — Специалисты (тренеры, байкфиттеры, механики)
// Специалист — человек из users: имя, фамилия и телефон хранятся там (читаем через specialists_view).
// Кем и где он работает — его роли с филиалом в user_roles (SPEC_ROLES); в specialists — только карточка (опыт).
// Окно специалиста пока задаёт специализации и филиалы двумя списками: сохраняется каждая роль в каждом филиале.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/specialist_hours.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Коды специализаций -> id ролей (справочник user_role, только SPEC_ROLES); нужна хотя бы одна, неизвестный код — ошибка
function specTypeIds(PDO $db, $codes): array {
    $codes = array_values(array_unique(array_filter(array_map('strval', is_array($codes) ? $codes : []))));
    if (!$codes) err('Укажите специализацию');
    foreach ($codes as $c) if (!in_array($c, SPEC_ROLES, true)) err('Неизвестная специализация: ' . $c);
    $st = $db->prepare('SELECT code, id FROM dictionaries WHERE group_code = ? AND code IN ('
        . implode(',', array_fill(0, count($codes), '?')) . ')');
    $st->execute(array_merge(['user_role'], $codes));
    $ids = $st->fetchAll(PDO::FETCH_KEY_PAIR);
    foreach ($codes as $c) if (!isset($ids[$c])) err('Неизвестная специализация: ' . $c);
    return array_map('intval', array_values($ids));
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

// GET — список специалистов (публичный; телефон — только администратору). roles — [{code, location_id}]: кем и где
// работает; types — коды его ролей, location_ids — филиалы ролей; active — работает ли (specialists_view);
// для админки (all=1) ещё актуальные периоды графика и исключения
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    $all = !empty($_GET['all']);
    // all=1 — для панели: вместе с теми, кто больше не работает; администратор студии видит только специалистов своих филиалов
    $branches = $all ? adminBranches(authCan('spec_hours')) : null;
    $where = $all ? '1' : 'sp.active = 1';
    $stmt = $db->prepare('
        SELECT sp.id, sp.user_id, sp.name, sp.full_name, sp.first_name, sp.last_name, sp.experience, sp.active,' . ($all ? ' sp.phone,' : '') . '
               (SELECT COUNT(*) FROM slots s WHERE s.specialist_id = sp.id AND s.active = 1) AS sessions_count
        FROM specialists_view sp
        WHERE ' . $where . '
        ORDER BY sp.id
    ');
    $stmt->execute();
    $rows = $stmt->fetchAll();
    $hours = $all ? specialistsHoursMap($db, null, date('Y-m-d')) : [];
    $roles = specialistsRoles($db);
    foreach ($rows as &$r) {
        $own = $roles[(int)$r['id']] ?? [];
        $r['active'] = (int)$r['active'];
        $r['roles'] = array_map(fn($x) => ['code' => $x['code'], 'location_id' => $x['location_id']], $own);
        $r['types'] = array_values(array_unique(array_column($own, 'code')));
        $locs = array_values(array_unique(array_column($own, 'location_id')));
        sort($locs);
        $r['location_ids'] = $locs;
        if ($all) $r['phone'] = phoneView($r['phone']);
        $h = $hours[$r['id']] ?? [];
        if ($all) {
            $r['schedules']  = $h['schedules'] ?? [];
            $r['exceptions'] = $h['exceptions'] ?? [];
        }
    }
    unset($r);
    if ($branches !== null) {
        $rows = array_values(array_filter($rows, fn($r) => (bool)array_intersect($branches, $r['location_ids'])));
    }
    ok($rows);
}

// POST — человек по телефону (admin), для формы нового специалиста: его имя подставляется в форму.
// {id, first_name, last_name, name, specialist_id — если он уже специалист} или null. Телефон — в теле запроса, не в адресе
if ($method === 'POST' && $action === 'person') {
    authCan('specialists');
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

// POST — создать специалиста (admin): {first_name, last_name, phone, types:[коды ролей], location_ids, experience, active}.
// Человек с таким телефоном уже есть (например, клиент) — специалистом становится он, второй записи в users не будет
if ($method === 'POST' && $action === 'create') {
    authCan('specialists');
    $d = input();
    [$first, $last, $phone] = specPerson($d);
    $db = getDB();
    $typeIds = specTypeIds($db, $d['types'] ?? []);
    $db->beginTransaction();
    $admin = sessionCurrent($db);
    $userId = personByPhone($db, $first, $last, $phone);
    $st = $db->prepare('SELECT id FROM specialists WHERE user_id = ?');
    $st->execute([$userId]);
    if ($st->fetchColumn()) err('Специалист с таким телефоном уже есть');
    $db->prepare('INSERT INTO specialists (user_id, experience) VALUES (?,?)')->execute([$userId, (int)($d['experience'] ?? 0)]);
    $id = (int)$db->lastInsertId();
    // «Активен» снят — карточка без ролей: специалист заведён, но не работает
    $works = !isset($d['active']) || !empty($d['active']);
    saveSpecialistRoles($db, $id, $works ? $typeIds : [], $d['location_ids'] ?? [], $admin['id'] ?? null);
    $db->commit();
    ok(['id' => $id], 'Специалист добавлен');
}

// PUT — обновить специалиста (admin): имя, фамилия и телефон меняются в его записи users
if ($method === 'PUT' && $action === 'update') {
    $admin = authCan('specialists');
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
    $db->prepare('UPDATE specialists SET experience=? WHERE id=?')->execute([(int)($d['experience'] ?? 0), $id]);
    // «Активен» снят — снимаются все роли специалиста: он больше не работает (карточка и прошедшие занятия остаются)
    $works = !isset($d['active']) || !empty($d['active']);
    saveSpecialistRoles($db, $id, $works ? $typeIds : [], $d['location_ids'] ?? [], $admin['id']);
    // Снятие ролей или филиала — только если будущие занятия специалиста остаются возможны
    specialistSlotsGuard($db, $id, null, null, 'сохранить специалиста');
    $db->commit();
    ok(null, 'Специалист обновлён');
}

// DELETE — специалист больше не работает: снимаются все его роли специалиста (admin)
if ($method === 'DELETE' && $action === 'delete') {
    $admin = authCan('specialists');
    $id = (int)($_GET['id'] ?? 0);
    $db = getDB();
    $db->beginTransaction();
    lockSpecialist($db, $id);
    saveSpecialistRoles($db, $id, [], [], $admin['id']);
    specialistSlotsGuard($db, $id, null, null, 'удалить специалиста');
    $db->commit();
    ok(null, 'Специалист удалён');
}

err('Неизвестный endpoint', 404);
