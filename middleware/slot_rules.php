<?php
// ═══════════════════════════════════════════════════════════
// middleware/slot_rules.php — Можно ли поставить занятие: свободен ли зал и может ли специалист его провести
// ═══════════════════════════════════════════════════════════
// Одна проверка для всех мест, где создаётся или меняется занятие (админка, позже — запись клиента): checkSlot().
// Зал (checkSlotHall): тренировки проходят в зале филиала и не пересекаются по времени — групповая занимает
//   весь зал; персональная и самостоятельная могут идти одновременно (на разных станках), но не с групповой.
//   Байкфит и другие категории — в отдельных помещениях, зал не занимают.
// Специалист (checkSlotSpecialist):
//   1) специалист указан, если занятию он нужен (activityNeedsSpecialist); у самостоятельной — не указан;
//   2) специалист активен и у него есть специализация, которая ведёт эту категорию (activity_category.ref_id);
//   3) категория и специализация доступны в филиале занятия (location_dictionaries);
//   4) занятие целиком в одном рабочем интервале специалиста в этом филиале (график, отсутствия, особые часы);
//   5) нет пересечений с другими занятиями специалиста — в любом филиале и любой категории.
//      Время на переезд между филиалами отдельно не проверяется: оно заложено в график специалиста (п. 4).
// Ошибка — err() с понятным текстом. Вызывать внутри транзакции: строки филиала и специалиста блокируются
// (SELECT … FOR UPDATE), чтобы два одновременных сохранения не заняли зал дважды и не поставили человека в два места.
// slotRuleError() — те же проверки без завершения запроса (текст ошибки или null): для подбора свободного времени.
require_once __DIR__ . '/specialist_hours.php';
require_once __DIR__ . '/settings.php';

// Нарушение правила занятия: checkSlot превращает его в err(), slotRuleError — в текст
class SlotRuleError extends RuntimeException {}
function slotFail(string $message): never { throw new SlotRuleError($message); }

// Индивидуальное занятие (персональная, самостоятельная, услуга) — один клиент на слот; такой слот создаёт
// запись клиента (api/individual.php) и помечает его slots.auto_created = 1. Признак — это поле, а не вид занятия.

// Значение справочника по коду: [id, ref_id, name] или ошибка
function slotDict(PDO $db, string $group, string $code): array {
    $st = $db->prepare('SELECT id, ref_id, name FROM dictionaries WHERE group_code = ? AND code = ?');
    $st->execute([$group, $code]);
    $row = $st->fetch();
    if (!$row) err('Неизвестное значение справочника ' . $group . ': ' . $code);
    return $row;
}

// Категория занятия по коду (тренировка или услуга — CATEGORY_GROUPS): [id, ref_id, name] или ошибка
function slotCategory(PDO $db, string $code): array {
    $st = $db->prepare('SELECT id, ref_id, name FROM dictionaries WHERE group_code IN (' . CATEGORY_GROUPS_SQL . ') AND code = ?');
    $st->execute([$code]);
    $row = $st->fetch();
    if (!$row) err('Неизвестная категория занятия: ' . $code);
    return $row;
}

// Доступно ли значение справочника в филиале (активная строка location_dictionaries)
function dictAvailableAt(PDO $db, int $dictId, int $locId): bool {
    $st = $db->prepare('SELECT 1 FROM location_dictionaries WHERE dictionary_id = ? AND location_id = ? AND active = 1');
    $st->execute([$dictId, $locId]);
    return (bool)$st->fetchColumn();
}

function slotLocName(PDO $db, int $locId): string {
    $l = specLocationOrNull($db, $locId);
    return $l ? $l['name'] : 'филиал #' . $locId;
}

// $s: ['id' => id изменяемого слота|null, 'location_id', 'date' => 'Y-m-d', 'start' => 'HH:MM',
//      'duration' => мин, 'cat' => код категории (training или услуга), 'type' => slot_type.code|null, 'specialist_id' => id|null]
function checkSlot(PDO $db, array $s): void {
    $e = slotRuleError($db, $s);
    if ($e !== null) err($e);
}

// То же без завершения запроса; $withHours — ещё и режим работы филиала (админка проверяет его отдельно)
function slotRuleError(PDO $db, array $s, bool $withHours = false): ?string {
    try {
        if ($withHours) checkSlotWorkHours($db, $s);
        checkSlotHall($db, $s);
        checkSlotSpecialist($db, $s);
        return null;
    } catch (SlotRuleError $e) {
        return $e->getMessage();
    }
}

