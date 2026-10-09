// Админка: настройки, филиалы, режим работы филиала

// ═══ SETTINGS ════════════════════════════════════════════════════════

// Пункты меню группы «Настройки», которые показывает панель adm-settings: каждый — своя часть панели (.set-tab).
// Какой открыт — задаёт admNav('set_<код>') в js/admin/data-nav.js
const SETTINGS_TABS = { locations: 'Филиалы', types: 'Типы станков', dicts: 'Справочники', params: 'Параметры', docs: 'Документы' };
// Страница филиала — внутри пункта «Филиалы»: нажатие на карточку филиала открывает его вкладки. Здесь всё, что
// у каждого филиала своё: данные, тренировки и услуги (библиотека) и зал. Обзора «все филиалы сразу» нет (решение владельца 09.10.2026)
const BRANCH_TABS = { branch_info: 'О филиале', trainings: 'Тренировки', services: 'Услуги', stations: 'Станки и зал' };
let branchPageId = null;   // открытый филиал
let settingsTab = 'locations';

function renderSettings() {
  switchSettingsTab(settingsTab);
}

function switchSettingsTab(tab) {
  const branch = BRANCH_TABS[tab] ? LOCATIONS_ALL.find(function (l) { return Number(l.id) === branchPageId; }) : null;
  if (BRANCH_TABS[tab] && !branch) tab = 'locations';   // филиал не выбран или его больше нет — к списку
  settingsTab = tab;
  document.getElementById('adm-settings-title').textContent = branch ? branch.name : (SETTINGS_TABS[tab] || '');
  document.getElementById('branch-back').style.display = branch ? '' : 'none';
  document.getElementById('branch-tabs').style.display = branch ? '' : 'none';
  document.querySelectorAll('[data-branch-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-branch-tab') === tab); });
  // «Тренировки» и «Услуги» — одна часть панели (библиотека филиала), разный вид занятий
  const isLib = tab === 'trainings' || tab === 'services';
  const part = isLib ? 'library' : tab;
  document.querySelectorAll('#adm-settings .set-tab').forEach(function (el) { el.style.display = el.id === 'set-tab-' + part ? '' : 'none'; });
  if (tab === 'locations') renderLocations();
  if (tab === 'branch_info') renderBranchInfo();
  if (isLib) {
    libOpen(tab);   // сразу — из того, что уже загружено; затем свежие данные с сервера
    Promise.allSettled([loadLibraryAll(), loadActivityCats(), loadDictAvailability(), loadDictValues()]).then(function () {
      if (settingsTab === tab) renderLibrary();
    });
  }
  if (tab === 'stations') renderStationsTab();
  if (tab === 'types') renderStationTypesTab();
  if (tab === 'dicts') renderDictsTab();
  if (tab === 'params') renderParamsTab();
  if (tab === 'docs') renderDocsTab();
}

// Открыть страницу филиала (нажатие на карточку в списке) и вернуться к списку
function openBranchPage(id, tab) {
  branchPageId = Number(id);
  switchSettingsTab(tab || 'branch_info');
}
function branchPageClose() {
  switchSettingsTab('locations');
}

// ── Параметры студии (таблица settings): одна кнопка «Сохранить», сервер сохраняет блок целиком ──
async function renderParamsTab() {
  const box = document.getElementById('settings-params');
  if (!box) return;
  let list;
  try { list = (await SettingsAPI.list()) || []; } catch (e) { return; }
  if (!list.length) { box.innerHTML = '<div class="set-hint">Параметров нет</div>'; return; }
  box.innerHTML = list.map(function (p) {
    const input = p.type === 'int'
      ? '<input class="form-input u-w-120" type="number" required' + needFieldAttr('system') + ' data-param="' + p.code + '" value="' + escAttr(p.value) + '"' +
        (p.min !== null ? ' min="' + p.min + '"' : '') + (p.max !== null ? ' max="' + p.max + '"' : '') + '>'
      : '<input class="form-input u-w-260" required' + needFieldAttr('system') + ' data-param="' + p.code + '" value="' + escAttr(p.value) + '">';
    return '<div class="form-field u-flex u-items-center u-gap-12 u-wrap">' +
      '<label class="form-label u-m-0 u-max-w-full u-w-380">' + escAttr(p.name) + '</label>' + input + '</div>';
  }).join('');
}

