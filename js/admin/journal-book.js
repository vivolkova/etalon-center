// Админка: запись клиента из журнала (клиент звонит по телефону).
// Открывается нажатием на свободное время доски (js/admin/journal.js jrFreeClick):
//   в зале — индивидуальная тренировка (персональная / самостоятельная), станок и время подставлены;
//   в колонке специалиста — услуга открытой вкладки журнала (байкфит, массаж…), которую он оказывает.
// Из карточки групповой тренировки (нажатие на свободный станок схемы зала, jbOpenGroup) — запись на неё:
//   занятие, время и станок уже заданы, выбирается только клиент.
// Из карточки индивидуальной записи (кнопка «Перенести», jbOpenMove) — перенос: та же форма с текущими значениями;
//   клиент и занятие не меняются, выбираются день, время, длительность, специалист и станок (api/individual.php move).
// Из карточки групповой тренировки (кнопка «Перенести» у клиента, jbOpenGroupMove) — перенос записи на групповую:
//   другой станок или другая групповая тренировка этого филиала в любой день (api/bookings.php move).
// Клиент — из базы (поиск по номеру телефона) или новый: имя и телефон, создаётся вместе с записью
// без личного кабинета (middleware/booking_client.php). Один телефон — один клиент.
// Свободное время и станки считает сервер (api/individual.php: times, stations), он же всё перепроверяет при записи.
// На администратора не действует окно записи клиента (не позже чем за N минут, не дальше M дней).
// Эта же форма у клиента (jb.self = true — блока «Клиент» нет, день выбирается в форме в пределах окна записи,
// после действия обновляются экраны клиента):
//   «Свободная запись» на экране «Расписание» (js/site/trainings.js trOpenFree) — запись на индивидуальную тренировку;
//   перенос своей записи из карточки записи и из кабинета (js/client/panel.js cpMoveBooking).

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
    + '<div class="admin-modal-title">' + (jbIsMove() ? 'Перенос записи' : jb.self ? 'Свободная запись' : 'Запись клиента') + '</div>'
    + '<div class="jr-card-sub" id="jb-sub"></div>'
    + (jb.self ? '' : '<div class="form-field"><label class="form-label">Клиент</label><div id="jb-client"></div></div>')
    + '<div id="jb-body"></div>'
    + (jbIsMove() ? '' : '<div class="form-field"><label class="form-label">Комментарий</label><textarea class="form-input form-textarea" id="jb-notes" rows="1"></textarea></div>')
    + '<div class="ind-total" id="jb-total"></div>'
    + '<div class="admin-modal-actions"><button class="btn-ghost" onclick="jbClose()">Отмена</button>'
    + '<button class="btn-primary" id="jb-submit" onclick="jbSubmit()">' + jbSubmitLabel() + '</button></div></div>';
  document.body.appendChild(el);
  const d = parseLocalDate(jb.date);
  const day = DAYS_FULL[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()];
  // При переносе под заголовком — что переносим (день в форме можно поменять)
  const was = jb.move || jb.gmove;
  document.getElementById('jb-sub').textContent = was
    ? 'Сейчас: ' + day + ', ' + minToTime(was.from) + '–' + minToTime(was.to) + ' · ' + loc.name
    : jb.self ? loc.name : day + ' · ' + loc.name;   // клиент выбирает день в самой форме
}
function jbIsMove() { return !!(jb && (jb.move || jb.gmove)); }
function jbSubmitLabel() { return jbIsMove() ? 'Перенести' : jb.self ? 'Записаться' : 'Записать'; }

// Перенос записи на групповую тренировку из её карточки: та же форма. Клиент задан; выбираются день, тренировка
// (любая групповая этого филиала в выбранный день) и станок на схеме зала выбранной тренировки.
// Комментарий и отметка об оплате сохраняются
// ctx — перенос открыт не из журнала дня («Управление записями»): {loc — филиал, day — данные дня занятия (как jrData),
// after — что обновить после переноса}; без ctx — филиал и день журнала
async function jbOpenGroupMove(slotId, bookingId, ctx) {
  const loc = ctx ? ctx.loc : jrLoc();
  const day = ctx ? ctx.day : jrData;
  const slot = day && day.slots.find(function (x) { return x.id === slotId; });
  const b = slot && slot.bookings.find(function (x) { return x.id === bookingId; });
  if (!loc || !slot || !b) return;
  jb = {
    gmove: { bookingId: b.id, slotId: slot.id, station: b.station_id, from: slot.from, to: slot.to, price: slot.price, paid: b.payment_status === 'paid' },
    after: ctx ? ctx.after : null,
    locId: Number(loc.id), date: day.date, items: [], item: null,
    client: { id: b.user_id, name: b.name, phone: b.phone }, isNew: false,
    slots: null, target: slot.id, station: b.station_id, hall: null,
  };
  const card = document.getElementById('jr-slot-modal'); if (card) card.remove();
  jbBuildModal(loc);
  jbRenderClient();
  jbGroupMoveDay(jb.date);
}

