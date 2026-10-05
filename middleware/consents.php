<?php
// ═══════════════════════════════════════════════════════════
// middleware/consents.php — Согласия клиентов с документами студии
// ═══════════════════════════════════════════════════════════
// Согласие даётся на конкретную редакцию документа (user_consents.document_version_id) и не удаляется:
// отзыв — revoked_at. Обязательный документ (documents.acceptance = required) считается принятым, если есть
// действующее согласие на его последнюю редакцию; вышла новая редакция — её нужно принять заново.
// Добровольное согласие (optional — фото и видео) действует для редакции, на которую дано; его можно отозвать.

// Три галочки на сайте -> какие документы принимаются
const CONSENT_OFFER = ['offer', 'rules'];     // «ознакомлен(а) и согласен(а) с офертой и правилами студии»
const CONSENT_PD    = ['pd_consent'];         // «согласие на обработку персональных данных»
const CONSENT_PHOTO = ['photo_consent'];      // «согласие на фото и видео» — добровольное

// Действующие редакции документов: [code => ['version_id', 'version', 'name', 'acceptance', 'published_at']]
function currentDocs(PDO $db): array {
    $rows = $db->query("SELECT d.code, d.name, d.acceptance, v.id AS version_id, v.version, v.published_at
                        FROM documents d
                        JOIN document_versions v ON v.document_id = d.id
                         AND v.version = (SELECT MAX(x.version) FROM document_versions x WHERE x.document_id = d.id)
                        WHERE d.amnd_state = 'A' ORDER BY d.id")->fetchAll();
    $map = [];
    foreach ($rows as $r) {
        $map[$r['code']] = [
            'version_id' => (int)$r['version_id'], 'version' => (int)$r['version'], 'name' => $r['name'],
            'acceptance' => $r['acceptance'], 'published_at' => $r['published_at'],
        ];
    }
    return $map;
}

// Принять действующие редакции документов $codes. $source: site — галочка на сайте, admin — отмечено бумажное
// согласие ($recordedBy — кто отметил). Повторное согласие после отзыва — та же строка: новая дата, отзыв снят
function consentAccept(PDO $db, int $userId, array $codes, string $source = 'site', ?int $recordedBy = null): void {
    $docs = currentDocs($db);
    $st = $db->prepare('INSERT INTO user_consents (user_id, document_version_id, source, recorded_by, ip)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE accepted_at = IF(revoked_at IS NULL, accepted_at, NOW()),
                                                source = IF(revoked_at IS NULL, source, VALUES(source)),
                                                recorded_by = IF(revoked_at IS NULL, recorded_by, VALUES(recorded_by)),
                                                revoked_at = NULL');
    foreach ($codes as $code) {
        if (!isset($docs[$code]) || $docs[$code]['acceptance'] === 'none') err('Этот документ не принимается: ' . $code);
        $st->execute([$userId, $docs[$code]['version_id'], $source, $recordedBy, clientIp()]);
        logAction($db, ['id' => $recordedBy ?? $userId], 'consent.accepted', 'users', $userId,
            ['code' => $code, 'version' => $docs[$code]['version'], 'source' => $source]);
    }
}

// Отозвать добровольное согласие (на любую редакцию документа)
function consentRevoke(PDO $db, int $userId, string $code): void {
    $docs = currentDocs($db);
    if (!isset($docs[$code]) || $docs[$code]['acceptance'] !== 'optional') err('Это согласие отозвать нельзя');
    $st = $db->prepare("UPDATE user_consents c
                        JOIN document_versions v ON v.id = c.document_version_id
                        JOIN documents d ON d.id = v.document_id AND d.code = ?
                        SET c.revoked_at = NOW()
                        WHERE c.user_id = ? AND c.revoked_at IS NULL");
    $st->execute([$code, $userId]);
    if ($st->rowCount()) logAction($db, ['id' => $userId], 'consent.revoked', 'users', $userId, ['code' => $code]);
}

// Согласия человека по документам: [['code', 'name', 'acceptance', 'version' — действующая редакция,
// 'accepted_version', 'accepted_at' — на какую редакцию и когда дано действующее согласие (null — нет), 'source']]
function userConsents(PDO $db, int $userId): array {
    $st = $db->prepare("SELECT d.code, v.version, c.accepted_at, c.source
                        FROM user_consents c
                        JOIN document_versions v ON v.id = c.document_version_id
                        JOIN documents d ON d.id = v.document_id
                        WHERE c.user_id = ? AND c.revoked_at IS NULL
                        ORDER BY v.version");
    $st->execute([$userId]);
    $given = [];
    foreach ($st->fetchAll() as $r) $given[$r['code']] = $r;   // остаётся согласие на самую новую редакцию
    $out = [];
    foreach (currentDocs($db) as $code => $doc) {
        if ($doc['acceptance'] === 'none') continue;
        $g = $given[$code] ?? null;
        $out[] = [
            'code' => $code, 'name' => $doc['name'], 'acceptance' => $doc['acceptance'], 'version' => $doc['version'],
            'accepted_version' => $g ? (int)$g['version'] : null, 'accepted_at' => $g['accepted_at'] ?? null, 'source' => $g['source'] ?? null,
        ];
    }
    return $out;
}

// Обязательные документы, действующую редакцию которых человек ещё не принял: [['code', 'name', 'version', 'published_at']]
function pendingDocs(PDO $db, int $userId): array {
    $out = [];
    foreach (userConsents($db, $userId) as $c) {
        if ($c['acceptance'] === 'required' && $c['accepted_version'] !== $c['version']) {
            $out[] = ['code' => $c['code'], 'name' => $c['name'], 'version' => $c['version']];
        }
    }
    return $out;
}

// Клиент записывается сам: пока не приняты действующие редакции обязательных документов, новые записи не создаются.
// Администратора (он записывает клиента по звонку) это не касается
function consentsGuard(PDO $db, array $user): void {
    if (($user['role'] ?? '') === 'admin') return;
    if (pendingDocs($db, (int)$user['id'])) err('Мы обновили документы — примите их, чтобы записаться', 409);
}