async function saveParamsBlock() {
  const values = {};
  document.querySelectorAll('#settings-params [data-param]').forEach(function (el) { values[el.getAttribute('data-param')] = el.value.trim(); });
  if (!Object.keys(values).length) return;
  try { await SettingsAPI.update(values); } catch (e) { return; }
  showToast('Параметры сохранены', 'success');
  renderParamsTab();
}

// Филиал вкладки «Станки и зал» — открытый филиал (страница филиала)
let settingsLocId = null;
function fillSettingsLocSelect() {
  settingsLocId = branchPageId;
  return settingsLocId;
}

// Простая модалка-форма: body — HTML полей, onSave — async () => true, если можно закрыть;
// widthClass — класс ширины окна из css/kit.css (по умолчанию u-max-w-460)
function openFormModal(id, title, body, onSave, extraButtons, widthClass) {
  const old = document.getElementById(id); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = id;
  el.innerHTML = '<div class="admin-modal ' + (widthClass || 'u-max-w-460') + '">' +
    '<div class="admin-modal-title">' + title + '</div>' + body +
    '<div class="admin-modal-actions">' + (extraButtons || '') +
    '<button class="btn-ghost" data-act="cancel">Отмена</button>' +
    '<button class="btn-primary" data-act="save">Сохранить</button></div></div>';
  document.body.appendChild(el);
  el.querySelector('[data-act="cancel"]').onclick = function () { el.remove(); };
  el.querySelector('[data-act="save"]').onclick = async function () {
    try { if (await onSave()) el.remove(); } catch (e) { /* ошибка показана в apiRequest */ }
  };
  return el;
}

// ── Филиалы (locations) ───────────────────────────────────────
const LOC_DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const LOC_DAYS_SHORT = { 'Понедельник': 'Пн', 'Вторник': 'Вт', 'Среда': 'Ср', 'Четверг': 'Чт', 'Пятница': 'Пт', 'Суббота': 'Сб', 'Воскресенье': 'Вс' };

function parseWorkHours(wh) {
  if (!wh) return null;
  if (Array.isArray(wh)) return wh;
  try { return JSON.parse(wh); } catch (e) { return null; }
}

// ── Режим работы филиала (locations.work_hours) для расписания ──
function timeToMin(t) { const p = String(t).split(':'); return parseInt(p[0]) * 60 + parseInt(p[1] || 0); }
function minToTime(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

function findLocation(locId) {
  return LOCATIONS.concat(LOCATIONS_ALL).find(function (l) { return Number(l.id) === Number(locId); }) || null;
}

// Часы работы филиала в день недели (0 = Пн … 6 = Вс): { from, to } в минутах;
// null — выходной. undefined — режим работы у филиала не задан (не ограничиваем).
function locDayHours(locId, dayIdx) {
  const loc = findLocation(locId);
  const arr = loc ? parseWorkHours(loc.work_hours) : null;
  if (!arr || !arr.length) return undefined;
  const h = arr.find(function (x) { return x.day === LOC_DAYS[dayIdx]; });
  if (!h || !h.open || !h.from || !h.to) return null;
  return { from: timeToMin(h.from), to: timeToMin(h.to) };
}

// Помещается ли занятие в режим работы: начинается не раньше открытия и заканчивается не позже закрытия.
// Возвращает текст ошибки или '' если всё в порядке.
function workHoursError(locId, dayIdx, time, dur) {
  const h = locDayHours(locId, dayIdx);
  if (h === undefined) return '';
  if (h === null) return 'В этот день филиал не работает';
  const start = timeToMin(time), end = start + (parseInt(dur) || 0);
  if (start < h.from || end > h.to)
    return 'Занятие должно быть в режиме работы филиала: ' + minToTime(h.from) + '–' + minToTime(h.to);
  return '';
}

// Варианты времени начала (шаг 15 мин) в пределах [from, to - dur]
function workTimeOptions(from, to, dur, selected) {
  let o = '';
  for (let m = from; m + dur <= to; m += 15) {
    const t = minToTime(m);
    o += '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + t + '</option>';
  }
  return o;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Опции времени с шагом 15 минут (00:00 … 23:45)
function timeOptions15(selected) {
  let o = '<option value=""></option>';
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      o += '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + t + '</option>';
    }
  }
  return o;
}

