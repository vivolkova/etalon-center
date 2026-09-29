<?php
// api/specialist_hours.php — График работы специалистов: периоды (недельные шаблоны) и исключения
require_once __DIR__ . '/../middleware/helpers.php';
require_once __DIR__ . '/../middleware/specialist_hours.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Кто может вести график специалиста. Пока только админ;
// сюда же добавятся сам специалист (свой график) и ресепшен.
function authSpecHours(): array {
    return authAdmin();
}

function specExists(PDO $db, int $specId): void {
    $st = $db->prepare('SELECT 1 FROM specialists WHERE id = ?');
    $st->execute([$specId]);
    if (!$st->fetchColumn()) err('Специалист не найден', 404);
}

// Изменяемая запись периода/исключения должна существовать, быть активной и принадлежать этому специалисту
function specRowExists(PDO $db, string $table, int $id, int $specId, string $notFound): void {
    $st = $db->prepare('SELECT 1 FROM ' . $table . ' WHERE id = ? AND specialist_id = ? AND active = 1');
    $st->execute([$id, $specId]);
    if (!$st->fetchColumn()) err($notFound, 404);
}

// Дата YYYY-MM-DD или ошибка
function specDate($v, string $label): string {
    $v = (string)$v;
    $dt = DateTime::createFromFormat('Y-m-d', $v);
    if (!$dt || $dt->format('Y-m-d') !== $v) err('Укажите ' . $label);
    return $v;
}

// GET — периоды и исключения специалиста
if ($method === 'GET' && $action === 'list') {
    authSpecHours();
    $specId = (int)($_GET['specialist_id'] ?? 0);
    $db = getDB();
    specExists($db, $specId);
    $data = specialistsHoursMap($db, [$specId])[$specId] ?? [];
    ok(['schedules' => $data['schedules'] ?? [], 'exceptions' => $data['exceptions'] ?? []]);
}

// GET — часы работы специалиста по датам (для построения расписания)
if ($method === 'GET' && $action === 'availability') {
    authSpecHours();
    $specId = (int)($_GET['specialist_id'] ?? 0);
    $from = specDate($_GET['from'] ?? '', 'дату начала');
    $to   = specDate($_GET['to'] ?? '', 'дату окончания');
    if ($from > $to) err('Дата начала позже даты окончания');
    if ((strtotime($to) - strtotime($from)) / 86400 > 366) err('Период не больше года');
    $db = getDB();
    specExists($db, $specId);
    ok(specialistAvailability($db, $specId, $from, $to));
}

