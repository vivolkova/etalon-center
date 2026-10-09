// Админка → Сотрудники (пункт шапки): люди с ролями (api/staff.php) и окно сотрудника.
// Кем и где человек работает — его роли: у администратора системы роль без филиала, остальные роли (администратор
// студии, тренер, байкфиттер, механик) выдаются в конкретном филиале.
// Администратор системы видит всех и меняет (право staff). Администратор студии видит только специалистов своих
// филиалов (их присылает сервер) и ничего не меняет: окно открывается для чтения.

let STAFF_FORMER = [];  // бывшие сотрудники (ролей нет, но были): те же поля и left_at — когда сняли последнюю роль
let STAFF = [];         // сотрудники: {id, first_name, last_name, name, phone, has_account, phone_verified, specialist_id, experience, roles: [{code, location_id}]}
let STAFF_ROLES = [];   // роли из справочника по порядку: [{code, name}]

async function loadStaff() {
  const res = await apiRequest('/staff.php?action=list');
  STAFF = res.staff || [];
  STAFF_ROLES = res.role_options || [];
  STAFF_FORMER = staffFormer() ? (await apiRequest('/staff.php?action=list&former=1')).staff || [] : [];
}
// Отмечена галочка «Бывшие сотрудники» (её видит только администратор системы): список показывает уволенных
function staffFormer() {
  return canDo('staff') && document.getElementById('staff-former').checked;
}
async function staffFormerChanged() {
  try { await loadStaff(); } catch (e) { return; }
  renderStaff();
}

function staffRoleName(code) {
  const r = STAFF_ROLES.find(function (x) { return x.code === code; });
  return r ? r.name : code;
}
function staffLocName(id) {
  const l = admLocs(true).find(function (x) { return Number(x.id) === Number(id); }) || LOCATIONS_ALL.find(function (x) { return Number(x.id) === Number(id); });
  return l ? l.name : '#' + id;
}
// Столбец «Где и кем работает»: по филиалам — «филиал: его роли», через « · » (решение владельца 09.10.2026: из списка
// должно быть видно, какая роль в каком филиале). Роль без филиала (главный управляющий) — «Все филиалы: …» первой
function staffWorkText(s) {
  const groups = [];   // [{loc: id филиала или null, roles: [названия]}] — филиалы в порядке ролей справочника
  STAFF_ROLES.forEach(function (r) {
    s.roles.filter(function (x) { return x.code === r.code; }).forEach(function (x) {
      let g = groups.find(function (y) { return y.loc === x.location_id; });
      if (!g) groups.push(g = { loc: x.location_id, roles: [] });
      g.roles.push(r.name);
    });
  });
  groups.sort(function (a, b) { return (a.loc === null ? -1 : a.loc) - (b.loc === null ? -1 : b.loc); });
  return groups.map(function (g) { return (g.loc === null ? 'Все филиалы' : staffLocName(g.loc)) + ': ' + g.roles.join(', '); }).join(' · ');
}

// Раздел открыт (из меню или после смены филиала в шапке): фильтр по филиалу встаёт на филиал из шапки
function staffOpen() {
  fillLocSelect('staff-loc', { empty: 'Все филиалы', value: admBranchId || '' });
  renderStaff();
}

