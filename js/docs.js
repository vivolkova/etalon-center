// Документы студии: страница документа на сайте, ссылки в подвале, вкладка «Документы» в настройках.
// Текст документа — простой, без HTML: пустая строка делит абзацы, строка с «# » в начале — заголовок.

// Дата редакции: «03.10.2026» из «2026-10-03 12:00:00»
function docDate(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
}
const DOC_ACCEPTANCE = { required: 'обязательный', optional: 'добровольный', none: 'для ознакомления' };

// Текст документа в HTML. Первый заголовок, совпадающий с названием документа, пропускаем — название уже в шапке страницы
function docBodyHtml(body, name) {
  let first = true;
  return String(body || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(function (block) {
    block = block.trim();
    if (!block) return '';
    const isHead = block.indexOf('# ') === 0;
    const skip = first && isHead && block.slice(2).trim() === String(name || '').trim();
    first = false;
    if (skip) return '';
    if (isHead) return '<h3 class="u-text-lead u-bold u-mt-20 u-mb-8">' + escAttr(block.slice(2).trim()) + '</h3>';
    return '<p class="u-text-body u-lh-relaxed u-mb-12">' + escAttr(block).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

// ── Страница документа на сайте: адрес #doc/<код> ──
async function openDoc(code) {
  showPage('doc');
  const title = document.getElementById('doc-title'), meta = document.getElementById('doc-meta'), text = document.getElementById('doc-text');
  title.textContent = ''; meta.textContent = ''; text.innerHTML = '';
  if (location.hash !== '#doc/' + code) history.replaceState(null, '', '#doc/' + code);
  let d;
  try { d = await DocumentsAPI.get(code); } catch (e) { text.innerHTML = '<div class="empty-state">Документ не найден</div>'; return; }
  title.textContent = d.name;
  meta.textContent = 'Редакция ' + d.version + ' от ' + docDate(d.published_at);
  text.innerHTML = docBodyHtml(d.body, d.name);
}
// Код документа из адреса страницы или null
function docFromHash() {
  const m = location.hash.match(/^#doc\/([a-z_]+)$/);
  return m ? m[1] : null;
}
window.addEventListener('hashchange', function () { const c = docFromHash(); if (c) openDoc(c); });

// ── Ссылки на документы в подвале сайта ──
const FOOTER_DOCS = ['offer', 'rules', 'privacy'];
async function renderFooterDocs() {
  const box = document.getElementById('footer-docs');
  if (!box) return;
  let list;
  try { list = (await DocumentsAPI.list()) || []; } catch (e) { return; }
  box.innerHTML = list.filter(function (d) { return FOOTER_DOCS.indexOf(d.code) >= 0; }).map(function (d) {
    return '<a class="footer-link" href="#doc/' + d.code + '">' + escAttr(d.name) + '</a>';
  }).join('');
}

// ── Настройки → «Документы»: список, текст и история редакций, публикация новой ──
async function renderDocsTab() {
  const box = document.getElementById('settings-docs');
  if (!box) return;
  let list;
  try { list = (await DocumentsAPI.list()) || []; } catch (e) { return; }
  box.innerHTML = '<div class="admin-table"><table><thead><tr><th>Документ</th><th>Вид</th><th>Редакция</th><th>Дата</th><th>Действия</th></tr></thead><tbody>' +
    list.map(function (d) {
      return '<tr><td class="u-strong">' + escAttr(d.name) + '</td>' +
        '<td>' + escAttr(DOC_ACCEPTANCE[d.acceptance] || d.acceptance) + '</td>' +
        '<td>' + d.version + '</td><td class="u-nowrap">' + docDate(d.published_at) + '</td>' +
        '<td><button class="action-btn confirm btn-sm" onclick="openDocModal(\'' + d.code + '\')">Открыть</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}

// Окно документа: редакции (выбор), текст выбранной; действующую можно править и опубликовать новой редакцией
let docModal = null;   // { code, name, acceptance, versions: [{version, body, published_at, published_by}] }
async function openDocModal(code) {
  try { docModal = await DocumentsAPI.versions(code); } catch (e) { return; }
  const cur = docModal.versions[0];
  const body =
    '<div class="form-field"><label class="form-label">Редакция</label>' +
    '<select class="form-input" id="doc-version" onchange="docShowVersion()">' +
    docModal.versions.map(function (v, i) {
      return '<option value="' + v.version + '">Редакция ' + v.version + ' от ' + docDate(v.published_at) +
        (v.published_by ? ' — ' + escAttr(v.published_by) : '') + (i === 0 ? ' (действующая)' : '') + '</option>';
    }).join('') + '</select></div>' +
    '<div class="form-field"><label class="form-label">Текст</label>' +
    '<textarea class="form-input form-textarea" id="doc-body" rows="16" required></textarea>' +
    '<div class="set-hint" id="doc-hint"></div></div>';
  const el = openFormModal('doc-modal', escAttr(docModal.name), body, publishDoc, null, 'u-max-w-760');
  el.querySelector('[data-act="save"]').textContent = 'Опубликовать новую редакцию';
  document.getElementById('doc-version').value = cur.version;
  docShowVersion();
}

// Показать выбранную редакцию: прежние — только для чтения; действующую может править администратор системы
function docShowVersion() {
  const ver = Number(document.getElementById('doc-version').value);
  const v = docModal.versions.find(function (x) { return Number(x.version) === ver; });
  const isCurrent = Number(docModal.versions[0].version) === ver;
  const canEdit = isCurrent && canDo('system');
  const ta = document.getElementById('doc-body');
  ta.value = v ? v.body : '';
  ta.readOnly = !canEdit;
  const save = document.querySelector('#doc-modal [data-act="save"]');
  save.disabled = !canEdit;
  save.title = canEdit ? '' : (isCurrent ? NEED_TITLE : 'Прежняя редакция — только для чтения');
  document.getElementById('doc-hint').textContent = canEdit
    ? 'Пустая строка разделяет абзацы, строка с «# » в начале — заголовок. Опубликованную редакцию изменить нельзя — правка публикуется новой редакцией'
    : (isCurrent ? '' : 'Прежняя редакция — только для чтения');
}

async function publishDoc() {
  const text = document.getElementById('doc-body').value.trim();
  if (!text) { showToast('Введите текст документа', 'error'); return false; }
  const note = docModal.acceptance === 'required' ? 'Клиенты увидят просьбу принять её при следующем входе.' : 'Прежняя редакция останется в истории.';
  if (!await uiConfirm('Опубликовать новую редакцию?', note)) return false;
  let res;
  try { res = await DocumentsAPI.publish(docModal.code, text); } catch (e) { return false; }
  showToast('Опубликована редакция ' + res.version, 'success');
  renderDocsTab();
  renderFooterDocs();
  return true;
}
