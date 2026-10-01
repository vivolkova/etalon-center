// Модалка деталей занятия

// ── SLOT & SERVICE DETAIL MODALS ──────────────────────────────────



function openSlotDetail(slotId) {
  const s = SLOTS.find(x => x.id === slotId);
  if (!s) return;
  const descText = s.description || '';
  let featureList = [];
  if (s.features) {
    try { featureList = Array.isArray(s.features) ? s.features : JSON.parse(s.features); } catch (e) { }
  }
  const catLabel = catName(s.cat);
  const tagEl = document.getElementById('sdm-tag');
  tagEl.textContent = catLabel; tagEl.className = 'dm-tag ' + colorClass(s.cat, s.type);
  document.getElementById('sdm-title').textContent = s.name;
  document.getElementById('sdm-subtitle').textContent = [DAYS_FULL[s.dayOfWeek], s.time, s.specialist, siteLocName(s.location_id)].filter(Boolean).join(' · ');
  const left = slotFree(s);

  const clockSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
  const usersSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`;
  const starSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

  const usesHall = slotUsesHall(s.cat) && !slotIsIndividual(s);   // индивидуальное — один клиент, места не показываем
  // У байкфита мест в зале нет — показываем только длительность
  document.getElementById('sdm-stats').innerHTML = `
<div class="dm-stat"><div class="dm-stat-val u-flex u-justify-center u-mb-4">${clockSvg}</div><div class="dm-stat-val">${s.dur}</div><div class="dm-stat-label">минут</div></div>` + (usesHall ? `
<div class="dm-stat"><div class="dm-stat-val u-flex u-justify-center u-mb-4">${usersSvg}</div><div class="dm-stat-val">${left}</div><div class="dm-stat-label">мест свободно</div></div>
<div class="dm-stat"><div class="dm-stat-val u-flex u-justify-center u-mb-4">${starSvg}</div><div class="dm-stat-val">${slotCap(s)}</div><div class="dm-stat-label">мест всего</div></div>` : '');

  document.getElementById('sdm-desc').textContent = descText;
  document.getElementById('sdm-features').innerHTML = (featureList || [])
    .map(f => `<div class="dm-feature"><div class="dm-feature-dot"></div><div>${f}</div></div>`).join('');
  document.getElementById('sdm-price').textContent = s.price.toLocaleString('ru') + ' ₽';

  const btn = document.getElementById('sdm-book-btn');
  const full = left <= 0;
  const isBooked = bookings.some(b => b.slotId === s.id && b.status !== 'cancelled');
  if (isBooked) { btn.textContent = 'Вы записаны ✓'; btn.disabled = false; btn.classList.add('is-booked-ok'); btn.onclick = null; btn.style.opacity = ''; btn.title = 'Вы уже записаны на это занятие'; }
  else if (full) { btn.textContent = usesHall ? 'Мест нет' : 'Занято'; btn.classList.remove('is-booked-ok'); btn.disabled = true; btn.onclick = null; btn.style.opacity = ''; btn.title = usesHall ? 'Свободных мест нет' : 'Время уже занято'; }
  else { btn.textContent = 'Записаться →'; btn.classList.remove('is-booked-ok'); btn.disabled = false; btn.style.opacity = ''; btn.title = ''; btn.onclick = () => { document.getElementById('slot-detail-modal').classList.remove('show'); openBookingModal(slotId); }; }

  document.getElementById('slot-detail-modal').classList.add('show');
}