// Список: поиск по имени и телефону, выбор роли и филиала (выбран филиал — те, кто в нём работает, и администраторы
// системы; «Все филиалы» — все)
function renderStaff() {
  document.getElementById('staff-add').style.display = canDo('staff') ? '' : 'none';
  document.getElementById('staff-former-box').style.display = canDo('staff') ? '' : 'none';
  const former = staffFormer();
  document.getElementById('staff-col-work').textContent = former ? 'Уволен' : 'Где и кем работает';
  const roleSel = document.getElementById('staff-role');
  roleSel.style.display = former ? 'none' : '';
  const locSel = document.getElementById('staff-loc');
  locSel.style.display = former ? 'none' : '';
  fillLocSelect(locSel, { empty: 'Все филиалы' });   // список филиалов мог измениться — выбор остаётся прежним
  const role = roleSel.value;
  roleSel.innerHTML = '<option value="">Все роли</option>' + STAFF_ROLES
    .filter(function (r) { return STAFF.some(function (s) { return s.roles.some(function (x) { return x.code === r.code; }); }); })
    .map(function (r) { return '<option value="' + escAttr(r.code) + '">' + escAttr(r.name) + '</option>'; }).join('');
  roleSel.value = role;
  if (roleSel.selectedIndex < 0) roleSel.selectedIndex = 0;

  const q = document.getElementById('staff-search').value.trim();
  const lq = q.toLowerCase();
  const locId = Number(locSel.value) || 0;
  // у бывших ролей нет — ни роль, ни филиал из шапки их не отбирают
  const rows = (former ? STAFF_FORMER : STAFF).filter(function (s) {
    if (!former && roleSel.value && !s.roles.some(function (x) { return x.code === roleSel.value; })) return false;
    if (!former && locId && !s.roles.some(function (x) { return x.location_id === null || x.location_id === locId; })) return false;
    return !q || s.name.toLowerCase().includes(lq) || phoneMatches(s.phone, q);
  });

  const tbody = document.getElementById('staff-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="empty-state" colspan="3">' + (former ? 'Бывших сотрудников нет' : 'Сотрудников не найдено') + '</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function (s) {
    const marks = [];
    if (!s.has_account) marks.push('нет кабинета');
    if (!s.phone_verified) marks.push('номер не подтверждён');
    return '<tr class="u-pointer" onclick="openStaffModal(' + s.id + (former ? ", 'history'" : '') + ')">' +
      '<td><strong>' + escAttr(s.name) + '</strong>' + (marks.length ? '<br><span class="u-muted u-text-caption">' + marks.join(' · ') + '</span>' : '') + '</td>' +
      '<td class="u-nowrap">' + escAttr(s.phone || '—') + '</td>' +
      '<td>' + (former ? docDate(s.left_at) : escAttr(staffWorkText(s))) + '</td>' +
      '</tr>';
  }).join('');
}

// ═══ ОКНО СОТРУДНИКА ═════════════════════════════════════════════════
// Вкладки: «Инфо» — имя, фамилия, телефон, опыт (у специалиста); «Роли» — галочка «Администратор системы» и строки
// «филиал → роли». «Сохранить» общее: данные и набор ролей сохраняются одним запросом.
// «График работы», «Отсутствия», «Особые часы работы» — у сохранённого специалиста (роль тренера, байкфиттера,
// механика); их заполняет trmOpen (js/admin/specialists.js), изменения там сохраняются сразу.
// «Личный кабинет» (общий блок с окном клиента, accountBlockFill в js/admin/admin.js) и «История» (периоды работы) —
// у сохранённого человека и только у администратора системы.
// Бывший сотрудник открывается в том же окне: на вкладке «Роли» ему можно снова выдать роль — вернуть на работу.

let stRows = [];        // строки вкладки «Роли»: [{location_id, roles: [коды]}]
let stReadOnly = false; // окно открыто для чтения (администратор студии)

// Роли, которые выдаются в филиале (все, кроме администратора системы)
function stBranchRoles() {
  return STAFF_ROLES.filter(function (r) { return r.code !== 'system_admin'; });
}

