// Сайт: экран «Расписание» — неделя выбранного филиала: групповые тренировки из расписания и свои записи клиента
// (тренировки и услуги). Вид (владелец 09.10.2026): дни недели колонками, занятия дня — карточками подряд по времени,
// без сетки по часам и пустых строк; прошедшее — серым. Групповая тренировка — кнопка «Записаться» в карточке.
// Нажатие на свою запись открывает карточку с действиями «Перенести» и «Отменить запись».
// Кнопка «Свободная запись» над сеткой открывает форму записи на индивидуальную тренировку (персональную или
// самостоятельную): тренировка → тренер или длительность → день → свободное время → станок. Это та же форма, что
// у администратора в журнале записи и при переносе (js/admin/journal-book.js, jb.self), без выбора клиента.
// На телефоне вместо сетки — лента дней и список выбранного дня (trDayListHtml).
// Без входа экран показывает расписание; запись — после входа.

// ═══ TRAININGS ════════════════════════════════════════════════════

let trDayIdx = null;    // день для вида «один день» на телефоне (0 = Пн); null — по умолчанию для недели
let trWeekStart = (function () {
  const d = new Date(today);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
})();

function trChangeWeek(dir) {
  trWeekStart = new Date(trWeekStart);
  trWeekStart.setDate(trWeekStart.getDate() + dir * 7);
  trDayIdx = null;
  renderTrainings();
}
function trToday() {
  const d = new Date(today);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  trWeekStart = d;
  trDayIdx = null;
  renderTrainings();
}
function trSelectDay(i) { trDayIdx = i; renderTrainings(); }

// Активные записи клиента в филиале за даты [from; to] (YYYY-MM-DD)
function trMyBookings(locId, from, to) {
  if (!currentUser) return [];
  return bookings.filter(function (b) {
    return b.clientId === currentUser.id && b.status === 'booked' && b.location_id === locId && b.date >= from && b.date <= to;
  });
}

function renderTrainings() {
  renderSchLoc();
  const grid = document.getElementById('tr-grid');
  const loc = schLoc();
  if (!grid || !loc) return;
  const locId = Number(loc.id);

  const weekEnd = new Date(trWeekStart); weekEnd.setDate(trWeekStart.getDate() + 6);
  const s0 = trWeekStart;
  document.getElementById('tr-month').textContent = s0.getMonth() === weekEnd.getMonth()
    ? s0.getDate() + ' – ' + weekEnd.getDate() + ' ' + MONTHS_RU[s0.getMonth()] + ' ' + s0.getFullYear()
    : s0.getDate() + ' ' + MONTHS_RU[s0.getMonth()] + ' – ' + weekEnd.getDate() + ' ' + MONTHS_RU[weekEnd.getMonth()] + ' ' + s0.getFullYear();

  // Что в сетке: свои записи и групповые тренировки расписания (кроме тех, на которые клиент уже записан —
  // они показаны как свои записи)
  const mine = trMyBookings(locId, fmtLocalDate(trWeekStart), fmtLocalDate(weekEnd));
  const mineSlots = new Set(mine.map(function (b) { return Number(b.slotId); }));
  const slots = SLOTS.filter(function (s) {
    return s.date >= trWeekStart && s.date <= weekEnd && Number(s.location_id) === locId && !mineSlots.has(Number(s.id));
  });
  const items = mine.map(function (b) {
    return { id: 'b' + b.id, time: b.time, dur: b.dur, di: Math.round((parseLocalDate(b.date) - trWeekStart) / 86400000), b: b };
  }).concat(slots.map(function (s) {
    return { id: 's' + s.id, time: s.time, dur: s.dur, di: s.dayOfWeek, s: s };
  }));

  document.getElementById('tr-hint').textContent = !currentUser ? 'Войдите, чтобы записаться и видеть свои записи.'
    : !items.length ? 'На этой неделе тренировок и записей нет.' : '';

  // Дни колонками: заголовок дня и его занятия карточками подряд (по времени начала)
  let h = '';
  const strip = [];
  for (let di = 0; di < 7; di++) {
    const d = new Date(trWeekStart); d.setDate(trWeekStart.getDate() + di);
    const isToday = d.getTime() === today.getTime(), isPast = d < today;
    const dayItems = items.filter(function (x) { return x.di === di; })
      .sort(function (a, b) { return timeToMin(a.time) - timeToMin(b.time); });
    // mark — в этот день у клиента есть записи (отметка в ленте дней на телефоне)
    strip.push({ date: d, muted: isPast, mark: dayItems.some(function (x) { return x.b; }) });
    h += '<div class="sch-day' + (isToday ? ' today' : '') + (isPast ? ' past' : '') + '">'
      + '<div class="sch-day-hdr"><b>' + DAYS_RU[di] + '</b> ' + d.getDate() + ' ' + MONTHS_RU[d.getMonth()] + '</div>'
      + (dayItems.length
        ? dayItems.map(function (x) { return x.b ? trMineCardHtml(x.b) : trSlotCardHtml(x.s); }).join('')
        : '<div class="sch-day-empty">Занятий нет</div>')
      + '</div>';
  }
  grid.innerHTML = h;
  if (trDayIdx === null) trDayIdx = wgDefaultDay(trWeekStart);
  wgRenderDayStrip('tr-days', grid, strip, trDayIdx, 'trSelectDay');
  // На телефоне вместо сетки — список выбранного дня (css/week-grid.css: .sch-list, @media max-width 700px)
  document.getElementById('tr-day-list').innerHTML = trDayListHtml(trDayIdx, items);
}

