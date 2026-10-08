// Админка → Филиал → Сотрудники: люди с ролями (api/staff.php) и окно сотрудника.
// Кем и где человек работает — его роли: у администратора системы роль без филиала, остальные роли (администратор
// студии, тренер, байкфиттер, механик) выдаются в конкретном филиале.
// Администратор системы видит всех и меняет (право staff). Администратор студии видит только специалистов своих
// филиалов (их присылает сервер) и ничего не меняет: окно открывается для чтения.

let STAFF = [];         // сотрудники: {id, first_name, last_name, name, phone, has_account, phone_verified, specialist_id, experience, roles: [{code, location_id}]}
let STAFF_ROLES = [];   // роли из справочника по порядку: [{code, name}]

async function loadStaff() {
  const res = await apiRequest('/staff.php?action=list');
  STAFF = res.staff || [];
  STAFF_ROLES = res.role_options || [];
}

function staffRoleName(code) {
  const r = STAFF_ROLES.find(function (x) { return x.code === code; });
  return r ? r.name : code;
}
function staffLocName(id) {
  const l = admLocs(true).find(function (x) { return Number(x.id) === Number(id); }) || LOCATIONS_ALL.find(function (x) { return Number(x.id) === Number(id); });
  return l ? l.name : '#' + id;
}
// «Кем и где работает»: по строке на роль в порядке справочника, после двоеточия — филиалы роли (в названиях филиалов есть тире)
function staffRolesHtml(s) {
  return STAFF_ROLES.map(function (r) {
    const own = s.roles.filter(function (x) { return x.code === r.code; });
    if (!own.length) return '';
    const locs = own.filter(function (x) { return x.location_id !== null; }).map(function (x) { return staffLocName(x.location_id); });
    return '<div>' + escAttr(r.name) + (locs.length ? ': ' + escAttr(locs.join(', ')) : '') + '</div>';
  }).join('');
}

// Список: поиск по имени и телефону, выбор роли; филиал — из переключателя в шапке (выбран — те, кто в нём работает,
// и администраторы системы; «Все филиалы» — все)
function renderStaff() {
  document.getElementById('staff-add').style.display = canDo('staff') ? '' : 'none';
  const roleSel = document.getElementById('staff-role');
  const role = roleSel.value;
  roleSel.innerHTML = '<option value="">Все роли</option>' + STAFF_ROLES
    .filter(function (r) { return STAFF.some(function (s) { return s.roles.some(function (x) { return x.code === r.code; }); }); })
    .map(function (r) { return '<option value="' + escAttr(r.code) + '">' + escAttr(r.name) + '</option>'; }).join('');
  roleSel.value = role;
  if (roleSel.selectedIndex < 0) roleSel.selectedIndex = 0;

  const q = document.getElementById('staff-search').value.trim();
  const lq = q.toLowerCase();
  const loc = admCurLoc();
  const rows = STAFF.filter(function (s) {
    if (roleSel.value && !s.roles.some(function (x) { return x.code === roleSel.value; })) return false;
    if (loc && !s.roles.some(function (x) { return x.location_id === null || x.location_id === Number(loc.id); })) return false;
    return !q || s.name.toLowerCase().includes(lq) || phoneMatches(s.phone, q);
  });

  const tbody = document.getElementById('staff-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="empty-state" colspan="3">Сотрудников не найдено</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function (s) {
    const av = clientAvatarColor(s.name);
    const init = s.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    const marks = [];
    if (!s.has_account) marks.push('нет кабинета');
    if (!s.phone_verified) marks.push('номер не подтверждён');
    return '<tr class="u-pointer" onclick="openStaffModal(' + s.id + ')">' +
      '<td><div class="client-name-cell">' +
      '<div class="client-avatar" style="background:' + av + '20;color:' + av + '">' + escAttr(init) + '</div>' +
      '<div><div class="u-strong u-text-ui">' + escAttr(s.name) + '</div>' +
      '<div class="u-muted u-text-caption">' + marks.join(' · ') + '</div></div>' +
      '</div></td>' +
      '<td class="u-text-ui u-nowrap">' + escAttr(s.phone || '—') + '</td>' +
      '<td class="u-text-ui">' + staffRolesHtml(s) + '</td>' +
      '</tr>';
  }).join('');
}