// tab — вкладка, на которой открыть окно (по умолчанию «Инфо»)
let stOpenId = null;   // чьё окно открыто: ответ на запрос по другому человеку не показываем
function openStaffModal(id, tab) {
  const s = id ? STAFF.concat(STAFF_FORMER).find(function (x) { return x.id === id; }) : null;
  if (id && !s) return;
  const modal = document.getElementById('staff-modal');
  stReadOnly = !canDo('staff');
  const isFormer = !!s && !s.roles.length;
  document.getElementById('staff-modal-title').textContent = s ? (isFormer ? 'Бывший сотрудник: ' : 'Сотрудник: ') + s.name : 'Добавить сотрудника';
  stOpenId = s ? s.id : null;
  document.getElementById('st-id').value = s ? s.id : '';
  document.getElementById('st-first-name').value = s ? s.first_name : '';
  document.getElementById('st-last-name').value = s ? s.last_name : '';
  document.getElementById('st-phone').value = s ? maskPhone(s.phone || '') : '';
  document.getElementById('st-phone-hint').textContent = '';
  document.getElementById('st-exp').value = s && s.experience !== null ? s.experience : '';
  document.getElementById('st-sys').checked = !!s && s.roles.some(function (x) { return x.code === 'system_admin'; });

  // строки «филиал → роли» из ролей человека; у нового сотрудника — строка текущего филиала панели
  stRows = [];
  (s ? s.roles : []).forEach(function (x) {
    if (x.location_id === null) return;
    let row = stRows.find(function (r) { return r.location_id === x.location_id; });
    if (!row) stRows.push(row = { location_id: x.location_id, roles: [] });
    row.roles.push(x.code);
  });
  if (!s && admBranchId) stRows.push({ location_id: admBranchId, roles: [] });
  stSysStrip();
  stRolesRender();

  ['st-first-name', 'st-last-name', 'st-phone', 'st-exp', 'st-sys'].forEach(function (el) { document.getElementById(el).disabled = stReadOnly; });
  // администратору студии роль администратора системы не показываем вовсе — этих людей он не видит
  document.getElementById('st-sys-box').style.display = stReadOnly ? 'none' : '';
  modal.querySelectorAll('[data-st-save]').forEach(function (b) { b.style.display = stReadOnly ? 'none' : ''; });
  modal.querySelectorAll('[data-st-cancel]').forEach(function (b) { b.textContent = stReadOnly ? 'Закрыть' : 'Отмена'; });

  // Вкладки графика — только у сохранённого специалиста; часы задаются в филиалах его ролей специалиста
  const specLocs = [];
  (s ? s.roles : []).forEach(function (x) {
    if (SPEC_ROLES.indexOf(x.code) >= 0 && specLocs.indexOf(x.location_id) < 0) specLocs.push(x.location_id);
  });
  const hasHours = !!(s && s.specialist_id && specLocs.length);
  modal.querySelectorAll('[data-st-tab="hours"], [data-st-tab="off"], [data-st-tab="custom"]').forEach(function (b) {
    b.style.display = hasHours ? '' : 'none';
  });
  ['st-hours-body', 'st-off-body', 'st-custom-body'].forEach(function (el) { document.getElementById(el).innerHTML = ''; });
  modal.onclick = null;
  if (hasHours) trmOpen(s.specialist_id, specLocs);

  // «Личный кабинет» и «История» — у сохранённого человека, только администратору системы.
  // У сотрудника с ролью администратора системы вкладки «Личный кабинет» нет (решение владельца 09.10.2026)
  const hasAdminTabs = !!s && canDo('staff');
  const hasAccountTab = hasAdminTabs && !s.roles.some(function (x) { return x.code === 'system_admin'; });
  modal.querySelector('[data-st-tab="history"]').style.display = hasAdminTabs ? '' : 'none';
  modal.querySelector('[data-st-tab="account"]').style.display = hasAccountTab ? '' : 'none';
  document.getElementById('st-account').innerHTML = '';
  document.getElementById('st-history').innerHTML = '';
  if (hasAccountTab) stAccountLoad(s.id);
  if (hasAdminTabs) stHistoryLoad(s.id);

  // открыть на запрошенной вкладке, если она у этого человека есть
  const tabBtn = tab ? modal.querySelector('[data-st-tab="' + tab + '"]') : null;
  stSwitchTab(tabBtn && tabBtn.style.display !== 'none' ? tab : 'main');
  modal.classList.add('show');
  // Окно не меняет размер при переключении вкладок: высота всех вкладок — по «Инфо» с полем опыта; длинные списки
  // прокручиваются внутри вкладки. У сохранённого человека окно шире и выше: графику работы и истории нужно место
  const big = !!s;
  const box = modal.querySelector('.admin-modal');
  box.classList.toggle('u-max-w-560', !big);
  box.classList.toggle('u-max-w-760', big);
  const main = modal.querySelector('[data-st-pane="main"]');
  const curTab = modal.querySelector('[data-st-tab].active').getAttribute('data-st-tab');
  stSwitchTab('main');
  document.getElementById('st-exp-box').style.display = '';
  modal.querySelectorAll('.tab-pane').forEach(function (p) { p.style.height = ''; });
  const h = Math.max(main.offsetHeight, big ? 460 : 0);
  modal.querySelectorAll('.tab-pane').forEach(function (p) { p.style.height = h + 'px'; });
  stSwitchTab(curTab);
}
function closeStaffModal() { document.getElementById('staff-modal').classList.remove('show'); }

// Вкладка «Личный кабинет»: свежие сведения с сервера при открытии окна и после каждого действия
async function stAccountLoad(id) {
  let c;
  try { c = await ClientsAPI.get(id); } catch (e) { return; }
  if (stOpenId !== id) return;
  accountCtx = { who: ACCOUNT_STAFF, phone: c.phone, changed: stAccountChanged };
  accountBlockFill('st-account', c, id);
}
// После действия с кабинетом: блок в окне и пометки в списке — заново
async function stAccountChanged(id) {
  stAccountLoad(id);
  try { await loadStaff(); } catch (e) { return; }
  renderStaff();
}

