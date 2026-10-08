<?php
// api/staff.php — Сотрудники: люди с ролями (администратор системы, администратор студии, тренер, байкфиттер, механик).
// Кем и где человек работает — его действующие строки user_roles; роль без филиала только у администратора системы.
// Уволенный — человек без действующих ролей: он остаётся обычным клиентом, история его ролей — в user_roles.
// Администратор системы видит всех и меняет (право staff). Администратор студии только смотрит и только
// специалистов (SPEC_ROLES) своих филиалов: администраторов системы и студий он не видит.
// График работы специалиста — api/specialist_hours.php.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/specialist_hours.php';
require_once __DIR__ . '/../middleware/slot_rules.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Роли из справочника по порядку: [['id', 'code', 'name'], …]
function staffRoleDict(PDO $db): array {
    $rows = $db->query("SELECT id, code, name FROM dictionaries WHERE group_code = 'user_role' AND active = 1 ORDER BY id")->fetchAll();
    return array_map(fn($r) => ['id' => (int)$r['id'], 'code' => $r['code'], 'name' => $r['name']], $rows);
}

// GET ?action=list[&former=1] — сотрудники с ролями: {staff: [{id, first_name, last_name, name, phone, has_account,
// phone_verified, specialist_id, experience, roles: [{code, location_id}]}], role_options: [{code, name}]}.
// former=1 (только администратор системы) — бывшие сотрудники: ролей сейчас нет, но были; left_at — когда сняли последнюю
if ($method === 'GET' && $action === 'list') {
    $user = authAdmin();
    $branches = adminBranches($user);   // null — администратор системы
    $former = !empty($_GET['former']);
    if ($former && $branches !== null) err('Недостаточно прав', 403);
    $db = getDB();

    $hasRole = "EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.amnd_state = 'A')";
    $rows = $db->query('SELECT u.id, u.first_name, u.last_name, u.name, u.phone, u.has_account,
                               (u.phone_verified_at IS NOT NULL) AS phone_verified, sp.id AS specialist_id, sp.experience'
                     . ($former ? ", (SELECT MAX(ur.amnd_date) FROM user_roles ur WHERE ur.user_id = u.id AND ur.amnd_state = 'C') AS left_at" : '') . '
                        FROM users u LEFT JOIN specialists sp ON sp.user_id = u.id
                        WHERE ' . ($former ? 'NOT ' . $hasRole . ' AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)' : $hasRole) . '
                        ORDER BY u.name, u.id')->fetchAll();

    $roles = [];
    if (!$former) {
        $st = $db->query("SELECT ur.user_id, d.code, ur.location_id FROM user_roles ur
                          JOIN dictionaries d ON d.id = ur.role_id
                          WHERE ur.amnd_state = 'A' ORDER BY d.id, ur.location_id");
        foreach ($st->fetchAll() as $r) {
            $roles[(int)$r['user_id']][] = ['code' => $r['code'], 'location_id' => $r['location_id'] !== null ? (int)$r['location_id'] : null];
        }
    }

    $out = [];
    foreach ($rows as $r) {
        $own = $roles[(int)$r['id']] ?? [];
        if ($branches !== null) {
            // администратор студии: только роли специалиста и только люди, работающие в его филиалах
            $own = array_values(array_filter($own, fn($x) => in_array($x['code'], SPEC_ROLES, true)));
            if (!array_filter($own, fn($x) => in_array($x['location_id'], $branches, true))) continue;
        }
        $r['id'] = (int)$r['id'];
        $r['phone'] = phoneView($r['phone']);
        $r['has_account'] = (int)$r['has_account'];
        $r['phone_verified'] = (int)$r['phone_verified'];
        $r['specialist_id'] = $r['specialist_id'] !== null ? (int)$r['specialist_id'] : null;
        $r['experience'] = $r['experience'] !== null ? (int)$r['experience'] : null;
        $r['roles'] = $own;
        $out[] = $r;
    }
    ok(['staff' => $out, 'role_options' => array_map(fn($r) => ['code' => $r['code'], 'name' => $r['name']], staffRoleDict($db))]);
}

// GET ?action=history&id= — периоды работы человека (только администратор системы), новые сверху:
// [{code, name, location_id, date_from, date_to (null — действует), granted_by, revoked_by}].
// Из истории user_roles: действующая строка — роль выдана в её amnd_date; закрытая ('C') — снята в её amnd_date,
// а выдана — в amnd_date её прежней версии (amnd_prev)
if ($method === 'GET' && $action === 'history') {
    authCan('staff');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) err('Не указан id');
    $st = getDB()->prepare("SELECT d.code, d.name, ur.location_id,
                                   IF(ur.amnd_state = 'A', ur.amnd_date, p.amnd_date) AS date_from,
                                   IF(ur.amnd_state = 'A', NULL, ur.amnd_date) AS date_to,
                                   IF(ur.amnd_state = 'A', gu.name, pu.name) AS granted_by,
                                   IF(ur.amnd_state = 'A', NULL, gu.name) AS revoked_by
                            FROM user_roles ur
                            JOIN dictionaries d ON d.id = ur.role_id
                            LEFT JOIN user_roles p ON p.id = ur.amnd_prev
                            LEFT JOIN users gu ON gu.id = ur.updated_by
                            LEFT JOIN users pu ON pu.id = p.updated_by
                            WHERE ur.user_id = ? AND ur.amnd_state IN ('A', 'C')
                            ORDER BY date_from DESC, ur.id DESC");
    $st->execute([$id]);
    $rows = $st->fetchAll();
    foreach ($rows as &$r) $r['location_id'] = $r['location_id'] !== null ? (int)$r['location_id'] : null;
    unset($r);
    ok($rows);
}

// POST ?action=person {phone} — человек по телефону, для формы нового сотрудника (телефон — в теле запроса, не в адресе):
// {id, first_name, last_name, name, is_staff — у него уже есть роли} или null
if ($method === 'POST' && $action === 'person') {
    authCan('staff');
    $phone = phoneDigits((string)(input()['phone'] ?? ''));
    if ($phone === null) ok(null);
    $db = getDB();
    $st = $db->prepare('SELECT u.id, u.first_name, u.last_name, u.name FROM users u WHERE u.phone = ?');
    $st->execute([$phone]);
    $p = $st->fetch();
    if (!$p) ok(null);
    $p['id'] = (int)$p['id'];
    $p['is_staff'] = userRoles($db, $p['id']) ? 1 : 0;
    ok($p);
}

// POST ?action=save — добавить или изменить сотрудника (только администратор системы), одной транзакцией:
// {id (нет — новый), first_name, last_name, phone, experience — у специалиста, system_admin: 0|1,
//  branches: [{location_id, roles: ['studio_admin', 'trainer', …]}]}.
// Новый сотрудник с телефоном существующего человека (клиента) — сотрудником становится он.
// Набор ролей заменяется целиком: лишние закрываются (amnd_state = 'C'), новые добавляются. Ролей не осталось —
// человек уволен: будущие периоды графика и отсутствия специалиста закрываются сегодняшним днём.
// Нельзя: снять роль администратора системы с себя и с последнего администратора системы; снять роль или филиал,
// если из-за этого станут невозможны будущие занятия специалиста (specialistSlotsGuard назовёт их)
if ($method === 'POST' && $action === 'save') {
    $admin = authCan('staff');
    $d = input();
    $id = (int)($d['id'] ?? 0);
    $first = trim((string)($d['first_name'] ?? ''));
    $last  = trim((string)($d['last_name'] ?? ''));
    if ($first === '') err('Укажите имя');
    if ($last === '')  err('Укажите фамилию');
    $phone = phoneDigits((string)($d['phone'] ?? ''));
    if ($phone === null) err('Укажите телефон полностью, например +7 900 123-45-67');

    $db = getDB();
    $dict = staffRoleDict($db);
    $roleId = array_column($dict, 'id', 'code');
    $roleName = array_column($dict, 'name', 'id');
    $specRoleIds = array_map(fn($c) => $roleId[$c], array_values(array_filter(SPEC_ROLES, fn($c) => isset($roleId[$c]))));

    // Нужный набор ролей: 'роль:филиал' => [role_id, location_id]; у администратора системы филиала нет
    $want = [];
    if (!empty($d['system_admin'])) $want[$roleId['system_admin'] . ':0'] = [$roleId['system_admin'], null];
    foreach ((array)($d['branches'] ?? []) as $b) {
        $locId = (int)($b['location_id'] ?? 0);
        if (!$locId) err('Не указан филиал');
        foreach (array_unique(array_map('strval', (array)($b['roles'] ?? []))) as $code) {
            if ($code === 'system_admin' || !isset($roleId[$code])) err('Неизвестная роль: ' . $code);
            $want[$roleId[$code] . ':' . $locId] = [$roleId[$code], $locId];
        }
    }
    if (!$id && !$want) err('Выберите хотя бы одну роль');

    beginCheckedTx($db);
    if ($id) {
        $st = $db->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
        $st->execute([$id]);
        if (!$st->fetchColumn()) err('Сотрудник не найден', 404);
        $db->prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?')->execute([$first, $last, $id]);
        setUserPhone($db, $id, $phone, $admin);
    } else {
        $id = personByPhone($db, $first, $last, $phone);
        if (userRoles($db, $id)) err('Человек с этим телефоном уже сотрудник — откройте его в списке');
    }

    $st = $db->prepare("SELECT id, role_id, location_id FROM user_roles WHERE user_id = ? AND amnd_state = 'A' FOR UPDATE");
    $st->execute([$id]);
    $have = [];   // 'роль:филиал' => строка
    foreach ($st->fetchAll() as $r) $have[(int)$r['role_id'] . ':' . (int)$r['location_id']] = $r;

    // Новые роли — только в существующих действующих филиалах (уже выданную роль в отключённом филиале оставить можно)
    foreach ($want as $key => [$rid, $locId]) {
        if ($locId !== null && !isset($have[$key])) specLocation($db, $locId);
    }

    // Администратор системы: с себя и с последнего роль не снимается
    $sysKey = $roleId['system_admin'] . ':0';
    if (isset($have[$sysKey]) && !isset($want[$sysKey])) {
        if ($id === (int)$admin['id']) err('Снять с себя роль администратора системы нельзя');
        $st = $db->prepare("SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.active = 1
                            WHERE ur.role_id = ? AND ur.amnd_state = 'A' AND ur.user_id <> ?");
        $st->execute([$roleId['system_admin'], $id]);
        if (!(int)$st->fetchColumn()) err('Это последний администратор системы — снять с него роль нельзя');
    }

    // Карточка специалиста: создаётся при первой роли тренера, байкфиттера или механика; строка блокируется до конца
    // транзакции, чтобы параллельно не поставили занятие
    $specLocs = fn(array $set) => array_values(array_unique(array_map(fn($k) => (int)explode(':', $k)[1],
        array_filter(array_keys($set), fn($k) => in_array((int)explode(':', $k)[0], $specRoleIds, true)))));
    $wasLocs = $specLocs($have);
    $nowLocs = $specLocs($want);
    $st = $db->prepare('SELECT id FROM specialists WHERE user_id = ?');
    $st->execute([$id]);
    $specId = (int)$st->fetchColumn();
    if (!$specId && $nowLocs) {
        $db->prepare('INSERT INTO specialists (user_id, experience) VALUES (?, ?)')->execute([$id, max(0, (int)($d['experience'] ?? 0))]);
        $specId = (int)$db->lastInsertId();
    } elseif ($specId) {
        lockSpecialist($db, $specId);
        if ($nowLocs) $db->prepare('UPDATE specialists SET experience = ? WHERE id = ?')->execute([max(0, (int)($d['experience'] ?? 0)), $specId]);
    }
    // Специалист уходит из филиала, но продолжает работать в других: мешают будущие часы работы и занятия там
    if ($nowLocs) {
        foreach (array_diff($wasLocs, $nowLocs) as $locId) {
            if ($why = specLocationBusy($db, $specId, $locId)) {
                $loc = specLocationOrNull($db, $locId);
                err('Нельзя убрать филиал «' . ($loc ? $loc['name'] : $locId) . '»: ' . $why);
            }
        }
    }

    foreach ($have as $key => $r) {
        if (isset($want[$key])) continue;
        amndClose($db, 'user_roles', (int)$r['id'], (int)$admin['id']);
        logAction($db, $admin, 'role.revoked', 'users', $id,
                  ['role' => $roleName[(int)$r['role_id']] ?? null, 'location_id' => $r['location_id'] !== null ? (int)$r['location_id'] : null]);
    }
    foreach ($want as $key => [$rid, $locId]) {
        if (isset($have[$key])) continue;
        amndInsert($db, 'user_roles', ['user_id' => $id, 'role_id' => $rid, 'location_id' => $locId], (int)$admin['id']);
        logAction($db, $admin, 'role.granted', 'users', $id, ['role' => $roleName[$rid], 'location_id' => $locId]);
    }

    if ($specId) {
        // Больше не специалист: график и отсутствия закрываются сегодняшним днём — идущие обрезаются, будущие удаляются
        if ($wasLocs && !$nowLocs) {
            $today = date('Y-m-d');
            $db->prepare('UPDATE specialist_schedules SET active = 0 WHERE specialist_id = ? AND active = 1 AND date_from > ?')->execute([$specId, $today]);
            $db->prepare('UPDATE specialist_schedules SET date_to = ? WHERE specialist_id = ? AND active = 1 AND (date_to IS NULL OR date_to > ?)')
               ->execute([$today, $specId, $today]);
            $db->prepare('UPDATE specialist_exceptions SET active = 0 WHERE specialist_id = ? AND active = 1 AND date_from > ?')->execute([$specId, $today]);
            $db->prepare('UPDATE specialist_exceptions SET date_to = ? WHERE specialist_id = ? AND active = 1 AND date_to > ?')
               ->execute([$today, $specId, $today]);
        }
        // Снятая роль или филиал — только если будущие занятия специалиста остаются возможны
        specialistSlotsGuard($db, $specId, null, null, 'сохранить сотрудника');
    }
    $db->commit();
    ok(['id' => $id, 'specialist_id' => $specId ?: null], 'Сохранено');
}

err('Неизвестный endpoint', 404);
