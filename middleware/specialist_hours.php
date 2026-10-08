<?php
// ═══════════════════════════════════════════════════════════
// middleware/specialist_hours.php — График работы специалистов
// ═══════════════════════════════════════════════════════════
// Периоды графика (specialist_schedules.work_hours) — недельный шаблон с интервалами на каждый день.
// Исключения (specialist_exceptions) — «не работает» или «особые часы» (work_hours) на дату/диапазон, важнее шаблона.
// Часы специалиста = исключение, иначе шаблон периода на эту дату, иначе — не работает.
// Специалист не привязан к филиалу: филиал указан у каждого интервала ({from, to, location_id}).

// Нужен ли занятию специалист: групповая и персональная тренировка — да, самостоятельная — нет;
// услугу (любая категория, кроме training) всегда оказывает специалист.
// $cat — код категории, $type — slot_type.code записи библиотеки. То же правило на фронте (core.js)
function activityNeedsSpecialist(string $cat, ?string $type): bool {
    return $cat === 'training' ? in_array($type, ['group', 'personal'], true) : true;
}

const SPEC_DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

function specTimeToMin(string $t): int {
    $p = explode(':', $t);
    return (int)$p[0] * 60 + (int)($p[1] ?? 0);
}

function specFmtDate(string $d): string {
    return date('d.m.Y', strtotime($d));
}

function specDayName(string $date): string {
    return SPEC_DAYS[(int)date('N', strtotime($date)) - 1];
}

// Проверка и нормализация интервалов дня: HH:MM с шагом 15 минут, начало < окончания, филиал указан,
// без пересечений (даже в разных филиалах — человек один); результат отсортирован по началу.
// $label — для текста ошибки.
function specNormIntervals($raw, string $label): array {
    if (!is_array($raw)) return [];
    $re = '/^([01]\d|2[0-3]):(00|15|30|45)$/';
    $list = [];
    foreach ($raw as $iv) {
        $from = substr((string)($iv['from'] ?? ''), 0, 5);
        $to   = substr((string)($iv['to'] ?? ''), 0, 5);
        if ($from === '' && $to === '') continue;
        if (!preg_match($re, $from) || !preg_match($re, $to)) {
            err($label . ': укажите начало и окончание интервала (шаг 15 минут)');
        }
        if (specTimeToMin($from) >= specTimeToMin($to)) err($label . ': начало интервала должно быть раньше окончания');
        $locId = (int)($iv['location_id'] ?? 0);
        if ($locId <= 0) err($label . ': укажите филиал интервала');
        $list[] = ['from' => $from, 'to' => $to, 'location_id' => $locId];
    }
    usort($list, fn($a, $b) => specTimeToMin($a['from']) <=> specTimeToMin($b['from']));
    for ($i = 1; $i < count($list); $i++) {
        if (specTimeToMin($list[$i]['from']) < specTimeToMin($list[$i - 1]['to'])) {
            err($label . ': интервалы пересекаются');
        }
    }
    return $list;
}

// Недельный шаблон: всегда 7 дней по порядку, у каждого — нормализованные интервалы
function specNormWeek($raw): array {
    $byDay = [];
    foreach ((is_array($raw) ? $raw : []) as $d) {
        if (isset($d['day'])) $byDay[$d['day']] = $d['intervals'] ?? [];
    }
    $week = [];
    foreach (SPEC_DAYS as $day) {
        $week[] = ['day' => $day, 'intervals' => specNormIntervals($byDay[$day] ?? [], $day)];
    }
    return $week;
}

// Филиал и его режим работы: ['name', 'days' => [день => {from,to} | null (выходной)] | null — режим не задан].
// Кешируется на время запроса. Филиала нет или он недействующий — null.
function specLocationOrNull(PDO $db, int $locId): ?array {
    static $cache = [];
    if (array_key_exists($locId, $cache)) return $cache[$locId];
    $st = $db->prepare('SELECT name, work_hours, active FROM locations WHERE id = ?');
    $st->execute([$locId]);
    $loc = $st->fetch();
    if (!$loc || !(int)$loc['active']) return $cache[$locId] = null;
    $hours = json_decode((string)$loc['work_hours'], true);
    $days = null;
    if (is_array($hours) && $hours) {
        $days = array_fill_keys(SPEC_DAYS, null);
        foreach ($hours as $h) {
            if (!empty($h['open']) && !empty($h['from']) && !empty($h['to'])) {
                $days[$h['day']] = ['from' => $h['from'], 'to' => $h['to']];
            }
        }
    }
    return $cache[$locId] = ['name' => $loc['name'], 'days' => $days];
}