// Редактор режима работы в модалке филиала
function renderLocHours(hours) {
  const el = document.getElementById('loc-hours');
  if (!el) return;
  const arr = parseWorkHours(hours);
  const map = {};
  (arr || []).forEach(function (h) { map[h.day] = h; });
  el.innerHTML = LOC_DAYS.map(function (d, i) {
    const h = map[d] || { open: false, from: '', to: '' };
    const weekend = (d === 'Суббота' || d === 'Воскресенье');
    const dayColor = weekend ? '#9ca3af' : '#00BAB3';
    return '<div class="u-flex u-items-center u-gap-8 u-mb-6">' +
      '<label style="width:120px;font-size:13px;display:flex;align-items:center;gap:6px;color:' + dayColor + '">' +
      '<input type="checkbox" class="loc-h-open" data-i="' + i + '"' + (h.open ? ' checked' : '') + '>' + d + '</label>' +
      '<select class="form-input loc-h-from u-w-auto u-p-4-8" data-i="' + i + '">' + timeOptions15(h.from || '') + '</select>' +
      '<span>–</span>' +
      '<select class="form-input loc-h-to u-w-auto u-p-4-8" data-i="' + i + '">' + timeOptions15(h.to || '') + '</select>' +
      '</div>';
  }).join('');
}

// Краткая сводка режима работы для карточки филиала
function locHoursSummary(wh) {
  const arr = parseWorkHours(wh);
  if (!arr || !arr.length) return '';
  const rows = arr.map(function (h) {
    const weekend = (h.day === 'Суббота' || h.day === 'Воскресенье');
    const color = weekend ? '#9ca3af' : '#00BAB3';
    return '<div style="display:flex;justify-content:space-between;font-size:12px;line-height:1.7;color:' + color + '">' +
      '<span>' + (LOC_DAYS_SHORT[h.day] || h.day) + '</span>' +
      '<span>' + (h.open ? (h.from + '–' + h.to) : 'выходной') + '</span></div>';
  }).join('');
  return '<div class="u-mt-10 u-border-top u-pt-8">' + rows + '</div>';
}

function renderLocations() {
  const el = document.getElementById('settings-locations');
  if (!el) return;
  if (!LOCATIONS_ALL.length) {
    el.innerHTML = '<div class="u-muted u-text-ui">Филиалов пока нет. Нажмите «Добавить филиал».</div>';
    return;
  }
  const infoLine = 'font-size:13px;color:var(--ink-60);line-height:1.6';
  el.innerHTML = LOCATIONS_ALL.map(function (l) {
    const inactive = !Number(l.active);
    const cardBg = inactive ? ';background:#f3f4f6' : '';
    const statusBadge = inactive
      ? '<span class="lib-meta-tag tag-muted">Недействующий</span>'
      : '<span class="lib-meta-tag u-brand-dark u-bg-brand-light">Действующий</span>';
    return '<div class="lib-card u-pointer" style="margin-bottom:0;padding:14px' + cardBg + '" onclick="openBranchPage(' + l.id + ')">' +
      '<div class="u-min-w-0">' +
      '<div class="u-strong u-text-body u-lh-relaxed">' + l.name + '</div>' +
      (l.address ? '<div style="' + infoLine + '">' + l.address + '</div>' : '') +
      (l.phone ? '<div style="' + infoLine + '">Тел.: ' + l.phone + '</div>' : '') +
      (l.email ? '<div style="' + infoLine + '">Email: ' + l.email + '</div>' : '') +
      '</div>' +
      '<div class="u-flex u-gap-6 u-wrap u-mt-8">' +
      statusBadge +
      '<span class="lib-meta-tag">Зал ' + l.hall_cols + '×' + l.hall_rows + '</span>' +
      '<span class="lib-meta-tag">Вместимость: ' + l.max_people + '</span>' +
      '</div>' +
      locHoursSummary(l.work_hours) +
      '</div>';
  }).join('');
}

