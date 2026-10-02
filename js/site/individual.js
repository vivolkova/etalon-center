// Сайт: запись на услугу со специалистом (байкфит и т.п.) — окно «занятие → специалист → дата → свободное время».
// Здесь же варианты индивидуальной записи филиала (IND_OPTS) и цена занятия по длительности — общие с формой записи
// на индивидуальную тренировку (js/admin/journal-book.js: журнал администратора и «Свободная запись» клиента).
// Свободное время считает сервер (api/individual.php) по тем же правилам, что и занятия админки.

// ═══ INDIVIDUAL BOOKING ═══════════════════════════════════════════

let IND_OPTS = {};   // варианты по филиалам: { locId: {items, today, horizon_days, …} }
let ind = null;      // выбор в открытом окне: { locId, item, spec, dur, date, time, times, message }
let indTimesReq = 0; // номер последнего запроса времени (ответ на устаревший выбор отбрасываем)

// Варианты филиала (кешируются до перезагрузки страницы); сервер недоступен — null
async function indLoadOptions(locId) {
  if (!IND_OPTS[locId]) {
    try { IND_OPTS[locId] = await IndividualAPI.options(locId); }
    catch (e) { return null; }
  }
  return IND_OPTS[locId];
}

// Цена занятия выбранной длительности (сервер считает её для каждой длительности — prices; он же берёт её при записи)
function indPgPrice(it, dur) {
  const i = it.durations.indexOf(dur);
  return it.prices && i >= 0 ? it.prices[i] : it.price;
}

// Услуги филиала (всё, кроме тренировок)
function indSvcItems(locId) {
  const opts = IND_OPTS[locId];
  return opts ? opts.items.filter(function (i) { return i.cat !== 'training'; }) : [];
}

// Запись на услугу (карточка на странице «Услуги»)
async function openIndividual(itemId) {
  if (!currentUser) { openAuth('login'); showToast('Войдите, чтобы записаться'); return; }
  const loc = schLoc();
  if (!loc) return;
  const opts = await indLoadOptions(loc.id);
  const it = opts ? indSvcItems(loc.id).find(function (i) { return i.id === Number(itemId); }) : null;
  if (!it || !it.bookable) { showToast('На эту услугу сейчас нельзя записаться онлайн', 'error'); return; }
  ind = { locId: Number(loc.id), date: opts.today };
  indSelectItem(it.id);
  document.getElementById('ind-title').textContent = it.name;
  document.getElementById('ind-sub').textContent = [fmtDurShort(it.duration), it.price.toLocaleString('ru') + ' ₽', siteLocName(loc.id)].filter(Boolean).join(' · ');
  document.getElementById('ind-comment').value = '';
  document.getElementById('ind-modal').classList.add('show');
}

function closeIndividual() {
  document.getElementById('ind-modal').classList.remove('show');
  ind = null;
}

function indItem() { return IND_OPTS[ind.locId].items.find(function (i) { return i.id === ind.item; }); }

// Выбор занятия: специалист — первый из списка, длительность — минимальная
function indSelectItem(id) {
  ind.item = Number(id);
  const it = indItem();
  ind.spec = it.needs_specialist && it.specialists.length ? it.specialists[0].id : null;
  ind.dur = it.durations[0];
  indChanged();
}
function indSelectSpec(id) { ind.spec = Number(id); indChanged(); }
function indSelectDur(m) { ind.dur = Number(m); indChanged(); }
function indSelectDate(d) { ind.date = d; indChanged(); }
function indSelectTime(t) { ind.time = t; indRender(); }

// Изменился выбор — время сбрасываем и запрашиваем заново
async function indChanged() {
  ind.time = null; ind.times = null; ind.message = '';
  indRender();
  const req = ++indTimesReq;
  let res;
  try {
    res = await IndividualAPI.times({ library_id: ind.item, specialist_id: ind.spec, date: ind.date, duration: ind.dur });
  } catch (e) {
    res = { times: [], message: e.message || 'Не удалось загрузить свободное время' };
  }
  if (!ind || req !== indTimesReq) return;
  ind.times = res.times; ind.message = res.message;
  indRender();
}

function indChip(label, active, onclick, cls) {
  return '<button type="button" class="chip' + (cls ? ' ' + cls : '') + (active ? ' active' : '') + '" onclick="' + onclick + '">' + label + '</button>';
}

