<?php
// ═══════════════════════════════════════════════════════════
// middleware/auth.php — Телефон как логин, пароль, роли
// ═══════════════════════════════════════════════════════════
// Один человек — одна строка users, телефон уникален (users.uq_users_phone) и хранится только цифрами.
// Роли сотрудников — user_roles; клиентом может быть любой пользователь.

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;   // больше bcrypt не учитывает

// Роли, дающие доступ в панель администратора
const ADMIN_ROLES = ['system_admin', 'studio_admin'];

// Номер цифрами в виде 7XXXXXXXXXX (10 цифр — добавляем 7, «8…» — это тот же «7…») или null
function phoneDigits(string $phone): ?string {
    $d = preg_replace('/\D+/', '', $phone);
    if (strlen($d) === 10) $d = '7' . $d;
    if (strlen($d) === 11 && $d[0] === '8') $d = '7' . substr($d, 1);
    return strlen($d) >= 11 && strlen($d) <= 15 ? $d : null;
}

// Телефон в том же виде, что даёт маска ввода на сайте (maskPhone): +7 (XXX) XXX-XX-XX; не российский номер — +цифры
function phoneView(?string $digits): string {
    $digits = (string)$digits;
    if ($digits === '') return '';
    if (strlen($digits) !== 11 || $digits[0] !== '7') return '+' . $digits;
    return '+7 (' . substr($digits, 1, 3) . ') ' . substr($digits, 4, 3) . '-' . substr($digits, 7, 2) . '-' . substr($digits, 9, 2);
}

// Телефон в строках ответа — в виде для экрана (в базе — цифры)
function phoneViewRows(array $rows, string $field = 'phone'): array {
    foreach ($rows as &$r) {
        if (array_key_exists($field, $r)) $r[$field] = phoneView($r[$field]);
    }
    return $rows;
}

// Сохранение строки users упёрлось в уникальный индекс телефона (два запроса с одним номером одновременно)
function isDuplicatePhone(PDOException $e): bool {
    return ($e->errorInfo[1] ?? 0) === 1062 && strpos($e->getMessage(), 'uq_users_phone') !== false;
}