// Групповые тренировки филиала в выбранный день — куда можно перенести
async function jbGroupMoveDay(date) {
  if (!jb || !jb.gmove || !date) return;
  jb.date = date; jb.slots = null; jb.hall = null;
  jbRenderBody();
  const req = ++jbReq, mine = jb;
  let list = [];
  try { list = (await SlotsAPI.list(date, date)) || []; } catch (e) { /* подпись в форме */ }
  if (jb !== mine || req !== jbReq) return;
  jb.slots = list.filter(function (x) { return Number(x.location_id) === jb.locId; })
    .map(function (x) {
      const from = timeToMin(x.start_time.slice(0, 5));
      return { id: Number(x.id), name: x.name, from: from, to: from + Number(x.duration), specialist: x.specialist_full || x.specialist_name || '', price: Number(x.price) };
    })
    // клиенту — только тренировки, которые ещё не начались (своя текущая остаётся: на ней можно сменить станок)
    .filter(function (x) { return !jb.self || x.id === jb.gmove.slotId || new Date(date + 'T' + minToTime(x.from)) > new Date(); });
  // Остаёмся на той же тренировке, если она в этот день; иначе тренировку нужно выбрать
  if (!jb.slots.some(function (x) { return x.id === jb.target; })) jb.target = null;
  jbGroupMoveTarget(jb.target);
}

// Схема зала выбранной тренировки; свой текущий станок считаем свободным
async function jbGroupMoveTarget(slotId) {
  if (!jb || !jb.gmove) return;
  jb.target = slotId ? Number(slotId) : null;
  jb.hall = null;
  jb.station = jb.target === jb.gmove.slotId ? jb.gmove.station : null;
  jbRenderBody();
  if (!jb.target) return;
  const req = ++jbReq, mine = jb;
  let data = null;
  try { data = await StationsAPI.availability(jb.target); } catch (e) { /* подпись в форме */ }
  if (jb !== mine || req !== jbReq) return;
  if (data && jb.target === jb.gmove.slotId) {
    data.stations.forEach(function (st) { if (Number(st.id) === jb.gmove.station) st.state = 'free'; });
  }
  jb.hall = data || { stations: [], error: true };
  jbRenderBody();
}

function jbGroupMoveSlot() { return jb.slots ? jb.slots.find(function (x) { return x.id === jb.target; }) || null : null; }
// Что-то изменилось: другая тренировка или другой станок
function jbGroupMoveChanged() { return jb.target !== jb.gmove.slotId || jb.station !== jb.gmove.station; }

