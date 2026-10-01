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