// Часы работы филиала в дату: ['from' => мин, 'to' => мин]; null — выходной или филиал недействующий;
// режим работы не задан — весь день
function slotBranchHours(PDO $db, int $locId, string $date): ?array {
    $loc = specLocationOrNull($db, $locId);
    if (!$loc) return null;
    if ($loc['days'] === null) return ['from' => 0, 'to' => 24 * 60];
    $h = $loc['days'][specDayName($date)] ?? null;
    return $h ? ['from' => specTimeToMin($h['from']), 'to' => specTimeToMin($h['to'])] : null;
}

// Занятие целиком в режиме работы филиала (locations.work_hours)
function checkSlotWorkHours(PDO $db, array $s): void {
    $locId = (int)$s['location_id'];
    $date  = (string)$s['date'];
    if (!specLocationOrNull($db, $locId)) slotFail('Филиал не найден или недействующий');
    $h = slotBranchHours($db, $locId, $date);
    if (!$h) slotFail('В этот день (' . specDayName($date) . ') филиал не работает');
    $start = specTimeToMin(substr((string)$s['start'], 0, 5));
    if ($start < $h['from'] || $start + (int)$s['duration'] > $h['to']) {
        slotFail('Занятие должно быть в режиме работы филиала: ' . minToTimeStr($h['from']) . '–' . minToTimeStr($h['to']));
    }
}