// Список выбранного дня (телефон): по времени — свои записи золотыми строками (нажатие — карточка записи)
// и групповые тренировки расписания с кнопкой записи
function trDayListHtml(di, items) {
  const rows = items.filter(function (x) { return x.di === di; })
    .sort(function (a, b) { return timeToMin(a.time) - timeToMin(b.time); })
    .map(function (x) { return x.b ? trMineRowHtml(x.b) : schListRowHtml(x.s, false); }).join('');
  return rows || '<div class="sch-list-empty">' + (currentUser ? 'В этот день тренировок и записей нет' : 'В этот день тренировок нет') + '</div>';
}

// ═══ СВОБОДНАЯ ЗАПИСЬ: индивидуальная тренировка (персональная с тренером или самостоятельная) ═══

// Форма записи клиента — та же, что в журнале администратора (js/admin/journal-book.js), в режиме jb.self:
// клиент — сам вошедший, день выбирается в форме в пределах окна записи. Свободное время и станки считает сервер
async function trOpenFree() {
  if (!currentUser) { openAuth('login'); showToast('Войдите, чтобы записаться'); return; }
  const loc = schLoc();
  if (!loc) return;
  // Варианты берём свежие: тренировки, тренеров и длительности могли поменять
  let opts;
  try { opts = await IndividualAPI.options(loc.id); } catch (e) { return; }
  const items = opts.items.filter(function (i) { return i.cat === 'training'; });
  if (!items.length) { showToast('В этом филиале пока нет индивидуальных тренировок', 'error'); return; }
  const max = parseLocalDate(opts.today);
  max.setDate(max.getDate() + opts.horizon_days);
  jb = {
    self: true, locId: Number(loc.id), date: opts.today, maxDate: fmtLocalDate(max), items: items, step: opts.step,
    fixedSpec: null, wantStart: null, wantStation: null, item: null, spec: null, dur: null, start: null, station: null,
    client: { id: currentUser.id, name: currentUser.name }, isNew: false, times: null, message: '', hall: null,
  };
  jbBuildModal(loc);
  jbPick(items[0].id);
}

// Своя запись строкой списка дня — золотая, как блок в сетке
function trMineRowHtml(b) {
  const meta = [b.specialist, b.station, b.price.toLocaleString('ru') + ' ₽'].filter(Boolean).map(escAttr).join(' · ');
  return '<div class="sch-row sch-row--mine" onclick="trOpenBooking(' + b.id + ')">'
    + '<div class="sch-row-time">' + b.time + '<span>' + fmtDurShort(b.dur) + '</span></div>'
    + '<div class="sch-row-info"><div class="sch-row-name">✓ ' + escAttr(b.service) + '</div><div class="sch-row-meta">' + meta + '</div></div></div>';
}

// Карточка групповой тренировки в колонке дня: время и длительность, название, тренер и цена, свободные места,
// кнопка записи. Мест нет или занятие уже началось — серая, без кнопки; нажатие открывает описание занятия
function trSlotCardHtml(s) {
  const closed = slotStarted(s);
  const off = closed || slotFree(s) <= 0;
  const meta = [s.specialist, s.price > 0 ? s.price.toLocaleString('ru') + ' ₽' : ''].filter(Boolean).map(escAttr).join(' · ');
  return '<div class="sch-card ' + colorClass(s.cat, s.type) + (off ? ' is-off' : '') + '" onclick="' + (off ? 'openSlotDetail(' : 'openBookingModal(') + s.id + ')">'
    + '<div class="sch-card-time">' + s.time + '<span>' + fmtDurShort(s.dur) + '</span></div>'
    + '<div class="sch-card-name">' + escAttr(s.name) + '</div>'
    + (meta ? '<div class="sch-card-meta">' + meta + '</div>' : '')
    + (off ? '<div class="sch-card-state">' + (closed ? SLOT_CLOSED : 'Мест нет') + '</div>'
      : '<div class="sch-card-meta">' + slotFree(s) + ' из ' + slotCap(s) + ' мест</div>'
        + '<button class="btn-primary btn-sm u-w-full u-mt-6" onclick="event.stopPropagation();openBookingModal(' + s.id + ')">Записаться</button>')
    + '</div>';
}

