<?php
// ═══════════════════════════════════════════════════════════
// middleware/roles.php — Права по ролям и филиалам
// ═══════════════════════════════════════════════════════════
// Кто что может — задано здесь, в одном месте. Проверка — authCan('право', филиал).
// Роли человека читаются из user_roles при каждом запросе (sessionCurrent): снятая роль перестаёт действовать сразу.
//
// Права:
//   journal     — журнал записи филиала: запись, перенос и отмена записей клиентов
//   bookings    — раздел «Записи» филиала и отметка оплаты
//   schedule    — расписание филиала: добавить, изменить, перенести и удалить занятие
//   blocks      — блокировка станков на занятие в расписании филиала
//   library     — изменение библиотеки тренировок и услуг
//   hall        — изменение зала: станки и их расстановка
//   clients     — клиентская база (общая для всех филиалов)
//   spec_hours  — графики специалистов (администратор студии меняет только интервалы своего филиала)
//   specialists — добавление, изменение и удаление специалиста
//   system      — справочники, параметры, филиалы, типы станков
//
// Администратор системы может всё и во всех филиалах. Администратор студии — права из списка ниже и только
// в филиалах своих ролей (user_roles.location_id). Библиотеку, зал, справочники и параметры он видит (своих
// филиалов), но не меняет: на чтение достаточно быть администратором (authAdmin). Тренер и механик прав в панели пока не имеют.

const BRANCH_RIGHTS = ['journal', 'bookings', 'schedule', 'blocks', 'library', 'hall'];   // проверяются вместе с филиалом
// Расписание администратор студии не меняет (право schedule) — только блокирует станки на занятие (blocks)
const STUDIO_ADMIN_RIGHTS = ['journal', 'bookings', 'blocks', 'clients', 'spec_hours'];
const ALL_RIGHTS = ['journal', 'bookings', 'schedule', 'blocks', 'clients', 'spec_hours', 'specialists', 'library', 'hall', 'system'];

// Роли специалистов: тренер, байкфиттер, механик. Такая роль выдаётся с филиалом (user_roles.location_id) — это и есть
// «кем и где работает специалист»; категория занятия ссылается на роль, которая его ведёт (dictionaries.ref_id).
// Тот же список — в specialists_view (db/schema.sql)
const SPEC_ROLES = ['trainer', 'bikefitter', 'mechanic'];

function isSystemAdmin(array $user): bool {
    foreach ($user['roles'] as $r) if ($r['code'] === 'system_admin') return true;
    return false;
}

// Филиалы, в которых человек — администратор: null — все (администратор системы), иначе список id (может быть пустым)
function adminBranches(array $user): ?array {
    if (isSystemAdmin($user)) return null;
    $ids = [];
    foreach ($user['roles'] as $r) {
        if ($r['code'] === 'studio_admin' && $r['location_id'] !== null) $ids[] = (int)$r['location_id'];
    }
    return array_values(array_unique($ids));
}

// Есть ли у человека право (без учёта филиала)
function userHasRight(array $user, string $right): bool {
    if (isSystemAdmin($user)) return true;
    return in_array($right, STUDIO_ADMIN_RIGHTS, true) && adminBranches($user);
}

// Есть ли право в этом филиале
function userCanAt(array $user, string $right, int $locId): bool {
    if (!userHasRight($user, $right)) return false;
    $branches = adminBranches($user);
    return $branches === null || in_array($locId, $branches, true);
}

// Вошедший пользователь с правом $right; для прав по филиалу $locId — филиал объекта (null — проверить только само право,
// филиал тогда обязан проверить вызывающий: branchGuard или branchFilter). Нет права — ошибка 403
function authCan(string $right, ?int $locId = null): array {
    $user = authUser();
    if (!userHasRight($user, $right)) err('Недостаточно прав', 403);
    if ($locId !== null) branchGuard($user, $locId);
    return $user;
}

// Объект из филиала $locId доступен этому администратору; иначе 403
function branchGuard(array $user, int $locId): void {
    $branches = adminBranches($user);
    if ($branches !== null && !in_array($locId, $branches, true)) err('Это данные другого филиала', 403);
}

// Условие SQL «только филиалы этого администратора» для списков: ['sql' => ' AND s.location_id IN (?,?)', 'params' => [..]].
// У администратора системы — пустое условие
function branchFilter(array $user, string $column): array {
    $branches = adminBranches($user);
    if ($branches === null) return ['sql' => '', 'params' => []];
    if (!$branches) return ['sql' => ' AND 0', 'params' => []];
    return ['sql' => ' AND ' . $column . ' IN (' . implode(',', array_fill(0, count($branches), '?')) . ')', 'params' => $branches];
}

// Для страницы: какие права есть и в каких филиалах (null — во всех)
function userAccess(array $user): array {
    $rights = [];
    foreach (ALL_RIGHTS as $r) if (userHasRight($user, $r)) $rights[] = $r;
    return ['rights' => $rights, 'branches' => adminBranches($user)];
}

// ── Филиал объекта (для branchGuard): id филиала или ошибка 404 ──
function rowBranch(PDO $db, string $sql, int $id, string $notFound): int {
    $st = $db->prepare($sql);
    $st->execute([$id]);
    $loc = $st->fetchColumn();
    if ($loc === false) err($notFound, 404);
    return (int)$loc;
}
function slotBranch(PDO $db, int $slotId): int {
    return rowBranch($db, 'SELECT location_id FROM slots WHERE id = ?', $slotId, 'Занятие не найдено');
}
function stationBranch(PDO $db, int $stationId): int {
    return rowBranch($db, 'SELECT location_id FROM stations WHERE id = ?', $stationId, 'Станок не найден');
}
function libraryBranch(PDO $db, int $libId): int {
    return rowBranch($db, 'SELECT location_id FROM library WHERE id = ?', $libId, 'Запись библиотеки не найдена');
}
function bookingBranch(PDO $db, int $bookingId): int {
    return rowBranch($db, 'SELECT s.location_id FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.id = ?', $bookingId, 'Запись не найдена');
}

// Администратор действует за клиента (запись, перенос, отмена) только в своих филиалах; клиента это не касается
function adminAt(array $user, int $locId): void {
    if (($user['role'] ?? '') === 'admin') branchGuard($user, $locId);
}
