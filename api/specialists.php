<?php
// api/specialists.php — Специалисты (тренеры, байкфиттеры, механики): список для сайта и форм занятий.
// Специалист — человек из users: имя и фамилия хранятся там (читаем через specialists_view).
// Кем и где он работает — его роли с филиалом в user_roles (SPEC_ROLES); в specialists — только карточка (опыт).
// Специалиста добавляют и меняют в разделе «Сотрудники» (api/staff.php), его график — api/specialist_hours.php.
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/specialist_hours.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// GET — работающие специалисты (публичный): roles — [{code, location_id}]: кем и где работает;
// types — коды его ролей, location_ids — филиалы ролей
if ($method === 'GET' && $action === 'list') {
    $db = getDB();
    $rows = $db->query('
        SELECT sp.id, sp.user_id, sp.name, sp.full_name, sp.first_name, sp.last_name, sp.experience, sp.active,
               (SELECT COUNT(*) FROM slots s WHERE s.specialist_id = sp.id AND s.active = 1) AS sessions_count
        FROM specialists_view sp
        WHERE sp.active = 1
        ORDER BY sp.id
    ')->fetchAll();
    $roles = specialistsRoles($db);
    foreach ($rows as &$r) {
        $own = $roles[(int)$r['id']] ?? [];
        $r['active'] = (int)$r['active'];
        $r['roles'] = array_map(fn($x) => ['code' => $x['code'], 'location_id' => $x['location_id']], $own);
        $r['types'] = array_values(array_unique(array_column($own, 'code')));
        $locs = array_values(array_unique(array_column($own, 'location_id')));
        sort($locs);
        $r['location_ids'] = $locs;
    }
    unset($r);
    ok($rows);
}

err('Неизвестный endpoint', 404);