// То же, но филиала нет или он недействующий — ошибка (при сохранении графика)
function specLocation(PDO $db, int $locId): array {
    $loc = specLocationOrNull($db, $locId);
    if (!$loc) err('Филиал не найден или недействующий', 404);
    return $loc;
}

// Филиал интервала закрыт в этот день недели (режим не задан — считаем открытым; недействующий — закрыт)
function specLocClosed(PDO $db, int $locId, string $dayName): bool {
    $loc = specLocationOrNull($db, $locId);
    if (!$loc) return true;
    return $loc['days'] !== null && $loc['days'][$dayName] === null;
}

// Интервал специалиста должен укладываться в режим работы своего филиала в этот день недели
function specCheckInBranch(PDO $db, array $iv, string $dayName, string $label): void {
    $loc = specLocation($db, (int)$iv['location_id']);
    if ($loc['days'] === null) return;
    $b = $loc['days'][$dayName] ?? null;
    if (!$b) err($label . ': в этот день филиал «' . $loc['name'] . '» не работает');
    if (specTimeToMin($iv['from']) < specTimeToMin($b['from']) || specTimeToMin($iv['to']) > specTimeToMin($b['to'])) {
        err($label . ': часы в филиале «' . $loc['name'] . '» должны быть в его режиме работы ' . $b['from'] . '–' . $b['to']);
    }
}

// Типы исключений: off — не работает (отсутствие), custom — особые часы работы
const SPEC_EXCEPTION_TYPES = ['off', 'custom'];

function specDecodeRow(array $r, string $jsonField): array {
    $r[$jsonField] = $r[$jsonField] !== null ? json_decode($r[$jsonField], true) : null;
    return $r;
}

// Периоды и исключения специалистов. $ids — список id (null — все); $fromDate — только актуальные с этой даты.
// Результат: [specialist_id => ['schedules' => [...], 'exceptions' => [...]]]
function specialistsHoursMap(PDO $db, ?array $ids = null, ?string $fromDate = null): array {
    $where = []; $args = [];
    if ($ids !== null) {
        if (!$ids) return [];
        $where[] = 'specialist_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $args = array_map('intval', $ids);
    }
    $map = [];
    $where[] = 'active = 1';   // удалённые (active = 0) не показываем и не учитываем
    $schedWhere = $where; $schedArgs = $args;
    if ($fromDate) { $schedWhere[] = '(date_to IS NULL OR date_to >= ?)'; $schedArgs[] = $fromDate; }
    $st = $db->prepare('SELECT id, specialist_id, name, date_from, date_to, work_hours FROM specialist_schedules'
        . ($schedWhere ? ' WHERE ' . implode(' AND ', $schedWhere) : '') . ' ORDER BY date_from');
    $st->execute($schedArgs);
    foreach ($st->fetchAll() as $r) {
        $map[$r['specialist_id']]['schedules'][] = specDecodeRow($r, 'work_hours');
    }
    $excWhere = $where; $excArgs = $args;
    if ($fromDate) { $excWhere[] = 'date_to >= ?'; $excArgs[] = $fromDate; }
    $st = $db->prepare('SELECT id, specialist_id, date_from, date_to, type, work_hours, reason FROM specialist_exceptions'
        . ($excWhere ? ' WHERE ' . implode(' AND ', $excWhere) : '') . ' ORDER BY date_from');
    $st->execute($excArgs);
    foreach ($st->fetchAll() as $r) {
        $map[$r['specialist_id']]['exceptions'][] = specDecodeRow($r, 'work_hours');
    }
    return $map;
}

// Филиалы, в которых специалист работает по графику и особым часам (из данных specialistsHoursMap)
function specLocationIds(array $data): array {
    $ids = [];
    foreach ($data['schedules'] ?? [] as $s) {
        foreach ($s['work_hours'] as $w) foreach ($w['intervals'] as $iv) $ids[(int)$iv['location_id']] = true;
    }
    foreach ($data['exceptions'] ?? [] as $e) {
        foreach ($e['work_hours'] ?? [] as $iv) $ids[(int)$iv['location_id']] = true;
    }
    $ids = array_keys($ids);
    sort($ids);
    return $ids;
}

