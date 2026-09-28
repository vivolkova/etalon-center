<?php
// ═══════════════════════════════════════════════════════════
// middleware/specialist_hours.php — График работы специалистов
// ═══════════════════════════════════════════════════════════
// Периоды графика (specialist_schedules) — недельный шаблон с интервалами на каждый день.
// Исключения (specialist_exceptions) — «не работает» или «особые часы» на дату/диапазон, важнее шаблона.
// Часы специалиста = исключение, иначе шаблон периода на эту дату, иначе — не работает.

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

// Проверка и нормализация интервалов дня: HH:MM с шагом 15 минут, начало < окончания,
// без пересечений; результат отсортирован по началу. $label — для текста ошибки.
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
        $list[] = ['from' => $from, 'to' => $to];
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

// Режим работы филиала специалиста: [день => {from,to} | null (выходной)]; null — режим не задан
function specBranchHours(PDO $db, int $specId): ?array {
    $st = $db->prepare('SELECT l.work_hours FROM specialists sp JOIN locations l ON l.id = sp.location_id WHERE sp.id = ?');
    $st->execute([$specId]);
    $hours = json_decode((string)$st->fetchColumn(), true);
    if (!is_array($hours) || !$hours) return null;
    $map = array_fill_keys(SPEC_DAYS, null);
    foreach ($hours as $h) {
        if (!empty($h['open']) && !empty($h['from']) && !empty($h['to'])) {
            $map[$h['day']] = ['from' => $h['from'], 'to' => $h['to']];
        }
    }
    return $map;
}

// Интервалы специалиста должны укладываться в режим работы филиала в этот день недели
function specCheckInBranch(?array $branch, string $dayName, array $intervals, string $label): void {
    if ($branch === null || !$intervals) return;
    $b = $branch[$dayName] ?? null;
    if (!$b) err($label . ': в этот день филиал не работает');
    foreach ($intervals as $iv) {
        if (specTimeToMin($iv['from']) < specTimeToMin($b['from']) || specTimeToMin($iv['to']) > specTimeToMin($b['to'])) {
            err($label . ': часы должны быть в режиме работы филиала ' . $b['from'] . '–' . $b['to']);
        }
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
    $st = $db->prepare('SELECT id, specialist_id, name, date_from, date_to, week FROM specialist_schedules'
        . ($schedWhere ? ' WHERE ' . implode(' AND ', $schedWhere) : '') . ' ORDER BY date_from');
    $st->execute($schedArgs);
    foreach ($st->fetchAll() as $r) {
        $map[$r['specialist_id']]['schedules'][] = specDecodeRow($r, 'week');
    }
    $excWhere = $where; $excArgs = $args;
    if ($fromDate) { $excWhere[] = 'date_to >= ?'; $excArgs[] = $fromDate; }
    $st = $db->prepare('SELECT id, specialist_id, date_from, date_to, type, intervals, reason FROM specialist_exceptions'
        . ($excWhere ? ' WHERE ' . implode(' AND ', $excWhere) : '') . ' ORDER BY date_from');
    $st->execute($excArgs);
    foreach ($st->fetchAll() as $r) {
        $map[$r['specialist_id']]['exceptions'][] = specDecodeRow($r, 'intervals');
    }
    return $map;
}

// Часы работы специалиста по датам [$from; $to]:
// [{date, intervals:[{from,to}], source:'exception'|'schedule'|'none', reason, schedule}]
// intervals пуст — в этот день не работает. Для построения расписания.
function specialistAvailability(PDO $db, int $specId, string $from, string $to): array {
    $data = specialistsHoursMap($db, [$specId])[$specId] ?? [];
    $schedules  = $data['schedules'] ?? [];
    $exceptions = $data['exceptions'] ?? [];
    $branch = specBranchHours($db, $specId);
    $out = [];
    for ($ts = strtotime($from); $ts <= strtotime($to); $ts = strtotime('+1 day', $ts)) {
        $date = date('Y-m-d', $ts);
        $day = ['date' => $date, 'intervals' => [], 'source' => 'none', 'reason' => null, 'schedule' => ''];
        $exc = null;
        foreach ($exceptions as $e) { if ($e['date_from'] <= $date && $e['date_to'] >= $date) { $exc = $e; break; } }
        if ($exc) {
            $day['source'] = 'exception';
            $day['reason'] = $exc['reason'];
            // Особые часы на выходной день филиала (диапазон захватил выходной) — не работает
            $branchClosed = $branch !== null && $branch[specDayName($date)] === null;
            $day['intervals'] = $exc['type'] === 'custom' && !$branchClosed ? ($exc['intervals'] ?? []) : [];
        } else {
            foreach ($schedules as $s) {
                if ($s['date_from'] <= $date && ($s['date_to'] === null || $s['date_to'] >= $date)) {
                    $day['source'] = 'schedule';
                    $day['schedule'] = $s['name'];
                    $dayName = specDayName($date);
                    foreach ($s['week'] as $w) { if ($w['day'] === $dayName) { $day['intervals'] = $w['intervals']; break; } }
                    break;
                }
            }
        }
        $out[] = $day;
    }
    return $out;
}