// Вкладка «История»: периоды работы человека — когда и кем выдана роль, когда и кем снята; новые сверху
async function stHistoryLoad(id) {
  let rows;
  try { rows = await apiRequest('/staff.php?action=history&id=' + id); } catch (e) { return; }
  if (stOpenId !== id) return;
  const box = document.getElementById('st-history');
  if (!rows.length) { box.innerHTML = '<div class="u-text-ui u-muted">Ролей не было</div>'; return; }
  box.innerHTML = '<div class="admin-table"><table><thead><tr>' +
    '<th>Роль</th><th>Филиал</th><th>С</th><th>По</th><th>Кто выдал / снял</th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr' + (r.date_to ? ' class="u-muted"' : '') + '>' +
        '<td>' + escAttr(r.name) + '</td>' +
        '<td>' + (r.location_id !== null ? escAttr(staffLocName(r.location_id)) : 'все филиалы') + '</td>' +
        '<td class="u-nowrap">' + docDate(r.date_from) + '</td>' +
        '<td class="u-nowrap">' + (r.date_to ? docDate(r.date_to) : 'действует') + '</td>' +
        '<td>' + escAttr(r.granted_by || '—') + (r.date_to ? ' / ' + escAttr(r.revoked_by || '—') : '') + '</td>' +
        '</tr>';
    }).join('') + '</tbody></table></div>';
}

function stSwitchTab(tab) {
  if (document.getElementById('st-roles')) stRolesRead();
  document.querySelectorAll('#staff-modal [data-st-tab]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-st-tab') === tab);
  });
  document.querySelectorAll('#staff-modal [data-st-pane]').forEach(function (p) {
    p.style.display = p.getAttribute('data-st-pane') === tab ? '' : 'none';
  });
  stExpToggle();
}

// «Опыт (лет)» — только у специалиста: когда выбрана роль тренера, байкфиттера или механика
function stIsSpecialist() {
  return stRows.some(function (r) { return r.roles.some(function (c) { return SPEC_ROLES.indexOf(c) >= 0; }); });
}
function stExpToggle() {
  document.getElementById('st-exp-box').style.display = stIsSpecialist() ? '' : 'none';
}

// Вкладка «Роли»: строка на каждый филиал, где человек работает; роли в строке — список с галочками.
// Для чтения (администратор студии) — те же строки текстом.
// Отмечен «Администратор системы» — роли «Администратор студии» в списках нет: он и так администратор во всех
// филиалах; тренером, байкфиттером, механиком в филиале он быть может
function stRolesRender() {
  const box = document.getElementById('st-roles');
  const opts = stBranchRoles().filter(function (r) { return !(stSys() && r.code === 'studio_admin'); }).map(function (r) { return { value: r.code, label: r.name }; });
  const rows = stRows.map(function (row, i) {
    const roles = stReadOnly
      ? '<div class="form-input form-view">' + escAttr(row.roles.map(staffRoleName).join(', ') || '—') + '</div>'
      : msHtml('st-row-' + i, opts, row.roles, '— Выберите роли —', false, !stSys());   // у администратора системы роли в филиале необязательны
    return '<div class="u-flex u-gap-8 u-items-center u-mb-8">' +
      '<div class="u-flex-1 u-min-w-0 u-text-ui u-strong">' + escAttr(staffLocName(row.location_id)) + '</div>' +
      '<div class="u-flex-1 u-min-w-0">' + roles + '</div>' +
      (stReadOnly ? '' : '<button type="button" class="action-btn cancel btn-sm u-shrink-0" title="Убрать из филиала" onclick="stRowDel(' + i + ')">✕</button>') +
      '</div>';
  }).join('');
  const free = admLocs().filter(function (l) { return !stRows.some(function (r) { return r.location_id === Number(l.id); }); });
  const add = stReadOnly || !free.length ? '' :
    '<select class="form-input u-w-220 u-mt-10" id="st-add-loc" onchange="stRowAdd(this.value)">' +
    '<option value="">+ Добавить филиал</option>' +
    free.map(function (l) { return '<option value="' + l.id + '">' + escAttr(l.name) + '</option>'; }).join('') + '</select>';
  box.innerHTML = (stRows.length
    ? '<div class="u-flex u-gap-8 u-mb-8 u-text-caption u-muted"><div class="u-flex-1 u-min-w-0">Филиал</div><div class="u-flex-1 u-min-w-0">Роли</div></div>'
    : '<div class="set-hint u-mb-10">' + (stReadOnly ? 'Ролей в филиалах нет' : 'Добавьте филиал, в котором работает сотрудник, и выберите его роли в этом филиале') + '</div>') +
    rows + add;
}
function stSys() { return document.getElementById('st-sys').checked; }
// Галочка «Администратор системы»: роль «Администратор студии» ему не нужна — снять её; филиал, где других ролей
// не было, убрать
function stSysChanged() {
  stRolesRead();
  stSysStrip();
  stRolesRender();
  stExpToggle();
}
function stSysStrip() {
  if (!stSys()) return;
  stRows = stRows.filter(function (r) {
    const had = r.roles.indexOf('studio_admin') >= 0;
    r.roles = r.roles.filter(function (c) { return c !== 'studio_admin'; });
    return r.roles.length || !had;
  });
}
// Запомнить отмеченное в списках ролей (перед перерисовкой, сменой вкладки и сохранением)
function stRolesRead() {
  if (stReadOnly) return;
  stRows.forEach(function (row, i) {
    if (document.getElementById('st-row-' + i)) row.roles = msValues('st-row-' + i);
  });
}
function stRowAdd(locId) {
  if (!locId) return;
  stRolesRead();
  stRows.push({ location_id: Number(locId), roles: [] });
  stRolesRender();
}
function stRowDel(i) {
  stRolesRead();
  stRows.splice(i, 1);
  stRolesRender();
}