// Часы работы специалиста по датам [$from; $to]:
// [{date, intervals:[{from,to,location_id}], source:'exception'|'schedule'|'none', reason, schedule}]
// intervals пуст — в этот день не работает. Для построения расписания.
function specialistAvailability(PDO $db, int $specId, string $from, string $to): array {
    $data = specialistsHoursMap($db, [$specId])[$specId] ?? [];
    $schedules  = $data['schedules'] ?? [];
    $exceptions = $data['exceptions'] ?? [];
    $out = [];
    for ($ts = strtotime($from); $ts <= strtotime($to); $ts = strtotime('+1 day', $ts)) {
        $date = date('Y-m-d', $ts);
        $dayName = specDayName($date);
        $day = ['date' => $date, 'intervals' => [], 'source' => 'none', 'reason' => null, 'schedule' => ''];
        $exc = null;
        foreach ($exceptions as $e) { if ($e['date_from'] <= $date && $e['date_to'] >= $date) { $exc = $e; break; } }
        if ($exc) {
            $day['source'] = 'exception';
            $day['reason'] = $exc['reason'];
            // Особые часы в филиале, который в этот день не работает (диапазон захватил выходной), не действуют
            if ($exc['type'] === 'custom') {
                $day['intervals'] = array_values(array_filter($exc['work_hours'] ?? [],
                    fn($iv) => !specLocClosed($db, (int)$iv['location_id'], $dayName)));
            }
        } else {
            foreach ($schedules as $s) {
                if ($s['date_from'] <= $date && ($s['date_to'] === null || $s['date_to'] >= $date)) {
                    $day['source'] = 'schedule';
                    $day['schedule'] = $s['name'];
                    foreach ($s['work_hours'] as $w) { if ($w['day'] === $dayName) { $day['intervals'] = $w['intervals']; break; } }
                    break;
                }
            }
        }
        $out[] = $day;
    }
    return $out;
}

// ── Роли специалиста: кем и в каких филиалах он работает (user_roles) ─────────────
// Роль тренера, байкфиттера, механика (SPEC_ROLES) выдаётся с филиалом. Филиалы специалиста — филиалы его ролей:
// часы работы в графике можно указать только в них.

// Действующие роли специалистов: [specialist_id => [['id' — строка user_roles, 'role_id', 'code', 'location_id'], …]];
// $ids — только эти специалисты; $lock — заблокировать строки до конца транзакции
function specialistsRoles(PDO $db, ?array $ids = null, bool $lock = false): array {
    if ($ids !== null && !$ids) return [];
    $sql = "SELECT sp.id AS specialist_id, ur.id, ur.role_id, d.code, ur.location_id
            FROM specialists sp
            JOIN user_roles ur ON ur.user_id = sp.user_id AND ur.amnd_state = 'A'
            JOIN dictionaries d ON d.id = ur.role_id AND d.group_code = 'user_role'
                               AND d.code IN ('" . implode("','", SPEC_ROLES) . "')";
    $args = [];
    if ($ids !== null) {
        $sql .= ' WHERE sp.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $args = array_map('intval', array_values($ids));
    }
    $st = $db->prepare($sql . ' ORDER BY d.id, ur.location_id' . ($lock ? ' FOR UPDATE' : ''));
    $st->execute($args);
    $map = [];
    foreach ($st->fetchAll() as $r) {
        $map[(int)$r['specialist_id']][] = ['id' => (int)$r['id'], 'role_id' => (int)$r['role_id'],
                                            'code' => $r['code'], 'location_id' => (int)$r['location_id']];
    }
    return $map;
}

// Филиалы специалистов (филиалы их ролей): [specialist_id => [location_id, …]]; $ids — только эти специалисты
function specialistsLocations(PDO $db, ?array $ids = null): array {
    $map = [];
    foreach (specialistsRoles($db, $ids) as $specId => $roles) {
        $locs = array_values(array_unique(array_column($roles, 'location_id')));
        sort($locs);
        $map[$specId] = $locs;
    }
    return $map;
}
function specialistLocations(PDO $db, int $specId): array {
    return specialistsLocations($db, [$specId])[$specId] ?? [];
}

