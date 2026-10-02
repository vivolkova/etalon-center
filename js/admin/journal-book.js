// Админка: запись клиента из журнала (клиент звонит по телефону).
// Открывается нажатием на свободное время доски (js/admin/journal.js jrFreeClick):
//   в зале — индивидуальная тренировка (персональная / самостоятельная), станок и время подставлены;
//   в колонке специалиста — услуга открытой вкладки журнала (байкфит, массаж…), которую он оказывает.
// Из карточки групповой тренировки (нажатие на свободный станок схемы зала, jbOpenGroup) — запись на неё:
//   занятие, время и станок уже заданы, выбирается только клиент.
// Из карточки индивидуальной записи (кнопка «Перенести», jbOpenMove) — перенос: та же форма с текущими значениями;
//   клиент и занятие не меняются, выбираются день, время, длительность, специалист и станок (api/individual.php move).
// Клиент — из базы (поиск по номеру телефона) или новый: имя и телефон, создаётся вместе с записью
// без личного кабинета (middleware/booking_client.php). Один телефон — один клиент.
// Свободное время и станки считает сервер (api/individual.php: times, stations), он же всё перепроверяет при записи.
// На администратора не действует окно записи клиента (не позже чем за N минут, не дальше M дней).

// ═══ JOURNAL BOOKING ══════════════════════════════════════════════

let jb = null;     // состояние открытой формы
let jbReq = 0;     // номер последнего запроса времени/зала (ответ на устаревший выбор отбрасываем)

async function jbOpen(preset) {
  const loc = jrLoc();
  if (!loc || !jrData) return;
  // Варианты берём свежие (не из кеша сайта): библиотеку и графики админ мог только что поменять
  let opts;
  try { opts = await IndividualAPI.options(loc.id); } catch (e) { return; }
  const items = opts.items.filter(function (i) {
    return preset.specId
      ? i.cat === preset.cat && i.specialists.some(function (s) { return Number(s.id) === preset.specId; })
      : i.cat === 'training';
  });
  if (!items.length) {
    showToast(preset.specId ? 'Этот специалист не оказывает услуг в этом филиале' : 'В этом филиале нет индивидуальных тренировок', 'error');
    return;
  }
  jb = {
    locId: Number(loc.id), date: jrData.date, items: items, step: opts.step,
    fixedSpec: preset.specId || null,          // услуга: специалист — тот, в чьей колонке нажали
    wantStart: preset.start, wantStation: preset.stationId || null,   // куда нажали — подставляем, если свободно
    item: null, spec: null, dur: null, start: null, station: null,
    client: null, isNew: false, times: null, message: '', hall: null,
  };
  jbBuildModal(loc);
  jbRenderClient();
  jbPick(items[0].id);
}