// ═══ ОКНО СОТРУДНИКА ═════════════════════════════════════════════════
// Вкладки: «Инфо» — имя, фамилия, телефон, опыт (у специалиста); «Роли» — галочка «Администратор системы» и строки
// «филиал → роли». «Сохранить» общее: данные и набор ролей сохраняются одним запросом.

let stRows = [];        // строки вкладки «Роли»: [{location_id, roles: [коды]}]
let stReadOnly = false; // окно открыто для чтения (администратор студии)

// Роли, которые выдаются в филиале (все, кроме администратора системы)
function stBranchRoles() {
  return STAFF_ROLES.filter(function (r) { return r.code !== 'system_admin'; });
}

function openStaffModal(id) {
  const s = id ? STAFF.find(function (x) { return x.id === id; }) : null;
  if (id && !s) return;
  const modal = document.getElementById('staff-modal');
  stReadOnly = !canDo('staff');
  document.getElementById('staff-modal-title').textContent = s ? 'Сотрудник: ' + s.name : 'Добавить сотрудника';
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
  stRolesRender();

  ['st-first-name', 'st-last-name', 'st-phone', 'st-exp', 'st-sys'].forEach(function (el) { document.getElementById(el).disabled = stReadOnly; });
  // администратору студии роль администратора системы не показываем вовсе — этих людей он не видит
  document.getElementById('st-sys-box').style.display = stReadOnly ? 'none' : '';
  modal.querySelectorAll('[data-st-save]').forEach(function (b) { b.style.display = stReadOnly ? 'none' : ''; });
  modal.querySelectorAll('[data-st-cancel]').forEach(function (b) { b.textContent = stReadOnly ? 'Закрыть' : 'Отмена'; });

  stSwitchTab('main');
  modal.classList.add('show');
  // Окно не меняет размер при переключении вкладок: высота — по вкладке «Инфо» с полем опыта;
  // длинный список филиалов прокручивается внутри вкладки «Роли»
  const main = modal.querySelector('[data-st-pane="main"]');
  document.getElementById('st-exp-box').style.display = '';
  main.style.minHeight = '';
  const h = main.offsetHeight;
  main.style.minHeight = h + 'px';
  modal.querySelectorAll('.tab-pane').forEach(function (p) { p.style.height = h + 'px'; });
  stExpToggle();
}
function closeStaffModal() { document.getElementById('staff-modal').classList.remove('show'); }

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
  return !stSys() && stRows.some(function (r) { return r.roles.some(function (c) { return SPEC_ROLES.indexOf(c) >= 0; }); });
}
function stExpToggle() {
  document.getElementById('st-exp-box').style.display = stIsSpecialist() ? '' : 'none';
}

// Вкладка «Роли»: строка на каждый филиал, где человек работает; роли в строке — список с галочками.
// Для чтения (администратор студии) — те же строки текстом.
// Отмечен «Администратор системы» — он работает во всех филиалах: строк филиалов нет (и роли в филиалах снимаются)
function stRolesRender() {
  const box = document.getElementById('st-roles');
  if (stSys()) { box.innerHTML = ''; return; }
  const opts = stBranchRoles().map(function (r) { return { value: r.code, label: r.name }; });
  const rows = stRows.map(function (row, i) {
    const roles = stReadOnly
      ? '<div class="form-input form-view">' + escAttr(row.roles.map(staffRoleName).join(', ') || '—') + '</div>'
      : msHtml('st-row-' + i, opts, row.roles, '— Выберите роли —', false, true);
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
// Галочка «Администратор системы»: спрятать или вернуть строки филиалов
function stSysChanged() {
  stRolesRead();
  stRolesRender();
  stExpToggle();
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
  const rows = sys ? [] : stRows;   // у администратора системы ролей в филиалах нет
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
    await Promise.allSettled([loadStaff(), loadSpecialists(), loadSpecialistsAll()]);
    renderStaff();
  } catch (e) {
    // Отказ сервера (занятый телефон, будущие занятия специалиста) или нет связи — сообщение уже показано (apiRequest)
  }
}