function jbRenderGroupMoveBody(field) {
  const t = jbGroupMoveSlot();
  let h = field('День', '<input type="date" class="form-input" required min="' + fmtLocalDate(today) + '" value="' + jb.date + '" onchange="jbGroupMoveDay(this.value)">');
  let pick;
  if (jb.slots === null) pick = '<div class="ind-hint">Загружаем тренировки…</div>';
  else if (!jb.slots.length) pick = '<div class="ind-hint">В этот день групповых тренировок нет</div>';
  else {
    pick = '<select class="form-input" required onchange="jbGroupMoveTarget(this.value)"><option value="">— выберите тренировку —</option>'
      + jb.slots.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === jb.target ? ' selected' : '') + '>'
          + escAttr([minToTime(x.from) + '–' + minToTime(x.to), x.name, x.specialist ? 'тренер ' + x.specialist : '', x.price.toLocaleString('ru') + ' ₽'].filter(Boolean).join(' · '))
          + (x.id === jb.gmove.slotId ? ' (сейчас)' : '') + '</option>';
      }).join('') + '</select>';
  }
  h += field('Тренировка', pick);
  if (t) h += field('Станок', '<div id="jb-hall" class="hall-scheme"></div><div class="station-hint" id="jb-hall-hint"></div>');
  document.getElementById('jb-body').innerHTML = h;

  const hall = document.getElementById('jb-hall');
  if (hall) {
    const hint = document.getElementById('jb-hall-hint');
    if (!jb.hall) hint.textContent = 'Загрузка схемы зала…';
    else if (jb.hall.error) hint.textContent = 'Не удалось загрузить схему зала';
    else {
      hallFill(hall, jb.hall, jb.station, 'jbSelectStation');
      const free = jb.hall.stations.filter(function (s) { return s.state === 'free'; }).length;
      hint.textContent = jb.station ? '' : free ? 'Свободно: ' + free + '. Выберите станок.' : 'Свободных станков нет';   // выбранный станок виден на схеме
    }
  }

  let total = '';
  if (t) {
    const d = parseLocalDate(jb.date);
    total = d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(t.from) + '–' + minToTime(t.to) + ' · ' + t.price.toLocaleString('ru') + ' ₽';
    if (t.price !== jb.gmove.price) {
      total += ' (было ' + jb.gmove.price.toLocaleString('ru') + ' ₽)' + (jb.gmove.paid ? '. Запись оплачена — перенос с другой ценой пока недоступен' : '');
    }
  }
  document.getElementById('jb-total').textContent = total;
  jbUpdateSubmit();
}