// Вкладка «О филиале»: данные открытого филиала; «Изменить» — окно филиала (только у кого есть право system)
function renderBranchInfo() {
  const l = LOCATIONS_ALL.find(function (x) { return Number(x.id) === branchPageId; });
  const el = document.getElementById('branch-info');
  if (!l || !el) return;
  const row = function (label, value) {
    return value ? '<div class="u-text-body u-mb-6"><span class="u-muted">' + label + ':</span> ' + escAttr(String(value)) + '</div>' : '';
  };
  el.innerHTML = '<div class="u-flex u-justify-between u-items-start u-gap-12 u-mb-10">' +
    '<div class="u-flex u-gap-6 u-wrap">' +
    (Number(l.active) ? '<span class="lib-meta-tag u-brand-dark u-bg-brand-light">Действующий</span>' : '<span class="lib-meta-tag tag-muted">Недействующий</span>') +
    '<span class="lib-meta-tag">Зал ' + l.hall_cols + '×' + l.hall_rows + '</span>' +
    '<span class="lib-meta-tag">Вместимость: ' + l.max_people + '</span>' +
    '</div>' +
    '<button class="btn-primary"' + needAttr('system') + ' onclick="openLocationModal(' + l.id + ')">Изменить</button>' +
    '</div>' +
    row('Адрес', l.address) + row('Телефон', l.phone) + row('Email', l.email) +
    locHoursSummary(l.work_hours);
}

function openLocationModal(id) {
  const modal = document.getElementById('location-modal');
  if (id !== null) {
    const l = LOCATIONS_ALL.find(x => x.id === id);
    if (!l) return;
    document.getElementById('location-modal-title').textContent = 'Редактировать филиал';
    document.getElementById('loc-id').value = l.id;
    document.getElementById('loc-active').checked = !!Number(l.active);
    document.getElementById('loc-name').value = l.name || '';
    document.getElementById('loc-address').value = l.address || '';
    document.getElementById('loc-cols').value = l.hall_cols;
    document.getElementById('loc-rows').value = l.hall_rows;
    document.getElementById('loc-max').value = l.max_people;
    document.getElementById('loc-email').value = l.email || '';
    document.getElementById('loc-phone').value = maskPhone(l.phone || '');
    renderLocHours(l.work_hours);
  } else {
    document.getElementById('location-modal-title').textContent = 'Добавить филиал';
    document.getElementById('loc-id').value = '';
    document.getElementById('loc-name').value = '';
    document.getElementById('loc-address').value = '';
    document.getElementById('loc-cols').value = '';
    document.getElementById('loc-rows').value = '';
    document.getElementById('loc-max').value = '';
    document.getElementById('loc-email').value = '';
    document.getElementById('loc-phone').value = '';
    document.getElementById('loc-active').checked = true;
    renderLocHours(null);
  }
  modal.classList.add('show');
}

function closeLocationModal() {
  document.getElementById('location-modal').classList.remove('show');
}