function indRender() {
  if (!ind) return;
  const opts = IND_OPTS[ind.locId];
  const it = indItem();
  let h = '';

  // Специалист / длительность
  if (it.needs_specialist) {
    h += '<div class="form-field"><label class="form-label">Специалист</label><div class="filter-chips">'
      + it.specialists.map(function (s) { return indChip(escAttr(s.full_name || s.name), s.id === ind.spec, 'indSelectSpec(' + s.id + ')'); }).join('')
      + '</div></div>';
  }
  if (it.durations.length > 1) {
    h += '<div class="form-field"><label class="form-label">Длительность</label><div class="filter-chips">'
      + it.durations.map(function (m) { return indChip(fmtDurShort(m), m === ind.dur, 'indSelectDur(' + m + ')'); }).join('')
      + '</div></div>';
  }

  // Дата: от сегодня до горизонта записи
  const start = parseLocalDate(opts.today);
  let dates = '';
  for (let i = 0; i <= opts.horizon_days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = fmtLocalDate(d);
    dates += indChip('<span class="ind-dow">' + DAYS_RU[(d.getDay() + 6) % 7] + '</span>' + d.getDate() + ' ' + MONTHS_RU[d.getMonth()],
      key === ind.date, 'indSelectDate(\'' + key + '\')', 'ind-date');
  }
  h += '<div class="form-field"><label class="form-label">Дата</label><div class="ind-dates" id="ind-dates">' + dates + '</div></div>';

  // Время
  h += '<div class="form-field"><label class="form-label">Время начала</label>';
  if (ind.times === null) h += '<div class="ind-hint">Ищем свободное время…</div>';
  else if (!ind.times.length) h += '<div class="ind-hint">' + escAttr(ind.message || 'Свободного времени нет') + '. Выберите другую дату' + (it.needs_specialist && it.specialists.length > 1 ? ' или специалиста' : '') + '.</div>';
  else h += '<div class="filter-chips">' + ind.times.map(function (t) { return indChip(t, t === ind.time, 'indSelectTime(\'' + t + '\')'); }).join('') + '</div>';
  h += '</div>';

  // Сохраняем прокрутку ленты дат при перерисовке
  const oldStrip = document.getElementById('ind-dates');
  const scroll = oldStrip ? oldStrip.scrollLeft : 0;
  document.getElementById('ind-body').innerHTML = h;
  const strip = document.getElementById('ind-dates');
  if (strip) strip.scrollLeft = scroll;

  // Итог и кнопка
  const sum = document.getElementById('ind-total');
  const d = parseLocalDate(ind.date);
  sum.textContent = ind.time
    ? d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + ind.time + '–' + minToTime(timeToMin(ind.time) + ind.dur) + ' · ' + it.price.toLocaleString('ru') + ' ₽'
    : '';
  document.getElementById('ind-submit').disabled = !ind.time;
}

// 90 -> «1 ч 30 мин», 60 -> «1 ч», 45 -> «45 мин»
function fmtDurShort(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return (h ? h + ' ч' : '') + (h && r ? ' ' : '') + (r ? r + ' мин' : '');
}

async function confirmIndividual() {
  if (!ind || !ind.time) return;
  const btn = document.getElementById('ind-submit');
  btn.disabled = true; btn.textContent = 'Записываем...';
  const it = indItem();
  const date = ind.date, time = ind.time;
  try {
    await IndividualAPI.create({
      library_id: ind.item, specialist_id: ind.spec, date: date, start: time, duration: ind.dur,
      notes: document.getElementById('ind-comment').value.trim(),
    });
    closeIndividual();
    // Новая запись — в «Моих записях» (и в загруженных слотах — для карточки занятия)
    await Promise.allSettled([loadSlots(), loadMyBookings()]);
    const d = parseLocalDate(date);
    showToast('Вы записаны: ' + it.name + ', ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ' в ' + time, 'success');
  } catch (e) {
    // Ошибка уже показана в apiRequest (время могли занять) — обновляем свободное время
    if (ind) indChanged();
  } finally {
    btn.textContent = 'Записаться →';
    if (ind) btn.disabled = !ind.time;
  }
}