// Своя запись в колонке дня — тёмная карточка (--mine); прошедшая — серая. Нажатие — карточка записи (перенос, отмена)
function trMineCardHtml(b) {
  const meta = [b.specialist, b.station, b.price.toLocaleString('ru') + ' ₽'].filter(Boolean).map(escAttr).join(' · ');
  return '<div class="sch-card sch-card--mine' + (cpCanMove(b) ? '' : ' is-off') + '" onclick="trOpenBooking(' + b.id + ')">'
    + '<div class="sch-card-time">' + b.time + '<span>' + fmtDurShort(b.dur) + '</span></div>'
    + '<div class="sch-card-name">' + escAttr(b.service) + '</div>'
    + (meta ? '<div class="sch-card-meta">' + meta + '</div>' : '')
    + '<div class="sch-card-state">✓ Вы записаны</div>'
    + '</div>';
}

// ═══ КАРТОЧКА СВОЕЙ ЗАПИСИ: что, когда, с кем, цена; перенос и отмена ═══

function trOpenBooking(id) {
  const b = bookings.find(function (x) { return Number(x.id) === id; });
  if (!b) return;
  trCloseBooking();
  const d = parseLocalDate(b.date);
  const when = DAYS_FULL[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + b.time + '–' + minToTime(timeToMin(b.time) + b.dur);
  // Кто ведёт: у тренировки — «тренер Анна К.», у услуги — имя специалиста (как в журнале записи)
  const who = b.specialist ? (b.cat === 'training' ? 'тренер ' : '') + b.specialist : '';
  const loc = siteLocName(b.location_id);
  // Станок — той же плиткой, что на схеме зала (stationHtml, js/site/booking.js), в виде свободного станка; не нажимается
  const station = b.station ? stationHtml({ label: b.station, icon: b.stationIcon }, 'free', 'disabled') : '';
  const can = cpCanMove(b);   // занятие ещё не началось
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'tr-card';
  el.innerHTML = '<div class="admin-modal u-max-w-560">'
    + (loc ? '<div class="u-text-small u-strong u-muted u-mb-4">' + escAttr(loc) + '</div>' : '')
    + '<div class="admin-modal-title u-mb-12">' + escAttr(b.service) + '</div>'
    + '<div class="u-flex u-items-center u-gap-14 u-mb-12">' + station
    + '<div class="u-text-body u-lh-tight"><div>' + escAttr(when) + '</div>' + (who ? '<div class="u-muted">' + escAttr(who) + '</div>' : '') + '</div></div>'
    + '<div class="ind-total">' + b.price.toLocaleString('ru') + ' ₽ · ' + (b.paymentStatus === 'paid' ? 'оплачено' : 'не оплачено') + '</div>'
    + (can ? '' : '<div class="ind-hint">Занятие уже началось или прошло.</div>')
    + '<div class="admin-modal-actions"><button class="btn-ghost" onclick="trCloseBooking()">Закрыть</button>'
    + (can ? '<button class="btn-danger" onclick="trCancelBooking(' + b.id + ')">Отменить запись</button>'
      + '<button class="btn-primary" onclick="trMoveBooking(' + b.id + ')">Перенести</button>' : '')
    + '</div></div>';
  document.body.appendChild(el);
}

function trCloseBooking() {
  const el = document.getElementById('tr-card'); if (el) el.remove();
}

function trMoveBooking(id) {
  trCloseBooking();
  cpMoveBooking(id);
}

async function trCancelBooking(id) {
  if (!await uiConfirm('Отменить запись?')) return;
  try { await BookingsAPI.setStatus(id, 'cancelled'); } catch (e) { return; }   // ошибка показана в apiRequest
  trCloseBooking();
  // Слоты — заново: у групповой тренировки освободилось место, индивидуальное занятие снято целиком
  await Promise.allSettled([loadMyBookings(), loadSlots()]);
  renderSitePages();
  showToast('Запись отменена');
}