async function saveLocation() {
  const name = document.getElementById('loc-name').value.trim();
  if (!name) { showToast('Введите название филиала', 'error'); return; }
  const cols = parseInt(document.getElementById('loc-cols').value);
  const rows = parseInt(document.getElementById('loc-rows').value);
  const max  = parseInt(document.getElementById('loc-max').value);
  if (!cols || !rows) { showToast('Укажите размер зала (колонки и ряды)', 'error'); return; }
  if (!max) { showToast('Укажите вместимость зала', 'error'); return; }
  const address = document.getElementById('loc-address').value.trim();
  if (!address) { showToast('Укажите адрес филиала', 'error'); return; }
  const email = document.getElementById('loc-email').value.trim();
  if (!email) { showToast('Укажите email', 'error'); return; }
  if (!isValidEmail(email)) { showToast('Введите корректный email', 'error'); return; }
  const phone = document.getElementById('loc-phone').value.trim();
  if (!phone) { showToast('Укажите телефон', 'error'); return; }
  if (phone.replace(/\D/g, '').length !== 11) { showToast('Введите телефон полностью', 'error'); return; }
  const idVal = document.getElementById('loc-id').value;
  const work_hours = LOC_DAYS.map(function (d, i) {
    return {
      day: d,
      open: document.querySelector('.loc-h-open[data-i="' + i + '"]').checked,
      from: document.querySelector('.loc-h-from[data-i="' + i + '"]').value,
      to: document.querySelector('.loc-h-to[data-i="' + i + '"]').value,
    };
  });
  const data = {
    name,
    address,
    hall_cols: cols,
    hall_rows: rows,
    max_people: max,
    email,
    phone,
    work_hours,
    active: document.getElementById('loc-active').checked ? 1 : 0,
  };
  try {
    if (idVal) { await LocationsAPI.update({ id: parseInt(idVal), ...data }); showToast('Филиал обновлён', 'success'); }
    else { await LocationsAPI.create(data); showToast('Филиал добавлен', 'success'); }
    await Promise.allSettled([loadLocations(), loadLocationsAll()]);
  } catch (e) { return; }
  closeLocationModal();
  renderSettings();
}

// Совместимость: filterBookingsSearch
// ── Панель → Записи ───────────────────────────────────────────────
// Период (по дате занятия) и филиал уходят в запрос к серверу; статус и поиск фильтруют загруженный список.
function bookingsPanelFilters() {
  const fromEl = document.getElementById('bookings-from');
  const toEl = document.getElementById('bookings-to');
  // По умолчанию — занятия от сегодня и дальше без ограничения: дата «по» пустая, пока её не зададут
  if (fromEl && !fromEl.value) fromEl.value = fmtLocalDate(new Date());
  return {
    from: fromEl ? fromEl.value : '',
    to: toEl ? toEl.value : '',
    location_id: admBranchId || '',   // текущий филиал панели; пусто — все доступные
  };
}

async function loadBookingsPanel() {
  const f = bookingsPanelFilters();
  if (f.from && f.to && f.from > f.to) { showToast('Дата «с» позже даты «по»', 'error'); return; }
  await loadAdminBookings(f);
}

function filterBookingsSearch(q) {
  const filter = document.getElementById('bookings-status-filter')?.value || 'all';
  let list = bookings;
  if (filter !== 'all') list = list.filter(b => b.status === filter);
  if (q) {
    const lq = q.toLowerCase();
    list = list.filter(b => phoneMatches(b.phone, q) || [b.name, b.service, b.specialistFull, b.station]
      .some(v => (v || '').toLowerCase().includes(lq)));
  }
  renderAdminBookingsFiltered(list);
}

function renderAdminBookings() {
  bookingsPanelFilters();
  filterBookingsSearch(document.getElementById('bookings-search')?.value || '');
  // KPI — по загруженному периоду и филиалу; сводные цифры видит только администратор системы
  const kpi = document.getElementById('bookings-kpi');
  if (kpi) kpi.style.display = canDo('system') ? '' : 'none';
  if (kpi && canDo('system')) {
    kpi.innerHTML = [
      { val: bookings.length, label: 'Всего', color: 'var(--ink)' },
      { val: bookings.filter(b => b.status === 'booked').length, label: 'Активные', color: 'var(--green)' },
      { val: bookings.filter(b => b.status === 'cancelled').length, label: 'Отменены', color: '#ef4444' },
    ].map(k => '<div class="adm-kpi u-p-12"><div class="adm-kpi-val" style="color:' + k.color + ';font-size:20px">' + k.val + '</div><div class="adm-kpi-label">' + k.label + '</div></div>').join('');
  }
}