// POST — создать/изменить период графика: {id?, specialist_id, name, date_from, date_to|null, work_hours}
if ($method === 'POST' && $action === 'schedule_save') {
    $user = authSpecHours();
    $d = input();
    $db = getDB();
    $id = (int)($d['id'] ?? 0);
    $specId = (int)($d['specialist_id'] ?? 0);
    specExists($db, $specId);
    if ($id) specRowExists($db, 'specialist_schedules', $id, $specId, 'Период графика не найден');
    $name = mb_substr(trim((string)($d['name'] ?? '')), 0, 128);
    if ($name === '') err('Укажите название периода');
    $from = specDate($d['date_from'] ?? '', 'дату начала периода');
    $to = empty($d['date_to']) ? null : specDate($d['date_to'], 'дату окончания периода');
    if ($to !== null && $from > $to) err('Дата начала периода позже даты окончания');
    $week = specNormWeek($d['work_hours'] ?? []);
    if (!array_filter($week, fn($w) => $w['intervals'])) err('Укажите часы работы хотя бы в один день');

    // Каждый интервал — в режиме работы своего филиала в этот день недели
    foreach ($week as $w) {
        foreach ($w['intervals'] as $iv) specCheckInBranch($db, $iv, $w['day'], $w['day']);
    }

    // Активные периоды одного специалиста не пересекаются (NULL в date_to — бессрочно)
    $st = $db->prepare('SELECT name, date_from, date_to FROM specialist_schedules
        WHERE specialist_id = ? AND id <> ? AND active = 1
          AND date_from <= COALESCE(?, \'9999-12-31\') AND ? <= COALESCE(date_to, \'9999-12-31\') LIMIT 1');
    $st->execute([$specId, $id, $to, $from]);
    if ($c = $st->fetch()) {
        err('Пересекается с периодом «' . $c['name'] . '» ' . specFmtDate($c['date_from'])
            . ' – ' . ($c['date_to'] ? specFmtDate($c['date_to']) : 'бессрочно'));
    }

    $weekJson = json_encode($week, JSON_UNESCAPED_UNICODE);
    if ($id) {
        $st = $db->prepare('UPDATE specialist_schedules SET name=?, date_from=?, date_to=?, work_hours=? WHERE id=? AND specialist_id=?');
        $st->execute([$name, $from, $to, $weekJson, $id, $specId]);
        ok(['id' => $id], 'Период графика обновлён');
    }
    $db->prepare('INSERT INTO specialist_schedules (specialist_id, name, date_from, date_to, work_hours, created_by) VALUES (?,?,?,?,?,?)')
       ->execute([$specId, $name, $from, $to, $weekJson, (int)$user['id']]);
    ok(['id' => (int)$db->lastInsertId()], 'Период графика добавлен');
}

// DELETE — удалить период графика (мягко: active = 0, физически не удаляем)
if ($method === 'DELETE' && $action === 'schedule_delete') {
    authSpecHours();
    getDB()->prepare('UPDATE specialist_schedules SET active = 0 WHERE id = ?')->execute([(int)($_GET['id'] ?? 0)]);
    ok(null, 'Период графика удалён');
}

// POST — создать/изменить исключение: {id?, specialist_id, date_from, date_to, type: off|custom, work_hours, reason}
if ($method === 'POST' && $action === 'exception_save') {
    $user = authSpecHours();
    $d = input();
    $db = getDB();
    $id = (int)($d['id'] ?? 0);
    $specId = (int)($d['specialist_id'] ?? 0);
    specExists($db, $specId);
    if ($id) specRowExists($db, 'specialist_exceptions', $id, $specId, 'Исключение не найдено');
    $from = specDate($d['date_from'] ?? '', 'дату начала');
    $to = specDate($d['date_to'] ?? '', 'дату окончания');   // обязательна, даже для одного дня
    if ($from > $to) err('Дата начала позже даты окончания');
    if ((strtotime($to) - strtotime($from)) / 86400 > 366) err('Исключение — не больше года');
    $type = (string)($d['type'] ?? '');
    if (!in_array($type, SPEC_EXCEPTION_TYPES, true)) err('Неизвестный тип исключения: ' . $type);

    $intervals = null;
    if ($type === 'custom') {
        $intervals = specNormIntervals($d['work_hours'] ?? [], 'Особые часы');
        if (!$intervals) err('Укажите часы работы в эти даты');
        // Каждый интервал — в режиме работы своего филиала в каждый рабочий день этого филиала в диапазоне;
        // дни, когда филиал интервала не работает, пропускаем (в них интервал не действует)
        foreach ($intervals as $iv) specLocation($db, (int)$iv['location_id']);   // филиал существует и действующий
        $openDays = 0;
        for ($ts = strtotime($from); $ts <= strtotime($to); $ts = strtotime('+1 day', $ts)) {
            $date = date('Y-m-d', $ts);
            $dayName = specDayName($date);
            foreach ($intervals as $iv) {
                if (specLocClosed($db, (int)$iv['location_id'], $dayName)) continue;
                $openDays++;
                specCheckInBranch($db, $iv, $dayName, specFmtDate($date) . ' (' . mb_strtolower($dayName) . ')');
            }
        }
        if (!$openDays) err('В эти даты филиал не работает');
    }

    // Исключения одного специалиста не пересекаются — ни отсутствия, ни особые часы (на дату действует одно)
    $st = $db->prepare('SELECT date_from, date_to, reason, type FROM specialist_exceptions
        WHERE specialist_id = ? AND id <> ? AND active = 1 AND date_from <= ? AND ? <= date_to LIMIT 1');
    $st->execute([$specId, $id, $to, $from]);
    if ($c = $st->fetch()) {
        err('Пересекается с ' . ($c['type'] === 'custom' ? 'особыми часами работы' : 'отсутствием') . ' '
            . specFmtDate($c['date_from'])
            . ($c['date_to'] !== $c['date_from'] ? ' – ' . specFmtDate($c['date_to']) : '')
            . ($c['reason'] ? ' («' . $c['reason'] . '»)' : ''));
    }

    $reason = mb_substr(trim((string)($d['reason'] ?? '')), 0, 255);
    if ($reason === '') $reason = null;
    $ivJson = $intervals !== null ? json_encode($intervals, JSON_UNESCAPED_UNICODE) : null;
    if ($id) {
        $st = $db->prepare('UPDATE specialist_exceptions SET date_from=?, date_to=?, type=?, work_hours=?, reason=? WHERE id=? AND specialist_id=?');
        $st->execute([$from, $to, $type, $ivJson, $reason, $id, $specId]);
        ok(['id' => $id], 'Исключение обновлено');
    }
    $db->prepare('INSERT INTO specialist_exceptions (specialist_id, date_from, date_to, type, work_hours, reason, created_by) VALUES (?,?,?,?,?,?,?)')
       ->execute([$specId, $from, $to, $type, $ivJson, $reason, (int)$user['id']]);
    ok(['id' => (int)$db->lastInsertId()], 'Исключение добавлено');
}

// DELETE — удалить исключение (мягко: active = 0, физически не удаляем)
if ($method === 'DELETE' && $action === 'exception_delete') {
    authSpecHours();
    getDB()->prepare('UPDATE specialist_exceptions SET active = 0 WHERE id = ?')->execute([(int)($_GET['id'] ?? 0)]);
    ok(null, 'Исключение удалено');
}

err('Неизвестный endpoint', 404);