// Новый сотрудник: по телефону ищем человека в базе — клиент с этим номером станет сотрудником, второй записи не будет
async function stFindPerson() {
  const hint = document.getElementById('st-phone-hint');
  hint.textContent = '';
  if (Number(document.getElementById('st-id').value)) return;
  const input = document.getElementById('st-phone');
  if (!input.checkValidity() || !input.value.trim()) return;
  const phone = input.value;
  let p = null;
  try { p = await apiRequest('/staff.php?action=person', 'POST', { phone: phone }, true); } catch (e) { return; }
  if (input.value !== phone || !p) return;   // номер успели изменить или такого человека нет
  if (p.is_staff) { hint.textContent = p.name + ' уже сотрудник — откройте его в списке'; return; }
  document.getElementById('st-first-name').value = p.first_name;
  document.getElementById('st-last-name').value = p.last_name;
  hint.textContent = 'Этот номер уже есть в базе: ' + p.name + '. Роли получит этот человек';
}

async function saveStaff() {
  const id = Number(document.getElementById('st-id').value) || 0;
  const first = document.getElementById('st-first-name').value.trim();
  const last = document.getElementById('st-last-name').value.trim();
  const phoneEl = document.getElementById('st-phone');
  if (!first || !last || !phoneEl.value.trim() || !phoneEl.checkValidity()) {
    stSwitchTab('main');
    showToast('Укажите имя, фамилию и телефон полностью', 'error');
    return;
  }
  stRolesRead();
  const sys = stSys();
  stSysStrip();
  // у администратора системы роли в филиалах необязательны: филиал без ролей просто не сохраняется
  const rows = sys ? stRows.filter(function (r) { return r.roles.length; }) : stRows;
  const empty = rows.find(function (r) { return !r.roles.length; });
  if (empty) {
    stSwitchTab('roles');
    showToast('Выберите роли в филиале «' + staffLocName(empty.location_id) + '» или уберите его', 'error');
    return;
  }
  if (!sys && !rows.length) {
    if (!id) {
      stSwitchTab('roles');
      showToast('Выберите хотя бы одну роль', 'error');
      return;
    }
    if (!await uiConfirm('Уволить сотрудника?', first + ' ' + last + ' останется без ролей: пропадёт из списка сотрудников и станет обычным клиентом. График работы специалиста закроется сегодняшним днём.')) return;
  }
  try {
    await apiRequest('/staff.php?action=save', 'POST', {
      id: id, first_name: first, last_name: last, phone: phoneEl.value,
      experience: Number(document.getElementById('st-exp').value) || 0,
      system_admin: sys ? 1 : 0,
      branches: rows.map(function (r) { return { location_id: r.location_id, roles: r.roles }; }),
    });
    showToast(id ? 'Сотрудник сохранён' : 'Сотрудник добавлен', 'success');
    closeStaffModal();
    // специалисты — те же люди: обновить и их списки (расписание, формы занятий)
    await Promise.allSettled([loadStaff(), loadSpecialists()]);
    renderStaff();
  } catch (e) {
    // Отказ сервера (занятый телефон, будущие занятия специалиста) или нет связи — сообщение уже показано (apiRequest)
  }
}
