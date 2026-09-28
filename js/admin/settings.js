// Админка: настройки, филиалы, режим работы филиала

// ═══ SETTINGS ════════════════════════════════════════════════════════

// Вкладки раздела «Настройки»: Филиалы / Станки и зал / Типы станков / Справочники
let settingsTab = 'locations';

function renderSettings() {
  switchSettingsTab(settingsTab);
}

function switchSettingsTab(tab) {
  settingsTab = tab;
  document.querySelectorAll('[data-set-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-set-tab') === tab); });
  document.querySelectorAll('#adm-settings .set-tab').forEach(function (el) { el.style.display = el.id === 'set-tab-' + tab ? '' : 'none'; });
  if (tab === 'locations') renderLocations();
  if (tab === 'stations') renderStationsTab();
  if (tab === 'types') renderStationTypesTab();
  if (tab === 'dicts') renderDictsTab();
}

// Выпадающий список филиалов для вкладок «по филиалу»; выбранный филиал общий для вкладок
let settingsLocId = null;
function fillSettingsLocSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return null;
  const list = LOCATIONS_ALL.length ? LOCATIONS_ALL : LOCATIONS;
  if (!settingsLocId || !list.some(function (l) { return Number(l.id) === Number(settingsLocId); }))
    settingsLocId = list.length ? Number(list[0].id) : null;
  sel.innerHTML = list.map(function (l) {
    return '<option value="' + l.id + '">' + escAttr(l.name) + (Number(l.active) ? '' : ' (недействующий)') + '</option>';
  }).join('');
  sel.value = settingsLocId || '';
  return settingsLocId;
}

