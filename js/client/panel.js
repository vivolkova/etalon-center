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
  document.getElementById('cp-user-email').textContent = currentUser.email;
  const cData = CLIENTS.find(c => c.email === currentUser.email);
  const badge = document.getElementById('cp-user-badge');
  badge.className = 'cp-user-badge c-badge ' + (cData?.type || 'new');
  badge.textContent = { new: 'Новый', vip: 'VIP' }[cData?.type || 'new'] || 'Новый';

  // Chat badge
  const myMsgs = chatMessages[currentUser.email] || [];
  const lastMsg = myMsgs[myMsgs.length - 1];
  const chatBadge = document.getElementById('client-chat-badge');
  chatBadge.style.display = (lastMsg && lastMsg.from === 'admin') ? '' : 'none';

  renderClientFeed();
}

function switchClientTab(name, el) {
  document.querySelectorAll('.cp-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.cp-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('cp-' + name).classList.add('active');
  if (name === 'mybookings') renderCpBookings();
  if (name === 'chat') renderClientChat();
  if (name === 'profile') renderProfileForm();
}

// ── FEED ──────────────────────────────────────────────────────────
function renderClientFeed() {
  // Announcements
  const grid = document.getElementById('client-ann-grid');
  const typeIcon = { announce: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>`, info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`, promo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>` };
  const typeLabel = { announce: 'Анонс', info: 'Информация', promo: 'Акция' };
  const anns = notifications.filter(n => ['announce', 'info', 'promo'].includes(n.type)).slice(0, 6);
  if (!anns.length) {
    grid.innerHTML = `<div class="u-muted u-text-ui u-py-10">Нет анонсов</div>`;
  } else {
    grid.innerHTML = anns.map(n => `
  <div class="ann-card ${n.type}">
    <div class="ann-card-tag u-flex u-items-center u-gap-6">${typeIcon[n.type] || ''} ${typeLabel[n.type] || 'Анонс'}</div>
    <div class="ann-card-title">${n.title}</div>
    <div class="ann-card-text">${n.text}</div>
    <div class="ann-card-time">${n.time}</div>
  </div>`).join('');
  }
  // Upcoming slots (today's dayOfWeek)
  const todayDow = (new Date().getDay() + 6) % 7;
  const upcoming = SLOTS.filter(s => s.dayOfWeek === todayDow && slotFree(s) > 0).slice(0, 4);
  const feedSlots = document.getElementById('feed-slots');
  feedSlots.innerHTML = upcoming.length
    ? upcoming.map(s => `<div class="cp-slot-row u-pointer" onclick="openSlotDetail(${s.id})">
    <div class="cp-slot-time">${s.time}</div>
    <div class="cp-slot-info">
      <div class="cp-slot-name">${s.name}</div>
      <div class="cp-slot-meta"><svg class="ico-inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${s.specialist} · ${s.dur} мин${slotUsesHall(s.cat) ? ` · ${slotFree(s)} мест` : ''}</div>
    </div>
    <div class="u-bold u-brand u-text-ui">${s.price.toLocaleString('ru')} ₽</div>
    <button class="btn-primary u-text-small" onclick="event.stopPropagation();openBookingModal(${s.id})">Записаться</button>
  </div>`).join('')
    : `<div class="u-muted u-text-ui u-py-16">Сегодня занятий нет</div>`;
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
  let mine = bookings.filter(b => b.clientId === currentUser?.email);
  if (cpBookingFilter_val !== 'all') mine = mine.filter(b => b.status === cpBookingFilter_val);
  if (!mine.length) {
    list.innerHTML = `<div class="empty-state">
  <div class="u-mb-12 u-opacity-35"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
  <div class="u-strong u-text-lead">Нет записей</div>
  <button class="btn-primary u-mt-20" onclick="showPage('schedule');setNavActive(document.querySelector('.nav-link[onclick*=schedule]'))">Групповые тренировки</button>
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
    ${b.status === 'booked' && b.paymentStatus !== 'paid' ? `<button class="btn-pay" onclick="openPaymentModal(${b.id})">Оплатить</button>` : ''}
    ${b.status !== 'cancelled' ? `<button class="btn-cancel" onclick="cpCancelBooking(${b.id})">Отменить</button>` : ''}
  </div>
</div>`;
  }).join('');
}