// Перенос индивидуальной записи из её карточки: та же форма с текущими значениями. Клиент и занятие заданы;
// выбираются день, время, длительность, специалист, станок. Комментарий и отметка об оплате сохраняются
async function jbOpenMove(slotId, ctx) {
  const loc = ctx ? ctx.loc : jrLoc();
  const day = ctx ? ctx.day : jrData;
  const slot = day && day.slots.find(function (x) { return x.id === slotId; });
  const b = slot && slot.bookings[0];
  if (!loc || !slot || !b) return;
  let opts;
  try { opts = await IndividualAPI.options(loc.id); } catch (e) { return; }
  const item = opts.items.find(function (i) { return i.id === slot.library_id; });
  if (!item) { showToast('Это занятие больше недоступно для записи — отмените запись и создайте новую', 'error'); return; }
  jb = {
    move: { bookingId: b.id, slotId: slot.id, from: slot.from, to: slot.to, price: slot.price, paid: b.payment_status === 'paid' },
    after: ctx ? ctx.after : null,
    locId: Number(loc.id), date: day.date, items: [item], step: opts.step, fixedSpec: null,
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

// ── Клиент: два переключателя — «Поиск по телефону» (клиент из базы) и «Новый клиент» ──
// Переключаться можно в любой момент: набранное в поиске и начатые данные нового клиента не теряются, пока форма
// открыта (jb.searchQ, jb.draft). В телефон нового клиента номер из поиска подставляется, только если он набран целиком и клиента с ним нет.
// При переносе записи клиент известен — переключателей нет
function jbRenderClient() {
  const box = document.getElementById('jb-client');
  if (!box) return;   // клиент переносит свою запись — блока «Клиент» нет
  if (jbIsMove()) {
    box.innerHTML = '<div class="jb-picked"><div><b>' + escAttr(jb.client.name) + '</b><span>' + escAttr(jb.client.phone || '') + '</span></div></div>';
    jbUpdateSubmit();
    return;
  }
  const d = jb.draft || (jb.draft = { first: '', last: '', phone: '', consents: [] });
  const sw = '<div class="filter-chips u-mb-10">'
    + '<button type="button" class="chip' + (jb.isNew ? '' : ' active') + '" onclick="jbSetNew(false)">Поиск по телефону</button>'
    + '<button type="button" class="chip' + (jb.isNew ? ' active' : '') + '" onclick="jbSetNew(true)">Новый клиент</button></div>';
  if (jb.isNew) {
    box.innerHTML = sw
      + '<div class="jb-new"><div><label class="form-label">Имя</label><input class="form-input" id="jb-new-name" required value="' + escAttr(d.first) + '"></div>'
      + '<div><label class="form-label">Фамилия</label><input class="form-input" id="jb-new-last" required value="' + escAttr(d.last) + '"></div>'
      + '<div><label class="form-label">Телефон</label><input class="form-input phone-input" id="jb-new-phone" required value="' + escAttr(d.phone) + '"></div></div>'
      + '<div id="jb-new-consents"></div>';
    jbConsentsFill();
  } else if (jb.client) {
    box.innerHTML = sw
      + '<div class="jb-picked"><div><b>' + escAttr(jb.client.name) + '</b><span>' + escAttr(jb.client.phone || '') + '</span></div>'
      + '<button class="btn-ghost jb-link" onclick="jbClearClient()">Изменить</button></div>';
  } else {
    box.innerHTML = sw
      + '<input class="form-input" id="jb-search" inputmode="tel" oninput="jbSearch(this.value)" autocomplete="off" value="' + escAttr(jb.searchQ || '') + '">'
      + '<div class="set-hint">Номер телефона — от трёх цифр, можно любую часть номера</div>'
      + '<div id="jb-results"></div>';
    jbSearch(jb.searchQ || '');
  }
  jbUpdateSubmit();
}
// Запомнить набранное в блоке «Клиент» перед тем, как его перерисовать
function jbClientRemember() {
  const v = function (id) { const el = document.getElementById(id); return el ? el.value : null; };
  const q = v('jb-search');
  if (q !== null) jb.searchQ = q.trim();
  if (v('jb-new-name') !== null) {
    jb.draft = {
      first: v('jb-new-name').trim(), last: v('jb-new-last').trim(), phone: v('jb-new-phone').trim(),
      consents: Array.from(document.querySelectorAll('#jb-new-consents [data-jb-consent]:checked')).map(function (el) { return el.getAttribute('data-jb-consent'); }),
    };
  }
}

// Согласия нового клиента: он пришёл в студию без записи и подписал документы — администратор отмечает подписанные,
// они сохраняются вместе с записью. Галочки необязательны: по звонку клиента записывают без них, а подписанное
// отмечают позже («Клиенты» → клиент → «Согласия»). Список документов берём с сервера один раз
let jbDocs = null;
async function jbConsentsFill() {
  if (!jbDocs) {
    try { jbDocs = ((await DocumentsAPI.list()) || []).filter(function (d) { return d.acceptance !== 'none'; }); }
    catch (e) { jbDocs = null; return; }
  }
  const box = document.getElementById('jb-new-consents');
  if (!box || !jbDocs.length) return;   // форму закрыли или сменили клиента, пока шёл запрос
  box.innerHTML = '<label class="form-label u-mt-12">Согласия</label>'
    + '<div class="set-hint">Отметьте документы, которые клиент подписал. Необязательно — можно отметить позже в карточке клиента</div>'
    + jbDocs.map(function (d) {
      return '<label class="check-label check-label--text u-mt-10"><input type="checkbox" data-jb-consent="' + d.code + '"' + (jb.draft && jb.draft.consents.indexOf(d.code) >= 0 ? ' checked' : '') + '>'
        + '<span><a class="u-brand" href="#doc/' + d.code + '" target="_blank" rel="noopener">' + escAttr(d.name) + '</a></span></label>';
    }).join('');
}

// Поиск идёт по списку клиентов, загруженному при открытии экрана (CLIENTS), — запросов к серверу при вводе нет
function jbSearch(q) {
  const box = document.getElementById('jb-results');
  jb.searchQ = q.trim();
  // Ищем только по номеру (поиск по имени пока не делаем), от трёх цифр; правило сравнения — phoneMatches (js/ui.js)
  if (q.replace(/\D+/g, '').length < 3) { box.innerHTML = ''; return; }
  const found = CLIENTS.filter(function (c) { return phoneMatches(c.phone, q); }).slice(0, 6);
  box.innerHTML = found.length
    ? found.map(function (c) {
      return '<button type="button" class="jb-result" onclick="jbSelectClient(' + c.id + ')"><b>' + escAttr(c.name) + '</b><span>' + escAttr(c.phone || '') + '</span></button>';
    }).join('')
    : '<div class="set-hint">Не найден — переключитесь на «Новый клиент»</div>';
}

function jbSelectClient(id) {
  jb.client = CLIENTS.find(function (c) { return c.id === id; }) || null;
  jb.isNew = false;
  jbRenderClient();
  jbLoadTimes();   // у выбранного клиента могут быть свои записи в это время
}
function jbClearClient() { jb.client = null; jbRenderClient(); jbLoadTimes(); }

// Переключатель: on — «Новый клиент», иначе «Поиск по телефону». Выбранный клиент при переходе к новому сбрасывается;
// номер из поиска подставляется в телефон нового клиента, только если набран целиком и не найден (см. ниже)
function jbSetNew(on) {
  if (on === jb.isNew) return;
  jbClientRemember();
  jb.isNew = on;
  if (on) {
    jb.client = null;
    const d = jb.draft || (jb.draft = { first: '', last: '', phone: '', consents: [] });
    // Поиск идёт по любой части номера, поэтому набранные цифры — ещё не телефон. Подставляем их, только если
    // номер набран целиком (10–11 цифр) и клиента с ним нет: тогда это и есть номер нового клиента
    const digits = (jb.searchQ || '').replace(/\D+/g, '');
    if (!d.phone && digits.length >= 10 && !CLIENTS.some(function (c) { return phoneMatches(c.phone, jb.searchQ); })) d.phone = maskPhone(jb.searchQ);
  }
  jbRenderClient();
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
  if (jb.group || jb.gmove) { jbUpdateSubmit(); return; }   // групповая тренировка: время задано занятием
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
  if (jb.gmove) { jbRenderGroupMoveBody(field); return; }
  const it = jbItem();
  const chips = function (list) { return '<div class="filter-chips">' + list.join('') + '</div>'; };
  let h = '';
  // День: при переносе — первым полем (меняют прежде всего его); при записи клиента — после выбора тренировки
  const dayField = !(jb.move || jb.self) ? '' : field('День', '<input type="date" class="form-input" required min="' + fmtLocalDate(today) + '"' + (jb.maxDate ? ' max="' + jb.maxDate + '"' : '') + ' value="' + jb.date + '" onchange="jbMoveDate(this.value)">');
  if (jb.items.length > 1) {
    // Занятие — выпадающим списком (и в журнале администратора, и в «Свободной записи» клиента)
    h += field(it.cat === 'training' ? 'Тренировка' : 'Услуга', '<select class="form-input" required onchange="jbPick(this.value)">' + jb.items.map(function (i) {
      return '<option value="' + i.id + '"' + (i.id === jb.item ? ' selected' : '') + '>' + escAttr(i.name) + '</option>';
    }).join('') + '</select>');
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

  if (!jb.move) h = h + dayField; else h = dayField + h;

  // Время начала
  let time;
  if (jb.times === null) time = '<div class="ind-hint">Ищем свободное время…</div>';
  else if (!jb.times.length) time = '<div class="ind-hint">' + escAttr(jb.message || 'Свободного времени нет') + '</div>';
  else {
    time = '<select class="form-input" required onchange="jbSelectStart(this.value)"><option value="">— выберите время —</option>'
      + jb.times.map(function (m) { return '<option value="' + minToTime(m) + '"' + (m === jb.start ? ' selected' : '') + '>' + minToTime(m) + '–' + minToTime(m + jb.dur) + '</option>'; }).join('')
      + '</select>';
    if (jb.start === null && jb.wantStart !== null) {
      time += '<div class="ind-hint">На ' + minToTime(jb.wantStart) + (jb.move ? ' перенести' : ' записать') + ' нельзя (занято или не работает) — выберите другое время</div>';
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
      hint.textContent = jb.station ? '' : free ? 'Свободно: ' + free + '. Выберите станок.' : 'Свободных станков нет';   // выбранный станок виден на схеме
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
  if (jb.gmove) {
    // выбраны тренировка и станок, что-то изменилось; оплаченную запись на тренировку с другой ценой не переносим
    const t = jbGroupMoveSlot();
    btn.disabled = !(t && jb.station && jbGroupMoveChanged()) || (jb.gmove.paid && t.price !== jb.gmove.price);
    return;
  }
  const it = jb.item ? jbItem() : null;
  btn.disabled = !(it && (jb.client || jb.isNew) && jb.start !== null && (it.cat !== 'training' || jb.station))
    || !!(jb.move && jb.move.paid && it && jbMovePriceChanged());   // оплаченную запись с другой ценой не переносим
}

async function jbSubmit() {
  if (!jb) return;
  if (jb.move) { jbSubmitMove(); return; }
  if (jb.gmove) { jbSubmitGroupMove(); return; }
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
      first_name: document.getElementById('jb-new-name').value.trim(),
      last_name: document.getElementById('jb-new-last').value.trim(),
      phone: document.getElementById('jb-new-phone').value.trim(),
      consents: Array.from(document.querySelectorAll('#jb-new-consents [data-jb-consent]:checked')).map(function (el) { return el.getAttribute('data-jb-consent'); }),
    };
    if (!data.new_client.first_name || !data.new_client.last_name) { showToast('Укажите имя и фамилию клиента', 'error'); return; }
    if (data.new_client.phone.replace(/\D+/g, '').length < 10) { showToast('Укажите телефон клиента (не меньше 10 цифр)', 'error'); return; }
  }
  // Администратор может записать клиента и на начавшееся или прошедшее занятие (клиент пришёл без записи) —
  // но переспрашиваем: так не запишут по ошибке не в тот день
  if (!jb.self) {
    const begins = group ? group.from : jb.start, day = parseLocalDate(jb.date);
    if (new Date(jb.date + 'T' + minToTime(begins)) <= new Date()
      && !await uiConfirm('Занятие уже началось или прошло. Записать клиента?',
        it.name + ' — ' + day.getDate() + ' ' + MONTHS_FULL[day.getMonth()] + ' в ' + minToTime(begins))) return;
    if (!jb) return;   // пока отвечали на вопрос, форму закрыли
  }
  const btn = document.getElementById('jb-submit');
  btn.disabled = true; btn.textContent = 'Записываем...';
  const isNew = !jb.client, name = jb.client ? jb.client.name : (data.new_client.first_name + ' ' + data.new_client.last_name).trim(), start = group ? group.from : jb.start;
  const self = jb.self, date = jb.date;
  try {
    if (group) await BookingsAPI.createFor(data); else await IndividualAPI.create(data);
  } catch (e) {
    // Ошибка показана в apiRequest (время или станок могли занять) — обновляем свободное время
    btn.textContent = jbSubmitLabel();
    if (jb && !group) jbLoadTimes();
    return;
  }
  jbClose();
  if (self) {
    // клиент записал себя: его записи и экраны сайта — заново
    const d = parseLocalDate(date);
    showToast('Вы записаны: ' + it.name + ', ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ' в ' + minToTime(start), 'success');
    await cpAfterMove();
    return;
  }
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
  showToast((mine.self ? 'Запись перенесена на ' : mine.client.name + ': запись перенесена на ') + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(mine.start), 'success');
  if (mine.self) { await cpAfterMove(); return; }
  if (mine.after) { await mine.after(); return; }   // перенос из «Управления записями» — обновить его список
  await jrLoad();
  renderJournal();
}

async function jbSubmitGroupMove() {
  const mine = jb, t = jbGroupMoveSlot();
  const btn = document.getElementById('jb-submit');
  btn.disabled = true; btn.textContent = 'Переносим...';
  try {
    await BookingsAPI.move({ booking_id: jb.gmove.bookingId, slot_id: jb.target, station_id: jb.station });
  } catch (e) {
    // Ошибка показана в apiRequest (станок могли занять) — обновляем схему зала
    btn.textContent = 'Перенести';
    if (jb === mine) jbGroupMoveTarget(jb.target);
    return;
  }
  const d = parseLocalDate(mine.date), sameSlot = mine.target === mine.gmove.slotId;
  const st = mine.hall.stations.find(function (x) { return Number(x.id) === mine.station; });
  jbClose();
  const what = sameSlot ? 'станок изменён — ' + (st ? st.label : '')
    : 'запись перенесена на ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(t.from) + ' · ' + t.name;
  showToast(mine.self ? what[0].toUpperCase() + what.slice(1) : mine.client.name + ': ' + what, 'success');
  if (mine.self) { await cpAfterMove(); return; }
  if (mine.after) { await mine.after(); return; }   // перенос из «Управления записями» — обновить его список
  // Счётчики мест и недельное расписание берут данные из слотов — перечитываем и их
  await Promise.allSettled([jrLoad(), loadSlots(jrDate, jrDate)]);
  renderJournal();
  if (jrData && jrData.slots.some(function (x) { return x.id === mine.gmove.slotId; })) jrOpenSlot(mine.gmove.slotId);   // обратно в карточку
}
