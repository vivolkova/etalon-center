<?php
// api/documents.php — Документы студии: оферта, правила, политика, тексты согласий
// У документа есть редакции (document_versions). Действующая — с наибольшим номером. Опубликованная редакция
// не меняется и не удаляется: любая правка — новая редакция. Поэтому здесь нет вызовов изменения и удаления.
require_once __DIR__ . '/../middleware/helpers.php';
setCORS();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

// Документ по коду (действующая строка) или ошибка 404
function docByCode(PDO $db, string $code): array {
    $st = $db->prepare("SELECT id, code, name, acceptance FROM documents WHERE code = ? AND amnd_state = 'A'");
    $st->execute([$code]);
    $doc = $st->fetch();
    if (!$doc) err('Документ не найден', 404);
    return $doc;
}

// GET ?action=list — документы с номером и датой действующей редакции (публичный)
if ($method === 'GET' && $action === 'list') {
    ok(getDB()->query("SELECT d.code, d.name, d.acceptance, v.version, v.published_at
                       FROM documents d
                       JOIN document_versions v ON v.document_id = d.id
                        AND v.version = (SELECT MAX(x.version) FROM document_versions x WHERE x.document_id = d.id)
                       WHERE d.amnd_state = 'A' ORDER BY d.id")->fetchAll());
}

// GET ?action=get&code=offer — текст действующей редакции (публичный)
if ($method === 'GET' && $action === 'get') {
    $db  = getDB();
    $doc = docByCode($db, (string)($_GET['code'] ?? ''));
    $st  = $db->prepare('SELECT version, body, published_at FROM document_versions WHERE document_id = ? ORDER BY version DESC LIMIT 1');
    $st->execute([(int)$doc['id']]);
    $v = $st->fetch();
    if (!$v) err('У документа нет опубликованной редакции', 404);
    ok(['code' => $doc['code'], 'name' => $doc['name'], 'acceptance' => $doc['acceptance']] + $v);
}

// GET ?action=versions&code=offer — все редакции документа с текстами, новые сверху (любой администратор)
if ($method === 'GET' && $action === 'versions') {
    authAdmin();
    $db  = getDB();
    $doc = docByCode($db, (string)($_GET['code'] ?? ''));
    $st  = $db->prepare('SELECT v.version, v.body, v.published_at, u.name AS published_by
                         FROM document_versions v LEFT JOIN users u ON u.id = v.published_by
                         WHERE v.document_id = ? ORDER BY v.version DESC');
    $st->execute([(int)$doc['id']]);
    ok(['code' => $doc['code'], 'name' => $doc['name'], 'acceptance' => $doc['acceptance'], 'versions' => $st->fetchAll()]);
}

// POST ?action=publish — новая редакция: {code, body} (администратор системы)
if ($method === 'POST' && $action === 'publish') {
    $user = authCan('system');
    $d    = input();
    $db   = getDB();
    $doc  = docByCode($db, (string)($d['code'] ?? ''));
    $body = trim(str_replace("\r\n", "\n", (string)($d['body'] ?? '')));
    if ($body === '') err('Введите текст документа');

    $db->beginTransaction();
    // строка документа блокируется, чтобы две публикации не получили один номер редакции
    $db->prepare('SELECT id FROM documents WHERE id = ? FOR UPDATE')->execute([(int)$doc['id']]);
    $st = $db->prepare('SELECT version, body FROM document_versions WHERE document_id = ? ORDER BY version DESC LIMIT 1');
    $st->execute([(int)$doc['id']]);
    $last = $st->fetch();
    if ($last && $last['body'] === $body) err('Текст не изменился — новая редакция не нужна');
    $version = $last ? (int)$last['version'] + 1 : 1;
    $db->prepare('INSERT INTO document_versions (document_id, version, body, published_by) VALUES (?, ?, ?, ?)')
       ->execute([(int)$doc['id'], $version, $body, $user['id']]);
    logAction($db, $user, 'document.published', 'document_versions', (int)$db->lastInsertId(), ['code' => $doc['code'], 'version' => $version]);
    $db->commit();
    ok(['version' => $version], 'Опубликована редакция ' . $version);
}

// GET ?action=my — мои согласия по документам (вошедший)
if ($method === 'GET' && $action === 'my') {
    $user = authUser();
    ok(userConsents(getDB(), $user['id']));
}

// POST ?action=accept — принять действующие редакции: {codes: ['offer', 'rules', …]} (вошедший, за себя)
if ($method === 'POST' && $action === 'accept') {
    $user  = authUser();
    $codes = array_values(array_unique(array_map('strval', (array)(input()['codes'] ?? []))));
    if (!$codes) err('Не указаны документы');
    $db = getDB();
    $db->beginTransaction();
    consentAccept($db, $user['id'], $codes);
    $db->commit();
    ok(['pending_docs' => pendingDocs($db, $user['id']), 'consents' => userConsents($db, $user['id'])], 'Согласие принято');
}

// POST ?action=revoke — отозвать добровольное согласие: {code} (вошедший, за себя)
if ($method === 'POST' && $action === 'revoke') {
    $user = authUser();
    $db   = getDB();
    consentRevoke($db, $user['id'], (string)(input()['code'] ?? ''));
    ok(['consents' => userConsents($db, $user['id'])], 'Согласие отозвано');
}

err('Неизвестный endpoint', 404);