// Зал филиала: тренировка не пересекается с другими тренировками в этом филиале
// (две персональные / самостоятельные одновременно — можно, если ни одна не групповая)
function checkSlotHall(PDO $db, array $s): void {
    if ($s['cat'] !== 'training') return;
    $locId = (int)$s['location_id'];
    // Блокируем строку филиала до конца транзакции
    $db->prepare('SELECT id FROM locations WHERE id = ? FOR UPDATE')->execute([$locId]);
    $start = specTimeToMin(substr((string)$s['start'], 0, 5));
    $end   = $start + (int)$s['duration'];
    $st = $db->prepare("SELECT s.name, s.start_time, s.duration, dt.code AS type FROM slots s
                        JOIN dictionaries dc ON dc.id = s.category_id AND dc.code = 'training'
                        LEFT JOIN library l ON l.id = s.library_id
                        LEFT JOIN dictionaries dt ON dt.id = l.slot_type_id
                        WHERE s.location_id = ? AND s.slot_date = ? AND s.active = 1 AND s.id <> ?");
    $st->execute([$locId, (string)$s['date'], (int)($s['id'] ?? 0)]);
    foreach ($st->fetchAll() as $o) {
        $oStart = specTimeToMin(substr($o['start_time'], 0, 5));
        $oEnd   = $oStart + (int)$o['duration'];
        if (!($start < $oEnd && $oStart < $end)) continue;
        $shared = in_array($s['type'] ?? null, ['personal', 'free'], true) && in_array($o['type'], ['personal', 'free'], true);
        if ($shared) continue;
        slotFail('Зал филиала «' . slotLocName($db, $locId) . '» занят: ' . specFmtDate((string)$s['date']) . ' '
            . minToTimeStr($oStart) . '–' . minToTimeStr($oEnd) . ' «' . $o['name'] . '»');
    }
}

function checkSlotSpecialist(PDO $db, array $s): void {
    $locId  = (int)$s['location_id'];
    $specId = (int)($s['specialist_id'] ?? 0);
    $cat    = slotCategory($db, (string)$s['cat']);

    // Категория доступна в филиале
    if (!dictAvailableAt($db, (int)$cat['id'], $locId)) {
        slotFail('Категория «' . $cat['name'] . '» недоступна в филиале «' . slotLocName($db, $locId) . '»');
    }

    // 1) Нужен ли специалист
    $needs = activityNeedsSpecialist((string)$s['cat'], $s['type'] ?? null);
    if (!$specId) {
        if ($needs) slotFail('Укажите специалиста');
        return;
    }
    if ($s['cat'] === 'training' && ($s['type'] ?? null) === 'free') slotFail('У самостоятельной тренировки нет тренера');

    // Блокируем строку специалиста до конца транзакции
    $st = $db->prepare('SELECT id, full_name, active FROM specialists WHERE id = ? FOR UPDATE');
    $st->execute([$specId]);
    $sp = $st->fetch();
    if (!$sp) slotFail('Специалист не найден', 404);
    $who = $sp['full_name'];
    if (!(int)$sp['active']) slotFail($who . ' — неактивный специалист');

    // 2–3) Специализация, которая ведёт категорию, — у специалиста есть и доступна в филиале
    if ($cat['ref_id']) {
        $st = $db->prepare('SELECT d.name FROM dictionaries d WHERE d.id = ?');
        $st->execute([(int)$cat['ref_id']]);
        $typeName = (string)$st->fetchColumn();
        $st = $db->prepare('SELECT 1 FROM specialist_types WHERE specialist_id = ? AND type_id = ? AND active = 1');
        $st->execute([$specId, (int)$cat['ref_id']]);
        if (!$st->fetchColumn()) slotFail($who . ' — не ' . mb_strtolower($typeName) . ': «' . $cat['name'] . '» ведёт ' . mb_strtolower($typeName));
        if (!dictAvailableAt($db, (int)$cat['ref_id'], $locId)) {
            slotFail('Специализация «' . $typeName . '» недоступна в филиале «' . slotLocName($db, $locId) . '»');
        }
    }

    // 4) Целиком в одном рабочем интервале специалиста в этом филиале
    $date  = (string)$s['date'];
    $start = specTimeToMin(substr((string)$s['start'], 0, 5));
    $end   = $start + (int)$s['duration'];
    $day   = specialistAvailability($db, $specId, $date, $date)[0];
    $fits  = false;
    foreach ($day['intervals'] as $iv) {
        if ((int)$iv['location_id'] === $locId && specTimeToMin($iv['from']) <= $start && $end <= specTimeToMin($iv['to'])) { $fits = true; break; }
    }
    if (!$fits) {
        $when = specFmtDate($date);
        if (!$day['intervals']) {
            slotFail($who . ' ' . $when . ' не работает' . ($day['reason'] ? ' (' . $day['reason'] . ')' : ''));
        }
        $here = array_filter($day['intervals'], fn($iv) => (int)$iv['location_id'] === $locId);
        if (!$here) slotFail($who . ' ' . $when . ' не работает в филиале «' . slotLocName($db, $locId) . '»');
        slotFail($who . ' ' . $when . ' работает в этом филиале ' . implode(', ', array_map(fn($iv) => $iv['from'] . '–' . $iv['to'], $here))
            . ' — занятие должно целиком помещаться в один интервал');
    }

    // 5) Пересечения с другими занятиями специалиста в этот день (все филиалы, все категории)
    $st = $db->prepare('SELECT s.id, s.name, s.location_id, s.start_time, s.duration FROM slots s
                        WHERE s.specialist_id = ? AND s.active = 1 AND s.slot_date = ? AND s.id <> ?');
    $st->execute([$specId, $date, (int)($s['id'] ?? 0)]);
    foreach ($st->fetchAll() as $o) {
        $oStart = specTimeToMin(substr($o['start_time'], 0, 5));
        $oEnd   = $oStart + (int)$o['duration'];
        $sameLoc = (int)$o['location_id'] === $locId;
        if ($start < $oEnd && $oStart < $end) {
            $other = specFmtDate($date) . ' ' . minToTimeStr($oStart) . '–' . minToTimeStr($oEnd) . ' «' . $o['name'] . '»';
            slotFail($who . ': уже есть занятие ' . $other . ($sameLoc ? '' : ' в филиале «' . slotLocName($db, (int)$o['location_id']) . '»'));
        }
    }
}

// 90 -> «1 ч 30 мин», 60 -> «1 ч», 45 -> «45 мин»
function fmtMinutes(int $m): string {
    $h = intdiv($m, 60); $r = $m % 60;
    return trim(($h ? $h . ' ч ' : '') . ($r || !$h ? $r . ' мин' : ''));
}

function minToTimeStr(int $m): string {
    return sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
}

// ═══ Защита уже поставленных занятий от изменений задним числом ═══
// Изменение графика, отсутствий, особых часов, специализаций или активности специалиста сначала записывается
// в транзакции, затем все его будущие активные занятия в затронутых датах проверяются по новым данным.
// Хоть одно перестало подходить — откат и ошибка со списком занятий (specialistSlotsGuard).

// Заблокировать строку специалиста до конца транзакции (чтобы параллельно не поставили занятие): [full_name, active]
function lockSpecialist(PDO $db, int $specId): array {
    $st = $db->prepare('SELECT id, full_name, active FROM specialists WHERE id = ? FOR UPDATE');
    $st->execute([$specId]);
    $sp = $st->fetch();
    if (!$sp) err('Специалист не найден', 404);
    return $sp;
}

// Будущие (с сегодняшнего дня) активные занятия специалиста в датах [$from; $to] ($to = null — без конца),
// которые он по текущим данным провести не может: [{slot, reason}]
function specialistSlotConflicts(PDO $db, int $specId, ?string $from = null, ?string $to = null): array {
    $today = date('Y-m-d');
    if ($from === null || $from < $today) $from = $today;
    if ($to !== null && $to < $from) return [];
    $sql = 'SELECT s.id, s.name, s.slot_date, s.start_time, s.duration, s.location_id, dc.ref_id, rt.name AS type_name
            FROM slots s
            JOIN dictionaries dc ON dc.id = s.category_id
            LEFT JOIN dictionaries rt ON rt.id = dc.ref_id
            WHERE s.specialist_id = ? AND s.active = 1 AND s.slot_date >= ?' . ($to !== null ? ' AND s.slot_date <= ?' : '') . '
            ORDER BY s.slot_date, s.start_time';
    $st = $db->prepare($sql);
    $st->execute($to !== null ? [$specId, $from, $to] : [$specId, $from]);
    $slots = $st->fetchAll();
    if (!$slots) return [];

    $st = $db->prepare('SELECT active FROM specialists WHERE id = ?');
    $st->execute([$specId]);
    $active = (int)$st->fetchColumn();
    $st = $db->prepare('SELECT type_id FROM specialist_types WHERE specialist_id = ? AND active = 1');
    $st->execute([$specId]);
    $types = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));

    $days = [];   // кеш часов работы по датам
    $out = [];
    foreach ($slots as $s) {
        $reason = null;
        if (!$active) {
            $reason = 'специалист неактивен';
        } elseif ($s['ref_id'] && !in_array((int)$s['ref_id'], $types, true)) {
            $reason = 'нет специализации «' . $s['type_name'] . '»';
        } else {
            $date = $s['slot_date'];
            $day = $days[$date] ??= specialistAvailability($db, $specId, $date, $date)[0];
            $locId = (int)$s['location_id'];
            $start = specTimeToMin(substr($s['start_time'], 0, 5));
            $end   = $start + (int)$s['duration'];
            $here  = array_filter($day['intervals'], fn($iv) => (int)$iv['location_id'] === $locId);
            $fits  = false;
            foreach ($here as $iv) {
                if (specTimeToMin($iv['from']) <= $start && $end <= specTimeToMin($iv['to'])) { $fits = true; break; }
            }
            if (!$fits) {
                if (!$day['intervals']) $reason = 'не работает' . ($day['reason'] ? ': ' . $day['reason'] : '');
                elseif (!$here) $reason = 'не работает в филиале «' . slotLocName($db, $locId) . '»';
                else $reason = 'вне часов работы (' . implode(', ', array_map(fn($iv) => $iv['from'] . '–' . $iv['to'], $here)) . ')';
            }
        }
        if ($reason !== null) $out[] = ['slot' => $s, 'reason' => $reason];
    }
    return $out;
}

// Проверить будущие занятия специалиста после изменения (внутри транзакции): есть конфликты — откат и ошибка.
// $what — что пытались сделать, для текста: «сохранить отсутствие», «удалить период графика»…
function specialistSlotsGuard(PDO $db, int $specId, ?string $from, ?string $to, string $what): void {
    $conf = specialistSlotConflicts($db, $specId, $from, $to);
    if (!$conf) return;
    $st = $db->prepare('SELECT full_name FROM specialists WHERE id = ?');
    $st->execute([$specId]);
    $who = (string)$st->fetchColumn();
    $db->rollBack();
    $list = array_map(fn($c) => specFmtDate($c['slot']['slot_date']) . ' ' . substr($c['slot']['start_time'], 0, 5)
        . ' «' . $c['slot']['name'] . '» — ' . $c['reason'], array_slice($conf, 0, 5));
    err('Нельзя ' . $what . ': у специалиста ' . $who . ' есть занятия, которые станут невозможны: '
        . implode('; ', $list) . (count($conf) > 5 ? '; и ещё ' . (count($conf) - 5) : '')
        . '. Перенесите эти занятия или назначьте другого специалиста.');
}