// Простая модалка-форма: body — HTML полей, onSave — async () => true, если можно закрыть
function openFormModal(id, title, body, onSave, extraButtons) {
  const old = document.getElementById(id); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = id;
  el.innerHTML = '<div class="admin-modal" style="max-width:460px">' +
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

// Маска телефона: +7 (XXX) XXX-XX-XX — оставляем только цифры и форматируем
function maskPhone(v) {
  let d = (v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  d = d.slice(0, 11);
  const rest = d.slice(1);            // до 10 цифр после кода страны
  let r = '+7';
  if (rest.length > 0) r += ' (' + rest.slice(0, 3);
  if (rest.length >= 3) r += ')';
  if (rest.length > 3) r += ' ' + rest.slice(3, 6);
  if (rest.length > 6) r += '-' + rest.slice(6, 8);
  if (rest.length > 8) r += '-' + rest.slice(8, 10);
  return r;
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
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<label style="width:120px;font-size:13px;display:flex;align-items:center;gap:6px;color:' + dayColor + '">' +
      '<input type="checkbox" class="loc-h-open" data-i="' + i + '"' + (h.open ? ' checked' : '') + '>' + d + '</label>' +
      '<select class="form-input loc-h-from" data-i="' + i + '" style="width:auto;padding:4px 8px">' + timeOptions15(h.from || '') + '</select>' +
      '<span>–</span>' +
      '<select class="form-input loc-h-to" data-i="' + i + '" style="width:auto;padding:4px 8px">' + timeOptions15(h.to || '') + '</select>' +
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
  return '<div style="margin-top:10px;border-top:1px solid var(--line,#eee);padding-top:8px">' + rows + '</div>';
}

function renderLocations() {
  const el = document.getElementById('settings-locations');
  if (!el) return;
  if (!LOCATIONS_ALL.length) {
    el.innerHTML = '<div style="color:var(--ink-60);font-size:13px">Филиалов пока нет. Нажмите «Добавить филиал».</div>';
    return;
  }
  const infoLine = 'font-size:13px;color:var(--ink-60);line-height:1.6';
  el.innerHTML = LOCATIONS_ALL.map(function (l) {
    const inactive = !Number(l.active);
    const cardBg = inactive ? ';background:#f3f4f6' : '';
    const statusBadge = inactive
      ? '<span class="lib-meta-tag" style="background:#e5e7eb;color:#6b7280">Недействующий</span>'
      : '<span class="lib-meta-tag" style="background:var(--green-light);color:var(--green-dark)">Действующий</span>';
    return '<div class="lib-card" style="margin-bottom:0;padding:14px' + cardBg + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
      '<div style="min-width:0">' +
      '<div style="font-weight:600;font-size:14px;line-height:1.6">' + l.name + '</div>' +
      (l.address ? '<div style="' + infoLine + '">' + l.address + '</div>' : '') +
      (l.phone ? '<div style="' + infoLine + '">Тел.: ' + l.phone + '</div>' : '') +
      (l.email ? '<div style="' + infoLine + '">Email: ' + l.email + '</div>' : '') +
      '</div>' +
      '<button class="action-btn confirm" style="font-size:11px;padding:4px 8px;white-space:nowrap" onclick="openLocationModal(' + l.id + ')">Ред.</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
      statusBadge +
      '<span class="lib-meta-tag">Зал ' + l.hall_cols + '×' + l.hall_rows + '</span>' +
      '<span class="lib-meta-tag">Вместимость: ' + l.max_people + '</span>' +
      '</div>' +
      locHoursSummary(l.work_hours) +
      '</div>';
  }).join('');
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
  renderLocations();
}

// Совместимость: старый renderAdmin теперь рендерит дашборд
function renderAdmin() {
  renderDashboard();
  updateAdminBadges();
}

// Совместимость: filterBookingsSearch
// ── Панель → Записи ───────────────────────────────────────────────
// Период (по дате занятия) и филиал уходят в запрос к серверу; статус и поиск фильтруют загруженный список.
function bookingsPanelFilters() {
  const fromEl = document.getElementById('bookings-from');
  const toEl = document.getElementById('bookings-to');
  // По умолчанию — как на сервере: −7 … +30 дней от сегодня
  if (fromEl && !fromEl.value) { const d = new Date(today); d.setDate(d.getDate() - 7); fromEl.value = fmtLocalDate(d); }
  if (toEl && !toEl.value) { const d = new Date(today); d.setDate(d.getDate() + 30); toEl.value = fmtLocalDate(d); }
  const locSel = document.getElementById('bookings-loc');
  if (locSel && !locSel.options.length) {
    const list = LOCATIONS_ALL.length ? LOCATIONS_ALL : LOCATIONS;
    locSel.innerHTML = '<option value="">Все филиалы</option>' +
      list.map(function (l) { return '<option value="' + l.id + '">' + escAttr(l.name) + '</option>'; }).join('');
  }
  return {
    from: fromEl ? fromEl.value : '',
    to: toEl ? toEl.value : '',
    location_id: locSel ? locSel.value : '',
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
    list = list.filter(b => [b.name, b.email, b.phone, b.service, b.specialistFull, b.station]
      .some(v => (v || '').toLowerCase().includes(lq)));
  }
  renderAdminBookingsFiltered(list);
}

function renderAdminBookings() {
  bookingsPanelFilters();
  filterBookingsSearch(document.getElementById('bookings-search')?.value || '');
  // KPI — по загруженному периоду и филиалу
  const kpi = document.getElementById('bookings-kpi');
  if (kpi) {
    kpi.innerHTML = [
      { val: bookings.length, label: 'Всего', color: 'var(--ink)' },
      { val: bookings.filter(b => b.status === 'booked').length, label: 'Активные', color: 'var(--green)' },
      { val: bookings.filter(b => b.status === 'cancelled').length, label: 'Отменены', color: '#ef4444' },
    ].map(k => '<div class="adm-kpi" style="padding:12px"><div class="adm-kpi-val" style="color:' + k.color + ';font-size:20px">' + k.val + '</div><div class="adm-kpi-label">' + k.label + '</div></div>').join('');
  }
}

function renderAdminBookingsFiltered(list) {
  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--ink-60)">Записей нет</td></tr>'; return; }
  const statusMap = { booked: 'status-confirmed', cancelled: 'status-cancelled' };
  const statusLabel = { booked: 'Активна', cancelled: 'Отменена' };
  const muted = function (v) { return v ? escAttr(v) : '<span style="color:var(--ink-60)">—</span>'; };
  tbody.innerHTML = [...list].reverse().map(b => {
    const date = new Date(b.date);
    // Станок: название + код типа станка
    const station = b.station
      ? escAttr(b.station) + (b.stationCode ? '<br><span style="color:var(--ink-60);font-size:11px">' + escAttr(b.stationCode) + '</span>' : '')
      : muted('');
    // Полоса слева — цвет категории занятия (тренировка / байкфит / мастерская)
    return '<tr>' +
      '<td style="border-left:4px solid ' + catColor(b.cat) + '"><strong>' + escAttr(b.name) + '</strong><br><span style="color:var(--ink-60);font-size:11px">' + escAttr(b.email) + '</span></td>' +
      '<td style="white-space:nowrap">' + muted(b.phone) + '</td>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + catColor(b.cat) + ';margin-right:6px;vertical-align:middle" title="' + escAttr(catName(b.cat)) + '"></span>' + escAttr(b.service) + '</td>' +
      '<td>' + muted(b.specialistFull) + '</td>' +
      '<td>' + station + '</td>' +
      '<td style="white-space:nowrap">' + date.getDate() + ' ' + MONTHS_RU[date.getMonth()] + ' · ' + b.time + '</td>' +
      '<td style="font-weight:600;white-space:nowrap">' + b.price.toLocaleString('ru') + ' ₽</td>' +
      '<td><span class="status-badge ' + statusMap[b.status] + '">' + statusLabel[b.status] + '</span></td>' +
      '<td style="display:flex;gap:4px;flex-wrap:wrap">' +

      (b.status !== 'cancelled' ? '<button class="action-btn cancel" style="font-size:11px;padding:4px 8px" onclick="adminCancel(' + b.id + ')">✕</button>' : '') +
      '<button class="action-btn" style="background:var(--green-light);color:var(--green);font-size:11px;padding:4px 8px" data-chat-email="' + (b.email || '') + '" data-chat-name="' + (b.name || '') + '" onclick="this.dispatchEvent(new CustomEvent(\'admchat\',{bubbles:true}))">Чат</button>' +
      '</td></tr>';
  }).join('');
}