// Окно формы записи: клиент, тело формы (jbRenderBody), комментарий, итог, кнопки
function jbBuildModal(loc) {
  const old = document.getElementById('jb-modal'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'jb-modal';
  el.innerHTML = '<div class="admin-modal u-max-w-560">'
    + '<div class="admin-modal-title">' + (jb.move ? 'Перенос записи' : 'Запись клиента') + '</div>'
    + '<div class="jr-card-sub" id="jb-sub"></div>'
    + '<div class="form-field"><label class="form-label">Клиент</label><div id="jb-client"></div></div>'
    + '<div id="jb-body"></div>'
    + (jb.move ? '' : '<div class="form-field"><label class="form-label">Комментарий</label><textarea class="form-input form-textarea" id="jb-notes" rows="2"></textarea></div>')
    + '<div class="ind-total" id="jb-total"></div>'
    + '<div class="admin-modal-actions"><button class="btn-ghost" onclick="jbClose()">Отмена</button>'
    + '<button class="btn-primary" id="jb-submit" onclick="jbSubmit()">' + (jb.move ? 'Перенести' : 'Записать') + '</button></div></div>';
  document.body.appendChild(el);
  const d = parseLocalDate(jb.date);
  const day = DAYS_FULL[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()];
  // При переносе под заголовком — что переносим (день в форме можно поменять)
  document.getElementById('jb-sub').textContent = jb.move
    ? 'Сейчас: ' + day + ', ' + minToTime(jb.move.from) + '–' + minToTime(jb.move.to) + ' · ' + loc.name
    : day + ' · ' + loc.name;
}

// Перенос индивидуальной записи из её карточки: та же форма с текущими значениями. Клиент и занятие заданы;
// выбираются день, время, длительность, специалист, станок. Комментарий и отметка об оплате сохраняются
async function jbOpenMove(slotId) {
  const loc = jrLoc();
  const slot = jrData && jrData.slots.find(function (x) { return x.id === slotId; });
  const b = slot && slot.bookings[0];
  if (!loc || !slot || !b) return;
  let opts;
  try { opts = await IndividualAPI.options(loc.id); } catch (e) { return; }
  const item = opts.items.find(function (i) { return i.id === slot.library_id; });
  if (!item) { showToast('Это занятие больше недоступно для записи — отмените запись и создайте новую', 'error'); return; }
  jb = {
    move: { bookingId: b.id, slotId: slot.id, from: slot.from, to: slot.to, price: slot.price, paid: b.payment_status === 'paid' },
    locId: Number(loc.id), date: jrData.date, items: [item], step: opts.step, fixedSpec: null,
    item: item.id, spec: slot.specialist_id, dur: slot.to - slot.from,
    wantStart: slot.from, wantStation: b.station_id, start: null, station: null,
    client: { id: b.user_id, name: b.name, phone: b.phone }, isNew: false, times: null, message: '', hall: null,
  };
  const card = document.getElementById('jr-slot-modal'); if (card) card.remove();
  jbBuildModal(loc);
  jbRenderClient();
  jbLoadTimes();
}
function jbMoveDate(val) { if (jb && val) { jb.date = val; jbLoadTimes(); } }

// Запись клиента на групповую тренировку из её карточки (нажатие на свободный станок схемы зала):
// та же форма, но занятие, время и станок уже заданы — остаётся выбрать клиента
function jbOpenGroup(slotId, stationId) {
  const loc = jrLoc();
  const slot = jrData && jrData.slots.find(function (x) { return x.id === slotId; });
  if (!loc || !slot) return;
  jb = { group: slot, locId: Number(loc.id), date: jrData.date, items: [], item: null, client: null, isNew: false, station: Number(stationId) };
  const card = document.getElementById('jr-slot-modal'); if (card) card.remove();
  jbBuildModal(loc);
  jbRenderClient();
  jbRenderBody();
}

function jbClose() {
  const el = document.getElementById('jb-modal'); if (el) el.remove();
  jb = null;
}

function jbItem() { return jb.items.find(function (i) { return i.id === jb.item; }); }

// ── Клиент: поиск в базе по телефону или новый ──
function jbRenderClient() {
  const box = document.getElementById('jb-client');
  if (jb.client) {
    box.innerHTML = '<div class="jb-picked"><div><b>' + escAttr(jb.client.name) + '</b><span>' + escAttr(jb.client.phone || '') + '</span></div>'
      + (jb.move ? '' : '<button class="btn-ghost jb-link" onclick="jbClearClient()">Изменить</button>') + '</div>';
  } else if (jb.isNew) {
    box.innerHTML = '<div class="jb-new"><div><label class="form-label">Имя</label><input class="form-input" id="jb-new-name" required></div>'
      + '<div><label class="form-label">Телефон</label><input class="form-input phone-input" id="jb-new-phone" required></div></div>'
      + '<button class="btn-ghost jb-link" onclick="jbSetNew(false)">Найти по телефону</button>';
  } else {
    box.innerHTML = '<input class="form-input" id="jb-search" inputmode="tel" oninput="jbSearch(this.value)" autocomplete="off">'
      + '<div class="set-hint">Номер телефона — от трёх цифр, можно любую часть номера</div>'
      + '<div id="jb-results"></div>'
      + '<button class="btn-ghost jb-link" onclick="jbSetNew(true)">Новый клиент</button>';
  }
  jbUpdateSubmit();
}

function jbSearch(q) {
  const box = document.getElementById('jb-results');
  // Ищем только по номеру (поиск по имени пока не делаем): цифры запроса — в номере без кода страны
  // (последние 10 цифр). Номер, набранный с начала — «8 900…» или «+7 900…», — тот же, что «900…»
  const digits = q.replace(/\D+/g, '');
  if (digits.length < 3) { box.innerHTML = ''; return; }
  const fromStart = /^[78]/.test(digits) ? digits.slice(1) : null;
  const found = CLIENTS.filter(function (c) {
    const nat = String(c.phone).replace(/\D+/g, '').slice(-10);
    return nat.indexOf(digits) >= 0 || (fromStart && nat.indexOf(fromStart) === 0);
  }).slice(0, 6);
  box.innerHTML = found.length
    ? found.map(function (c) {
      return '<button type="button" class="jb-result" onclick="jbSelectClient(' + c.id + ')"><b>' + escAttr(c.name) + '</b><span>' + escAttr(c.phone || '') + '</span></button>';
    }).join('')
    : '<div class="set-hint">Не найден — добавьте нового клиента</div>';
}

function jbSelectClient(id) {
  jb.client = CLIENTS.find(function (c) { return c.id === id; }) || null;
  jb.isNew = false;
  jbRenderClient();
  jbLoadTimes();   // у выбранного клиента могут быть свои записи в это время
}
function jbClearClient() { jb.client = null; jbRenderClient(); jbLoadTimes(); }

// Новый клиент: номер, набранный в поиске, переносим в поле телефона
function jbSetNew(on) {
  const s = document.getElementById('jb-search');
  const q = s ? s.value.trim() : '';
  jb.isNew = on; jb.client = null;
  jbRenderClient();
  if (on && q) document.getElementById('jb-new-phone').value = maskPhone(q);   // маска +7 (XXX) XXX-XX-XX — как у телефона филиала
  jbLoadTimes();
}

// ── Что, кто ведёт, длительность ──
function jbPick(id) {
  jb.item = Number(id);
  const it = jbItem();
  jb.spec = !it.needs_specialist ? null : jb.fixedSpec || (it.specialists.length ? Number(it.specialists[0].id) : null);
  jb.dur = it.durations[0];
  jbLoadTimes();
}
function jbSelectSpec(id) { jb.spec = Number(id); jbLoadTimes(); }
function jbSelectDur(m) { jb.dur = Number(m); jbLoadTimes(); }
function jbSelectStart(val) { jb.start = val ? timeToMin(val) : null; jb.wantStart = jb.start; jbLoadHall(); }
function jbSelectStation(id) { jb.station = Number(id); jb.wantStation = jb.station; jbRenderBody(); }

// Свободные времена начала для выбранного занятия, специалиста, длительности (и клиента, если выбран)
async function jbLoadTimes() {
  if (!jb) return;
  if (jb.group) { jbUpdateSubmit(); return; }   // групповая тренировка: время задано занятием
  jb.times = null; jb.hall = null;
  jbRenderBody();
  const req = ++jbReq, mine = jb;
  let res;
  try {
    res = await IndividualAPI.times({ library_id: jb.item, specialist_id: jb.spec, date: jb.date, duration: jb.dur, user_id: jb.client ? jb.client.id : null, skip_slot_id: jb.move ? jb.move.slotId : null });
  } catch (e) {
    res = { times: [], message: e.message || 'Не удалось загрузить свободное время' };
  }
  if (jb !== mine || req !== jbReq) return;
  jb.times = res.times.map(timeToMin); jb.message = res.message;
  // Время, на которое нажали в журнале (или выбранное раньше), — если оно свободно
  jb.start = jb.times.indexOf(jb.wantStart) >= 0 ? jb.wantStart : null;
  jbLoadHall();
}

// Схема зала на выбранное время (только у тренировок)
async function jbLoadHall() {
  if (!jb) return;
  jb.hall = null;
  if (jbItem().cat !== 'training' || jb.start === null) { jb.station = null; jbRenderBody(); return; }
  jbRenderBody();
  const req = ++jbReq, mine = jb;
  let data = null;
  try { data = await IndividualAPI.stations({ library_id: jb.item, date: jb.date, start: minToTime(jb.start), duration: jb.dur, skip_slot_id: jb.move ? jb.move.slotId : null }); } catch (e) { /* подпись в форме */ }
  if (jb !== mine || req !== jbReq) return;
  jb.hall = data || { stations: [], error: true };
  const free = function (id) { return jb.hall.stations.some(function (s) { return Number(s.id) === id && s.state === 'free'; }); };
  jb.station = free(jb.wantStation) ? jb.wantStation : null;
  jbRenderBody();
}

function jbRenderBody() {
  if (!jb) return;
  const field = function (label, inner) { return '<div class="form-field"><label class="form-label">' + label + '</label>' + inner + '</div>'; };
  if (jb.group) { jbRenderGroupBody(field); return; }
  const it = jbItem();
  const chips = function (list) { return '<div class="filter-chips">' + list.join('') + '</div>'; };
  let h = '';
  if (jb.move) h += field('День', '<input type="date" class="form-input" required min="' + fmtLocalDate(today) + '" value="' + jb.date + '" onchange="jbMoveDate(this.value)">');
  if (jb.items.length > 1) {
    h += field(it.cat === 'training' ? 'Тренировка' : 'Услуга', chips(jb.items.map(function (i) {
      return indChip(escAttr(i.name), i.id === jb.item, 'jbPick(' + i.id + ')');
    })));
  } else {
    h += field(it.cat === 'training' ? 'Тренировка' : 'Услуга', '<div class="form-input form-view">' + escAttr(it.name) + '</div>');
  }
  if (it.needs_specialist) {
    const specs = jb.fixedSpec ? it.specialists.filter(function (s) { return Number(s.id) === jb.fixedSpec; }) : it.specialists;
    h += field(it.cat === 'training' ? 'Тренер' : 'Специалист', chips(specs.map(function (s) {
      return indChip(escAttr(s.full_name || s.name), Number(s.id) === jb.spec, 'jbSelectSpec(' + s.id + ')');
    })));
  }
  if (it.durations.length > 1) {
    h += field('Длительность', chips(it.durations.map(function (m) { return indChip(fmtDurShort(m), m === jb.dur, 'jbSelectDur(' + m + ')'); })));
  }

  // Время начала
  let time;
  if (jb.times === null) time = '<div class="ind-hint">Ищем свободное время…</div>';
  else if (!jb.times.length) time = '<div class="ind-hint">' + escAttr(jb.message || 'Свободного времени нет') + '</div>';
  else {
    time = '<select class="form-input" required onchange="jbSelectStart(this.value)"><option value="">— выберите время —</option>'
      + jb.times.map(function (m) { return '<option value="' + minToTime(m) + '"' + (m === jb.start ? ' selected' : '') + '>' + minToTime(m) + '–' + minToTime(m + jb.dur) + '</option>'; }).join('')
      + '</select>';
    if (jb.start === null && jb.wantStart !== null) {
      time += '<div class="ind-hint">На ' + minToTime(jb.wantStart) + ' записать нельзя (занято или не работает) — выберите другое время</div>';
    }
  }
  h += field('Время', time);

  // Станок
  if (it.cat === 'training' && jb.start !== null) {
    h += field('Станок', '<div id="jb-hall" class="hall-scheme"></div><div class="station-hint" id="jb-hall-hint"></div>');
  }
  document.getElementById('jb-body').innerHTML = h;

  const hall = document.getElementById('jb-hall');
  if (hall) {
    const hint = document.getElementById('jb-hall-hint');
    if (!jb.hall) hint.textContent = 'Загрузка схемы зала…';
    else if (jb.hall.error) hint.textContent = 'Не удалось загрузить схему зала';
    else {
      hallFill(hall, jb.hall, jb.station, 'jbSelectStation');
      const free = jb.hall.stations.filter(function (s) { return s.state === 'free'; }).length;
      hint.textContent = jb.station ? 'Станок выбран ✓' : free ? 'Свободно: ' + free + '. Выберите станок.' : 'Свободных станков нет';
    }
  }

  const d = parseLocalDate(jb.date);
  let total = jb.start !== null
    ? d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(jb.start) + '–' + minToTime(jb.start + jb.dur) + ' · ' + indPgPrice(it, jb.dur).toLocaleString('ru') + ' ₽'
    : '';
  if (jb.move && jbMovePriceChanged()) {
    total += (total ? ' ' : '') + '(было ' + jb.move.price.toLocaleString('ru') + ' ₽)'
      + (jb.move.paid ? '. Запись оплачена — перенос с другой ценой пока недоступен' : '');
  }
  document.getElementById('jb-total').textContent = total;
  jbUpdateSubmit();
}
// Перенос: изменится ли цена (другая длительность у самостоятельной тренировки)
function jbMovePriceChanged() { return indPgPrice(jbItem(), jb.dur) !== jb.move.price; }

// Тело формы для групповой тренировки: занятие и станок — только показ (заданы карточкой)
function jbRenderGroupBody(field) {
  const g = jb.group;
  document.getElementById('jb-body').innerHTML =
    field('Тренировка', '<div class="form-input form-view">' + escAttr([g.name, minToTime(g.from) + '–' + minToTime(g.to), g.specialist].filter(Boolean).join(' · ')) + '</div>')
    + field('Станок', '<div class="form-input form-view">' + escAttr(jrStationLabel(jb.station)) + '</div>');
  const d = parseLocalDate(jb.date);
  document.getElementById('jb-total').textContent = d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(g.from) + '–' + minToTime(g.to) + ' · ' + g.price.toLocaleString('ru') + ' ₽';
  jbUpdateSubmit();
}

// Кнопка «Записать» активна, когда выбраны клиент (или вводится новый), время и — для тренировки — станок
function jbUpdateSubmit() {
  const btn = document.getElementById('jb-submit');
  if (!btn || !jb) return;
  if (jb.group) { btn.disabled = !((jb.client || jb.isNew) && jb.station); return; }
  const it = jb.item ? jbItem() : null;
  btn.disabled = !(it && (jb.client || jb.isNew) && jb.start !== null && (it.cat !== 'training' || jb.station))
    || !!(jb.move && jb.move.paid && it && jbMovePriceChanged());   // оплаченную запись с другой ценой не переносим
}

async function jbSubmit() {
  if (!jb) return;
  if (jb.move) { jbSubmitMove(); return; }
  const group = jb.group || null;
  const it = group || jbItem();
  const notes = document.getElementById('jb-notes').value.trim();
  const data = group
    ? { slot_id: group.id, station_id: jb.station, notes: notes }
    : {
      library_id: jb.item, specialist_id: jb.spec, date: jb.date, start: minToTime(jb.start), duration: jb.dur,
      station_id: it.cat === 'training' ? jb.station : null, notes: notes,
    };
  if (jb.client) data.user_id = jb.client.id;
  else {
    data.new_client = {
      name: document.getElementById('jb-new-name').value.trim(),
      phone: document.getElementById('jb-new-phone').value.trim(),
    };
    if (!data.new_client.name) { showToast('Укажите имя клиента', 'error'); return; }
    if (data.new_client.phone.replace(/\D+/g, '').length < 10) { showToast('Укажите телефон клиента (не меньше 10 цифр)', 'error'); return; }
  }
  const btn = document.getElementById('jb-submit');
  btn.disabled = true; btn.textContent = 'Записываем...';
  const isNew = !jb.client, name = jb.client ? jb.client.name : data.new_client.name, start = group ? group.from : jb.start;
  try {
    if (group) await BookingsAPI.createFor(data); else await IndividualAPI.create(data);
  } catch (e) {
    // Ошибка показана в apiRequest (время или станок могли занять) — обновляем свободное время
    btn.textContent = 'Записать';
    if (jb && !group) jbLoadTimes();
    return;
  }
  jbClose();
  showToast(name + ' записан: ' + it.name + ' в ' + minToTime(start), 'success');
  await Promise.allSettled([jrLoad(), loadSlots(jrDate, jrDate), isNew ? loadClients() : Promise.resolve()]);
  renderJournal();
  if (group) jrOpenSlot(group.id);   // обратно в карточку тренировки — с новым клиентом в списке
}

async function jbSubmitMove() {
  const it = jbItem(), mine = jb;
  const btn = document.getElementById('jb-submit');
  btn.disabled = true; btn.textContent = 'Переносим...';
  try {
    await IndividualAPI.move({
      booking_id: jb.move.bookingId, date: jb.date, start: minToTime(jb.start), duration: jb.dur,
      specialist_id: jb.spec, station_id: it.cat === 'training' ? jb.station : null,
    });
  } catch (e) {
    // Ошибка показана в apiRequest (время или станок могли занять) — обновляем свободное время
    btn.textContent = 'Перенести';
    if (jb === mine) jbLoadTimes();
    return;
  }
  const d = parseLocalDate(mine.date);
  jbClose();
  showToast(mine.client.name + ': запись перенесена на ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(mine.start), 'success');
  await jrLoad();
  renderJournal();
}
