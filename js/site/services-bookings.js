// Сайт: услуги и «Мои записи»

// ═══ SERVICES ════════════════════════════════════════════════════

// Страница «Услуги» строится из данных: разделы — категории услуг из справочника (service_category),
// у которых в выбранном филиале есть записи библиотеки; карточки — эти записи (описание, длительность, цена).
// «Записаться» открывает окно записи (js/site/individual.js): специалист → дата → свободное время.
// Услуга, которую в филиале некому оказывать (нет специалиста с графиком), показывается без записи.
async function renderServices() {
  renderSchLoc();
  const box = document.getElementById('services-grid');
  const loc = schLoc();
  if (!box || !loc) return;
  const opts = await indLoadOptions(loc.id);
  if (!schLoc() || Number(schLoc().id) !== Number(loc.id)) return;   // пока грузили, филиал сменили
  const items = opts ? indSvcItems(loc.id) : [];
  if (!items.length) { box.innerHTML = '<div class="indp-empty">В этом филиале пока нет услуг.</div>'; return; }
  // Разделы — в порядке справочника; категории, которой в справочнике уже нет, — в конце
  const codes = ACTIVITY_CATS.map(c => c.code).filter(code => items.some(i => i.cat === code));
  items.forEach(i => { if (codes.indexOf(i.cat) < 0) codes.push(i.cat); });
  box.innerHTML = codes.map(code => `
<div class="svc-section cat-${code}">
  <h3 class="svc-section-title"><span class="svc-dot"></span>${escAttr(catName(code))}</h3>
  <div class="services-grid">${items.filter(i => i.cat === code).map(svcCardHtml).join('')}</div>
</div>`).join('');
}

function svcCardHtml(it) {
  let feats = [];
  if (it.details) { try { feats = Array.isArray(it.details) ? it.details : JSON.parse(it.details); } catch (e) { } }
  const specs = (it.specialists || []).map(s => s.full_name || s.name).join(', ');
  return `<div class="service-card svc-card">
  <div class="service-name">${escAttr(it.name)}</div>
  ${it.summary ? `<div class="service-desc">${escAttr(it.summary)}</div>` : ''}
  ${feats && feats.length ? `<ul class="svc-feats">${feats.map(f => `<li>${escAttr(String(f))}</li>`).join('')}</ul>` : ''}
  <div class="svc-foot">
    <div>
      <div class="service-price">${it.price.toLocaleString('ru')} ₽</div>
      <div class="svc-meta">${fmtDurShort(it.duration)}${specs ? ' · ' + escAttr(specs) : ''}</div>
    </div>
    ${it.bookable
      ? `<button class="btn-primary svc-book" onclick="openIndividual(${it.id})">Записаться</button>`
      : `<span class="svc-meta">Запись через администратора</span>`}
  </div>
</div>`;
}

// ═══ MY BOOKINGS ════════════════════════════════════════════════

function renderBookings() {
  const list = document.getElementById('bookings-list');
  const myBookings = bookings.filter(b => b.clientId === currentUser?.email);
  if (!myBookings.length) {
    list.innerHTML = `<div class="empty-state">
  <div class="u-mb-12 u-opacity-35"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
  <div class="u-text-lead u-strong">Нет активных записей</div>
  <div class="u-mt-8 u-text-ui">Перейдите в расписание и запишитесь на тренировку</div>
  <button class="btn-primary u-mt-20" onclick="showPage('schedule')">Открыть расписание</button>
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
    <div class="booking-meta"><svg class="ico-inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>${b.time} · <svg class="ico-inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${b.specialist}${siteLocName(b.location_id) ? ' · ' + escAttr(siteLocName(b.location_id)) : ''} · ${b.price.toLocaleString('ru')} ₽</div>
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
    // Слоты — заново: у группового занятия освободилось место, индивидуальное снято целиком
    await Promise.allSettled([loadMyBookings(), loadSlots()]);
    renderBookings();
    renderWeekCal();
    showToast('Запись отменена');
  } catch (e) {
    // Ошибка уже показана в apiRequest; локально отмену не подделываем
  }
}