// «Перенести» в строке записи: та же форма переноса, что в «Записи из расписания» (js/admin/journal-book.js).
// Форме нужны данные дня занятия в его филиале — берём их с сервера; после переноса обновляем список записей
async function bookingMove(id) {
  const b = bookings.find(function (x) { return x.id === id; });
  const loc = b ? findLocation(b.location_id) : null;
  if (!b || !loc) return;
  let day;
  try { day = await JournalAPI.day(loc.id, String(b.date).slice(0, 10)); } catch (e) { return; }
  const slot = day.slots.find(function (x) { return x.id === Number(b.slotId); });
  if (!slot || !slot.bookings.some(function (x) { return x.id === b.id; })) {
    showToast('Запись уже изменилась — обновите список', 'error');
    return;
  }
  const ctx = { loc: loc, day: day, after: async function () { await loadBookingsPanel(); renderAdminBookings(); } };
  if (slot.individual) jbOpenMove(slot.id, ctx); else jbOpenGroupMove(slot.id, b.id, ctx);
}

function renderAdminBookingsFiltered(list) {
  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;
  // Филиал выбран в шапке — столбец «Филиал» не нужен; он остаётся только в режиме «Все филиалы»
  const showLoc = !admCurLoc();
  document.getElementById('bookings-loc-th').style.display = showLoc ? '' : 'none';
  if (!list.length) { tbody.innerHTML = '<tr><td class="empty-state" colspan="10">Записей нет</td></tr>'; return; }
  const statusMap = { booked: 'status-confirmed', cancelled: 'status-cancelled' };
  const statusLabel = { booked: 'Активна', cancelled: 'Отменена' };
  const muted = function (v) { return v ? escAttr(v) : '<span class="u-muted">—</span>'; };
  tbody.innerHTML = list.map(b => {   // порядок — с сервера: по дате и времени занятия, ближайшие сверху
    const date = new Date(b.date);
    // Станок: название + тип станка
    const station = b.station
      ? escAttr(b.station) + (b.stationType ? '<br><span class="u-muted u-text-caption">' + escAttr(b.stationType) + '</span>' : '')
      : muted('');
    // Филиал, в котором проходит занятие
    const loc = showLoc && b.location_id ? findLocation(b.location_id) : null;
    // Полоса слева и точка — цвет занятия: категория, у тренировки — её вид (персональная / самостоятельная)
    return '<tr class="' + colorClass(b.cat, b.type) + '">' +
      '<td class="cat-edge"><strong>' + escAttr(b.name) + '</strong></td>' +
      '<td class="u-nowrap">' + muted(b.phone) + '</td>' +
      (showLoc ? '<td>' + muted(loc ? loc.name : '') + '</td>' : '') +
      '<td><span class="cat-dot" title="' + escAttr(catName(b.cat)) + '"></span>' + escAttr(b.service) + '</td>' +
      '<td>' + muted(b.specialistFull) + '</td>' +
      '<td>' + station + '</td>' +
      '<td class="u-nowrap">' + date.getDate() + ' ' + MONTHS_RU[date.getMonth()] + ' · ' + b.time + '</td>' +
      '<td class="u-strong u-nowrap">' + b.price.toLocaleString('ru') + ' ₽</td>' +
      '<td><span class="status-badge ' + statusMap[b.status] + '">' + statusLabel[b.status] + '</span></td>' +
      '<td class="u-flex u-gap-4 u-wrap">' +
      (b.status !== 'cancelled' ? '<button class="action-btn confirm btn-sm" title="Изменить" aria-label="Изменить" onclick="bookingMove(' + b.id + ')">' + ICO_EDIT + '</button>' : '') +
      (b.status !== 'cancelled' ? '<button class="action-btn cancel btn-sm" title="Отменить запись" aria-label="Отменить запись" onclick="adminCancel(' + b.id + ')">✕</button>' : '') +
      '</td></tr>';
  }).join('');
}