// Часы работы — только в филиалах специалиста: иначе ошибка с названием филиала
function specAssertBranches(PDO $db, int $specId, array $locIds): void {
    $own = specialistLocations($db, $specId);
    foreach (array_unique(array_map('intval', $locIds)) as $locId) {
        if (in_array($locId, $own, true)) continue;
        $loc = specLocationOrNull($db, $locId);
        err('Специалист не работает в филиале «' . ($loc ? $loc['name'] : $locId) . '» — сначала добавьте этот филиал в его карточке');
    }
}

// Почему филиал нельзя убрать у специалиста: текст причины или null. Мешают будущие часы работы и занятия в этом филиале
function specLocationBusy(PDO $db, int $specId, int $locId): ?string {
    $today = date('Y-m-d');
    $data = specialistsHoursMap($db, [$specId], $today)[$specId] ?? [];
    foreach ($data['schedules'] ?? [] as $s) {
        foreach ($s['work_hours'] as $w) {
            foreach ($w['intervals'] as $iv) {
                if ((int)$iv['location_id'] === $locId) return 'в графике «' . $s['name'] . '» есть часы работы в этом филиале';
            }
        }
    }
    foreach ($data['exceptions'] ?? [] as $e) {
        foreach ($e['work_hours'] ?? [] as $iv) {
            if ((int)$iv['location_id'] === $locId) return 'есть особые часы работы в этом филиале с ' . specFmtDate($e['date_from']);
        }
    }
    $st = $db->prepare('SELECT COUNT(*), MIN(slot_date) FROM slots WHERE specialist_id = ? AND location_id = ? AND active = 1 AND slot_date >= ?');
    $st->execute([$specId, $locId, $today]);
    [$n, $first] = $st->fetch(PDO::FETCH_NUM);
    if ((int)$n) return 'в расписании есть его занятия в этом филиале (' . (int)$n . ', ближайшее ' . specFmtDate($first) . ')';
    return null;
}

// Задать роли специалиста (внутри транзакции): каждая роль из $roleIds — в каждом филиале из $locIds. Новые строки
// user_roles добавляются, лишние закрываются (amnd_state = 'C'). Пустой $roleIds — снять все роли: специалист
// больше не работает. Убрать филиал с будущими часами работы или занятиями нельзя — ошибка с причиной
function saveSpecialistRoles(PDO $db, int $specId, array $roleIds, $locIds, ?int $userId): void {
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($locIds) ? $locIds : []))));
    if ($roleIds && !$ids) err('Укажите хотя бы один филиал, в котором работает специалист');
    foreach ($ids as $locId) specLocation($db, $locId);   // филиал существует и действующий
    $st = $db->prepare('SELECT user_id FROM specialists WHERE id = ?');
    $st->execute([$specId]);
    $personId = (int)$st->fetchColumn();

    $have = specialistsRoles($db, [$specId], true)[$specId] ?? [];
    if ($roleIds) {
        foreach (array_unique(array_column($have, 'location_id')) as $locId) {
            if (in_array($locId, $ids, true)) continue;
            if ($why = specLocationBusy($db, $specId, $locId)) {
                $loc = specLocationOrNull($db, $locId);
                err('Нельзя убрать филиал «' . ($loc ? $loc['name'] : $locId) . '»: ' . $why);
            }
        }
    }
    $keep = [];
    foreach ($have as $r) {
        if (in_array($r['role_id'], $roleIds, true) && in_array($r['location_id'], $ids, true)) $keep[$r['role_id'] . ':' . $r['location_id']] = true;
        else amndClose($db, 'user_roles', $r['id'], $userId);
    }
    foreach ($roleIds as $roleId) {
        foreach ($ids as $locId) {
            if (!isset($keep[$roleId . ':' . $locId])) {
                amndInsert($db, 'user_roles', ['user_id' => $personId, 'role_id' => $roleId, 'location_id' => $locId], $userId);
            }
        }
    }
}

// Специалист доступен этому администратору: работает хотя бы в одном из его филиалов (филиалы ролей специалиста).
// Администратору системы доступны все. Иначе — ошибка 403
function specialistGuard(PDO $db, array $user, int $specId): void {
    $branches = adminBranches($user);
    if ($branches === null) return;
    if (!array_intersect($branches, specialistLocations($db, $specId))) err('Это специалист другого филиала', 403);
}