// Текст ошибки пароля или null. Правила: длина; не из списка частых паролей (middleware/weak_passwords.txt);
// не простая последовательность (один символ, 12345678, qwertyui…); не совпадает с телефоном и именем человека.
// Требований «цифра, заглавная буква, спецсимвол» нет намеренно. $person — ['phone' => цифры, 'names' => [имя, фамилия]]
function passwordProblem(string $password, array $person = []): ?string {
    if (mb_strlen($password) < PASSWORD_MIN_LENGTH) return 'Пароль не короче ' . PASSWORD_MIN_LENGTH . ' символов';
    if (strlen($password) > PASSWORD_MAX_LENGTH) return 'Пароль слишком длинный';
    $p = mb_strtolower($password);

    $simple = 'Пароль слишком простой — такой часто подбирают';
    if (count(array_unique(mb_str_split($p))) < 4) return $simple;                       // «aaaaaaaa», «abababab»
    // подряд идущие символы: цифры, алфавит, ряды клавиатуры — в обе стороны
    foreach (['01234567890123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm', 'йцукенгшщзхъфывапролджэячсмитьбю', 'абвгдежзийклмнопрстуфхцчшщъыьэюя'] as $row) {
        if (mb_strpos($row, $p) !== false || mb_strpos(strrevUtf8($row), $p) !== false) return $simple;
    }
    if (isset(weakPasswords()[$p])) return $simple;

    $own = 'Пароль не должен совпадать с телефоном или именем';
    $digits = preg_replace('/\D+/', '', $password);
    $phone  = (string)($person['phone'] ?? '');
    if ($phone !== '' && strlen($digits) >= 7 && (strpos($phone, $digits) !== false || strpos($digits, substr($phone, -10)) !== false)) return $own;
    $letters = preg_replace('/[^\p{L}]+/u', '', $p);
    foreach ($person['names'] ?? [] as $name) {
        $n = mb_strtolower(trim((string)$name));
        if (mb_strlen($n) >= 3 && $letters === $n) return $own;                           // «Виктория2026», «волкова!»
    }
    return null;
}
function strrevUtf8(string $s): string {
    return implode('', array_reverse(mb_str_split($s)));
}
// Список частых паролей: [пароль => true]
function weakPasswords(): array {
    static $set = null;
    if ($set === null) {
        $set = [];
        foreach (@file(__DIR__ . '/weak_passwords.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = mb_strtolower(trim($line));
            if ($line !== '' && $line[0] !== '#') $set[$line] = true;
        }
    }
    return $set;
}

// Действующие роли сотрудника: [['code' => 'studio_admin', 'location_id' => 2], …]
function userRoles(PDO $db, int $userId): array {
    $st = $db->prepare("SELECT d.code, ur.location_id FROM user_roles ur
                        JOIN dictionaries d ON d.id = ur.role_id AND d.group_code = 'user_role'
                        WHERE ur.user_id = ? AND ur.amnd_state = 'A'");
    $st->execute([$userId]);
    return array_map(fn($r) => ['code' => $r['code'], 'location_id' => $r['location_id'] !== null ? (int)$r['location_id'] : null],
                     $st->fetchAll());
}

// Роль для интерфейса и проверок authAdmin(): admin — администратор системы или студии, иначе client.
// Временно, до прав по ролям и филиалам (authCan): администратор студии пока видит все филиалы.
function userRole(PDO $db, int $userId): string {
    foreach (userRoles($db, $userId) as $r) {
        if (in_array($r['code'], ADMIN_ROLES, true)) return 'admin';
    }
    return 'client';
}

// Сменить телефон человека: номер должен остаться уникальным; подтверждение прежнего номера сбрасывается.
// $actor — кто меняет (для журнала действий). Номер тот же — ничего не происходит
function setUserPhone(PDO $db, int $userId, string $digits, ?array $actor = null): void {
    $st = $db->prepare('SELECT phone FROM users WHERE id = ?');
    $st->execute([$userId]);
    $old = (string)$st->fetchColumn();
    if ($old === $digits) return;
    $st = $db->prepare('SELECT name FROM users WHERE phone = ? AND id <> ?');
    $st->execute([$digits, $userId]);
    if ($other = $st->fetchColumn()) err('Этот телефон уже записан за другим человеком: ' . $other);
    try {
        $db->prepare('UPDATE users SET phone_verified_at     = IF(phone = ?, phone_verified_at, NULL),
                                       phone_verified_by     = IF(phone = ?, phone_verified_by, NULL),
                                       phone_verified_method = IF(phone = ?, phone_verified_method, NULL),
                                       phone = ?
                      WHERE id = ?')
           ->execute([$digits, $digits, $digits, $digits, $userId]);
    } catch (PDOException $e) {
        if (isDuplicatePhone($e)) err('Этот телефон уже записан за другим человеком');
        throw $e;
    }
    logAction($db, $actor, 'client.phone_changed', 'users', $userId, ['old' => $old, 'new' => $digits]);
}

// Человек с этим телефоном: есть — его id (имя и фамилия обновляются, отключённый включается снова),
// нет — создаётся без личного кабинета. Так сотрудник и клиент с одним номером остаются одной записью.
function personByPhone(PDO $db, string $first, string $last, string $digits): int {
    $st = $db->prepare('SELECT id FROM users WHERE phone = ?');
    $st->execute([$digits]);
    if ($id = (int)$st->fetchColumn()) {
        $db->prepare('UPDATE users SET first_name = ?, last_name = ?, active = 1 WHERE id = ?')->execute([$first, $last, $id]);
        return $id;
    }
    try {
        $db->prepare('INSERT INTO users (first_name, last_name, phone, has_account) VALUES (?, ?, ?, 0)')
           ->execute([$first, $last, $digits]);
    } catch (PDOException $e) {
        if (isDuplicatePhone($e)) err('Человек с таким телефоном только что добавлен — повторите сохранение');
        throw $e;
    }
    return (int)$db->lastInsertId();
}
