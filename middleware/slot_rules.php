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
//   5) нет пересечений с другими занятиями специалиста — в любом филиале и любой категории;
//      между занятиями в разных филиалах — не меньше времени на переезд между ними (travelMinutes).
// Ошибка — err() с понятным текстом. Вызывать внутри транзакции: строки филиала и специалиста блокируются
// (SELECT … FOR UPDATE), чтобы два одновременных сохранения не заняли зал дважды и не поставили человека в два места.
require_once __DIR__ . '/specialist_hours.php';
require_once __DIR__ . '/settings.php';

// Значение справочника по коду: [id, ref_id, name] или ошибка
function slotDict(PDO $db, string $group, string $code): array {
    $st = $db->prepare('SELECT id, ref_id, name FROM dictionaries WHERE group_code = ? AND code = ?');
    $st->execute([$group, $code]);
    $row = $st->fetch();
    if (!$row) err('Неизвестное значение справочника ' . $group . ': ' . $code);
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
//      'duration' => мин, 'cat' => activity_category.code, 'type' => slot_type.code|null, 'specialist_id' => id|null]
function checkSlot(PDO $db, array $s): void {
    checkSlotHall($db, $s);
    checkSlotSpecialist($db, $s);
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
        err('Зал филиала «' . slotLocName($db, $locId) . '» занят: ' . specFmtDate((string)$s['date']) . ' '
            . minToTimeStr($oStart) . '–' . minToTimeStr($oEnd) . ' «' . $o['name'] . '»');
    }
}

function checkSlotSpecialist(PDO $db, array $s): void {
    $locId  = (int)$s['location_id'];
    $specId = (int)($s['specialist_id'] ?? 0);
    $cat    = slotDict($db, 'activity_category', (string)$s['cat']);

    // Категория доступна в филиале
    if (!dictAvailableAt($db, (int)$cat['id'], $locId)) {
        err('Категория «' . $cat['name'] . '» недоступна в филиале «' . slotLocName($db, $locId) . '»');
    }

    // 1) Нужен ли специалист
    $needs = activityNeedsSpecialist((string)$s['cat'], $s['type'] ?? null);
    if (!$specId) {
        if ($needs) err('Укажите специалиста');
        return;
    }
    if ($s['cat'] === 'training' && ($s['type'] ?? null) === 'free') err('У самостоятельной тренировки нет тренера');

    // Блокируем строку специалиста до конца транзакции
    $st = $db->prepare('SELECT id, full_name, active FROM specialists WHERE id = ? FOR UPDATE');
    $st->execute([$specId]);
    $sp = $st->fetch();
    if (!$sp) err('Специалист не найден', 404);
    $who = $sp['full_name'];
    if (!(int)$sp['active']) err($who . ' — неактивный специалист');

    // 2–3) Специализация, которая ведёт категорию, — у специалиста есть и доступна в филиале
    if ($cat['ref_id']) {
        $st = $db->prepare('SELECT d.name FROM dictionaries d WHERE d.id = ?');
        $st->execute([(int)$cat['ref_id']]);
        $typeName = (string)$st->fetchColumn();
        $st = $db->prepare('SELECT 1 FROM specialist_types WHERE specialist_id = ? AND type_id = ? AND active = 1');
        $st->execute([$specId, (int)$cat['ref_id']]);
        if (!$st->fetchColumn()) err($who . ' — не ' . mb_strtolower($typeName) . ': «' . $cat['name'] . '» ведёт ' . mb_strtolower($typeName));
        if (!dictAvailableAt($db, (int)$cat['ref_id'], $locId)) {
            err('Специализация «' . $typeName . '» недоступна в филиале «' . slotLocName($db, $locId) . '»');
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
            err($who . ' ' . $when . ' не работает' . ($day['reason'] ? ' (' . $day['reason'] . ')' : ''));
        }
        $here = array_filter($day['intervals'], fn($iv) => (int)$iv['location_id'] === $locId);
        if (!$here) err($who . ' ' . $when . ' не работает в филиале «' . slotLocName($db, $locId) . '»');
        err($who . ' ' . $when . ' работает в этом филиале ' . implode(', ', array_map(fn($iv) => $iv['from'] . '–' . $iv['to'], $here))
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
        $gap = travelMinutes($db, $locId, (int)$o['location_id']);
        if ($start < $oEnd + $gap && $oStart < $end + $gap) {
            $other = specFmtDate($date) . ' ' . minToTimeStr($oStart) . '–' . minToTimeStr($oEnd) . ' «' . $o['name'] . '»';
            if ($sameLoc || ($start < $oEnd && $oStart < $end)) {
                err($who . ': уже есть занятие ' . $other . ($sameLoc ? '' : ' в филиале «' . slotLocName($db, (int)$o['location_id']) . '»'));
            }
            err($who . ' не успеет переехать: ' . $other . ' в филиале «' . slotLocName($db, (int)$o['location_id'])
                . '». На переезд между этими филиалами нужно не меньше ' . fmtMinutes($gap));
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
