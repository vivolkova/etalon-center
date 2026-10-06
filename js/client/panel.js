// Кабинет клиента: лента, мои записи

// ═══ CLIENT PANEL ══════════════════════════════════════════════════

let cpBookingFilter_val = 'all';

function renderClientPanel() {
  if (!currentUser) return;
  if (!document.getElementById('cp-user-avatar')) return;
  // Sidebar user info
  const av = clientAvatarColor(currentUser.name);
  const init = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const el = document.getElementById('cp-user-avatar');
  el.style.background = av + '20'; el.style.color = av; el.textContent = init;
  document.getElementById('cp-user-name').textContent = currentUser.name;
  document.getElementById('cp-user-phone').textContent = currentUser.phone || '';
  const badge = document.getElementById('cp-user-badge');
  badge.className = 'cp-user-badge c-badge ' + (currentUser.type || 'new');
  badge.textContent = { new: 'Новый', regular: 'Постоянный', vip: 'VIP' }[currentUser.type || 'new'] || 'Новый';

  renderClientFeed();
}

function switchClientTab(name, el) {
  document.querySelectorAll('.cp-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.cp-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('cp-' + name).classList.add('active');
  if (name === 'mybookings') renderCpBookings();
  if (name === 'profile') renderProfileForm();
}

// ── FEED ──────────────────────────────────────────────────────────
// Ближайшие занятия: расписание выбранного филиала на несколько дней вперёд, по дням. Список считает сервер
// (api/slots.php?action=upcoming): только то, что ещё не началось и куда есть места, плюс занятия, на которые
// клиент уже записан. Свежие занятия кладём и в SLOTS — карточка занятия и окно записи берут их оттуда
let feedSeq = 0;   // номер запроса: ответ на устаревший запрос (сменили филиал, вышли) не показываем
async function renderClientFeed() {
  const box = document.getElementById('feed-slots');
  const loc = schLoc();
  if (!box || !loc || !currentUser) return;
  const seq = ++feedSeq;
  let res;
  try { res = await SlotsAPI.upcoming(loc.id); } catch (e) { return; }
  if (seq !== feedSeq || !currentUser) return;

  const mine = new Set(res.slots.filter(function (r) { return Number(r.booked); }).map(function (r) { return r.id; }));
  const list = res.slots.map(slotFromRow);
  list.forEach(function (s) {
    const i = SLOTS.findIndex(function (x) { return x.id === s.id; });
    if (i >= 0) SLOTS[i] = s; else SLOTS.push(s);
  });
  if (!list.length) {
    box.innerHTML = '<div class="u-muted u-text-ui u-py-16">В ближайшие ' + res.days + ' дн. занятий нет</div>';
    return;
  }
  const today = parseLocalDate(res.today);
  let day = '', h = '';
  list.forEach(function (s) {
    const key = fmtLocalDate(s.date);
    if (key !== day) {
      day = key;
      const diff = Math.round((s.date - today) / 86400000);
      h += '<div class="u-text-small u-bold u-muted' + (h ? ' u-mt-12' : '') + '">'
        + (diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : DAYS_FULL[s.dayOfWeek]) + ', ' + s.date.getDate() + ' ' + MONTHS_FULL[s.date.getMonth()] + '</div>';
    }
    const booked = mine.has(s.id);
    h += '<div class="cp-slot-row u-pointer" onclick="openSlotDetail(' + s.id + ')">'
      + '<div class="cp-slot-time">' + s.time + '</div>'
      + '<div class="cp-slot-info"><div class="cp-slot-name">' + escAttr(s.name) + '</div>'
      + '<div class="cp-slot-meta"><svg class="ico-inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>' + escAttr(s.specialist) + ' · ' + s.dur + ' мин' + (slotUsesHall(s.cat) ? ' · ' + slotFree(s) + ' мест' : '') + '</div></div>'
      + '<div class="u-bold u-brand u-text-ui">' + s.price.toLocaleString('ru') + ' ₽</div>'
      + (booked ? '<button class="btn-primary u-text-small is-booked-ok" onclick="event.stopPropagation()">✓ Вы записаны</button>'
        : '<button class="btn-primary u-text-small" onclick="event.stopPropagation();openBookingModal(' + s.id + ')">Записаться</button>')
      + '</div>';
  });
  box.innerHTML = h;
}

// ── MY BOOKINGS ───────────────────────────────────────────────────
function cpBookingFilter(val, btn) {
  cpBookingFilter_val = val;
  document.querySelectorAll('#cp-booking-filters .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderCpBookings();
}

function renderCpBookings() {
  const list = document.getElementById('cp-bookings-list');
  let mine = bookings.filter(b => b.clientId === currentUser?.id);
  if (cpBookingFilter_val !== 'all') mine = mine.filter(b => b.status === cpBookingFilter_val);
  if (!mine.length) {
    list.innerHTML = `<div class="empty-state">
  <div class="u-mb-12 u-opacity-35"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
  <div class="u-strong u-text-lead">Нет записей</div>
  <button class="btn-primary u-mt-20" onclick="showPage('trainings');setNavActive(document.querySelector('.nav-link[onclick*=trainings]'))">Расписание</button>
</div>`;
    return;
  }
  const statusMap = { booked: 'status-confirmed', cancelled: 'status-cancelled' };
  const statusLabel = { booked: 'Активна', cancelled: 'Отменена' };
  list.innerHTML = [...mine].reverse().map(b => {
    const d = new Date(b.date);
    return `<div class="booking-row">
  <div class="booking-date-block">
    <div class="booking-date-day">${d.getDate()}</div>
    <div class="booking-date-mon">${MONTHS_RU[d.getMonth()]}</div>
  </div>
  <div class="booking-info">
    <div class="booking-name">${b.service}</div>
    <div class="booking-meta"><svg class="ico-inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>${b.time} · <svg class="ico-inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${b.specialist}${siteLocName(b.location_id) ? ' · ' + escAttr(siteLocName(b.location_id)) : ''} · ${b.price.toLocaleString('ru')} ₽</div>
  </div>
  <div class="u-flex u-col u-items-end u-gap-6">
    <span class="status-badge ${statusMap[b.status]}">${statusLabel[b.status]}</span>
    ${b.paymentStatus === 'paid' ? `<span class="pay-badge paid"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Оплачено</span>` : b.status === 'booked' ? `<span class="pay-badge unpaid">Не оплачено</span>` : ''}
  </div>
  <div class="u-flex u-gap-6 u-shrink-0">
    ${cpCanMove(b) ? `<button class="action-btn confirm" onclick="cpMoveBooking(${b.id})">Перенести</button>` : ''}
    ${b.status !== 'cancelled' ? `<button class="btn-cancel" onclick="cpCancelBooking(${b.id})">Отменить</button>` : ''}
  </div>
</div>`;
  }).join('');
}

async function cpCancelBooking(id) {
  if (!await uiConfirm('Отменить запись?')) return;
  try {
    await BookingsAPI.setStatus(id, 'cancelled');   // пишем в БД
    // перечитываем свои записи и слоты (у группового освободилось место, индивидуальное снято целиком)
    await Promise.allSettled([loadMyBookings(), loadSlots()]);
    renderCpBookings();                               // перерисовываем кабинет
    renderSitePages();                                // и открытый экран сайта
    showToast('Запись отменена');
  } catch (e) {
    showToast('Не удалось отменить запись', 'error');
  }
}

// ── ПЕРЕНОС СВОЕЙ ЗАПИСИ ──────────────────────────────────────────
// Та же форма, что у администратора в журнале записи (js/admin/journal-book.js), без выбора клиента.
// Индивидуальная запись: день, время, длительность, специалист, станок; групповая — другой станок или другая
// групповая тренировка этого филиала. Срок (не позже чем за N минут до начала) и окно записи проверяет сервер.

// Перенести можно активную запись на занятие, которое ещё не началось
function cpCanMove(b) {
  return b.status === 'booked' && new Date(b.date + 'T' + b.time) > new Date();
}

async function cpMoveBooking(id) {
  const b = bookings.find(x => Number(x.id) === id);
  const loc = b && LOCATIONS.find(l => Number(l.id) === b.location_id);
  if (!b || !loc) return;
  const from = timeToMin(b.time);
  const was = { bookingId: Number(b.id), slotId: Number(b.slotId), from: from, to: from + b.dur, price: b.price, paid: b.paymentStatus === 'paid' };
  const base = {
    self: true, locId: Number(loc.id), date: b.date, isNew: false, hall: null,
    client: { id: currentUser.id, name: currentUser.name },
  };
  if (!b.individual) {
    was.station = b.stationId;
    jb = Object.assign(base, { gmove: was, items: [], item: null, slots: null, target: was.slotId, station: b.stationId });
    jbBuildModal(loc);
    jbGroupMoveDay(jb.date);
    return;
  }
  // Варианты берём свежие: специалистов и длительности могли поменять
  let opts;
  try { opts = await IndividualAPI.options(loc.id); } catch (e) { return; }
  const item = opts.items.find(i => i.id === b.libraryId);
  if (!item || !item.bookable) { showToast('Это занятие больше недоступно для записи — отмените запись и запишитесь заново', 'error'); return; }
  const max = parseLocalDate(opts.today);
  max.setDate(max.getDate() + opts.horizon_days);
  jb = Object.assign(base, {
    move: was, maxDate: fmtLocalDate(max), items: [item], step: opts.step, fixedSpec: null,
    item: item.id, spec: b.specialistId, dur: b.dur,
    wantStart: from, wantStation: b.stationId, start: null, station: null, times: null, message: '',
  });
  jbBuildModal(loc);
  jbLoadTimes();
}

// После переноса: свои записи и слоты — заново (счётчики мест групповых тренировок)
async function cpAfterMove() {
  await Promise.allSettled([loadMyBookings(), loadSlots()]);
  renderCpBookings();
  renderSitePages();   // форма переноса открывается и с экрана «Тренировки»
}



