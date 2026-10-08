<?php
// ═══════════════════════════════════════════════════════════
// middleware/amnd.php — История изменений строк (поля amnd_*)
// ═══════════════════════════════════════════════════════════
// В таблицах с историей у строки есть: amnd_state — A (действующая), I (прежняя версия), C (удалённая запись);
// amnd_date — когда записана версия; amnd_prev — id строки с предыдущей версией; updated_by — кто записал (users.id).
// Действующая строка сохраняет свой id (на неё ссылаются другие таблицы). Перед изменением её прежнее содержимое
// копируется новой строкой с amnd_state = 'I', а сама строка получает новые значения и ссылку на копию.
// Все изменения таких таблиц идут только через функции этого файла и только внутри транзакции.
// Чтение: действующие строки — WHERE amnd_state = 'A'.

// Таблицы с историей изменений (имя таблицы подставляется в запрос — только из этого списка)
const AMND_TABLES = ['user_roles', 'documents'];

function amndTable(string $table): string {
    if (!in_array($table, AMND_TABLES, true)) throw new InvalidArgumentException('Таблица без истории изменений: ' . $table);
    return $table;
}

// Обычные поля таблицы: без id и без вычисляемых
function amndColumns(PDO $db, string $table): array {
    static $cache = [];
    if (!isset($cache[$table])) {
        $cols = [];
        foreach ($db->query('SHOW COLUMNS FROM ' . amndTable($table))->fetchAll() as $c) {
            if ($c['Field'] === 'id' || stripos((string)$c['Extra'], 'GENERATED') !== false) continue;
            $cols[] = $c['Field'];
        }
        $cache[$table] = $cols;
    }
    return $cache[$table];
}

// Новая действующая строка: id
function amndInsert(PDO $db, string $table, array $values, ?int $userId): int {
    $values['amnd_state'] = 'A';
    $values['updated_by'] = $userId;
    $cols = array_keys($values);
    $db->prepare('INSERT INTO ' . amndTable($table) . ' (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
       ->execute(array_values($values));
    return (int)$db->lastInsertId();
}

// Изменить действующую строку: прежняя версия уходит в копию (amnd_state = 'I'), строка получает $changes.
// Строки нет или она не действующая — false
function amndUpdate(PDO $db, string $table, int $id, array $changes, ?int $userId): bool {
    $t = amndTable($table);
    $st = $db->prepare('SELECT id FROM ' . $t . " WHERE id = ? AND amnd_state = 'A' FOR UPDATE");
    $st->execute([$id]);
    if (!$st->fetchColumn()) return false;

    // копия прежней версии: те же значения, включая её amnd_date, amnd_prev и updated_by
    $cols = amndColumns($db, $table);
    $select = array_map(fn($c) => $c === 'amnd_state' ? "'I'" : $c, $cols);
    $db->prepare('INSERT INTO ' . $t . ' (' . implode(', ', $cols) . ') SELECT ' . implode(', ', $select) . ' FROM ' . $t . ' WHERE id = ?')
       ->execute([$id]);
    $copyId = (int)$db->lastInsertId();

    $changes['amnd_prev']  = $copyId;
    $changes['updated_by'] = $userId;
    $set = implode(', ', array_map(fn($c) => $c . ' = ?', array_keys($changes)));
    $db->prepare('UPDATE ' . $t . ' SET ' . $set . ', amnd_date = NOW() WHERE id = ?')
       ->execute(array_merge(array_values($changes), [$id]));
    return true;
}

// Удалить запись: строка остаётся с amnd_state = 'C', её прежняя версия — в копии
function amndClose(PDO $db, string $table, int $id, ?int $userId): bool {
    return amndUpdate($db, $table, $id, ['amnd_state' => 'C'], $userId);
}
