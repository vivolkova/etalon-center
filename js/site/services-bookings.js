// Сайт: услуги и «Мои записи»

// ═══ SERVICES ════════════════════════════════════════════════════

// Подпись кнопки услуги и переход — во фронте, не в БД. Все услуги ведут на расписание.
function serviceCta() { return 'Смотреть расписание'; }

function renderServices() {
  document.getElementById('services-grid').innerHTML = SERVICES.map((s, i) => `
<div class="service-card" onclick="openServiceDetail(${i})" style="cursor:pointer">
  <div class="service-icon">${s.icon}</div>
  <div class="service-name">${s.name}</div>
  <div class="service-desc">${s.desc}</div>
  <div class="service-price">${s.price}</div>
  <div class="service-cta">${serviceCta()} →</div>
</div>`).join('');
}

// ═══ MY BOOKINGS ════════════════════════════════════════════════

function renderBookings() {
  const list = document.getElementById('bookings-list');
  const myBookings = bookings.filter(b => b.clientId === currentUser?.email);
  if (!myBookings.length) {
    list.innerHTML = `<div style="text-align:center;padding:60px;color:var(--ink-60)">
  <div style="margin-bottom:12px;opacity:.35"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
  <div style="font-size:16px;font-weight:600">Нет активных записей</div>
  <div style="margin-top:8px;font-size:13px">Перейдите в расписание и запишитесь на тренировку</div>
  <button class="btn-primary" style="margin-top:20px" onclick="showPage('schedule')">Открыть расписание</button>
</div>`;
    return;
  }
  list.innerHTML = myBookings.reverse().map(b => {
    const date = new Date(b.date);
    const statusMap = { booked: 'status-confirmed', cancelled: 'status-cancelled' };
    const statusLabel = { booked: 'Активна', cancelled: 'Отменена' };
    return `<div class="booking-row">
  <div class="booking-date-block">
    <div class="booking-date-day">${date.getDate()}</div>
    <div class="booking-date-mon">${MONTHS_RU[date.getMonth()]}</div>
  </div>
  <div class="booking-info">
    <div class="booking-name">${b.service}</div>
    <div class="booking-meta"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>${b.time} · <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${b.specialist} · ${b.price.toLocaleString('ru')} ₽</div>
  </div>
  <span class="status-badge ${statusMap[b.status]}">${statusLabel[b.status]}</span>
  ${b.status !== 'cancelled' ? `<button class="btn-cancel" onclick="cancelBooking(${b.id})">Отменить</button>` : ''}
</div>`;
  }).join('');
}

async function cancelBooking(id) {
  if (!confirm('Отменить запись?')) return;
  try {
    await BookingsAPI.setStatus(id, 'cancelled');
    await loadMyBookings();
    renderBookings();
    showToast('Запись отменена');
  } catch (e) {
    // Ошибка уже показана в apiRequest; локально отмену не подделываем
  }
}

