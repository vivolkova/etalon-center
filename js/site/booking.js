// Сайт: модалка записи на занятие

// ═══ BOOKING MODAL ════════════════════════════════════════════════

function openBookingModal(slotId) {
  if (!currentUser) { openAuth('login'); showToast('Войдите, чтобы записаться'); return; }
  selectedSlot = SLOTS.find(s => s.id === slotId);
  if (!selectedSlot) return;
  const s = selectedSlot;
  document.getElementById('bm-title').textContent = s.name;
  document.getElementById('bm-sub').textContent = [s.date.getDate() + ' ' + MONTHS_FULL[s.date.getMonth()], s.time, s.specialist, siteLocName(s.location_id)].filter(Boolean).join(' · ');
  // У байкфита мест в зале нет: не показываем «Свободно … мест» и схему зала (станок не выбирается)
  const usesHall = slotUsesHall(s.cat);
  document.getElementById('bm-details').innerHTML = `
<div class="detail-item"><div class="detail-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div><div class="detail-val">${s.dur} мин</div><div class="detail-label">Продолжительность</div></div>` + (usesHall ? `
<div class="detail-item"><div class="detail-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></div><div class="detail-val"><span id="bm-free">—</span> мест</div><div class="detail-label">Свободно</div></div>` : '') + `
<div class="detail-item"><div class="detail-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg></div><div class="detail-val">${s.price.toLocaleString('ru')} ₽</div><div class="detail-label">Стоимость</div></div>`;
  document.getElementById('f-comment').value = '';
  document.getElementById('booking-modal').classList.add('show');
  selectedStation = null;

  // Состояние кнопки отправки: если уже записан на этот слот — «Записаться» неактивна
  const submitBtn = document.querySelector('#booking-modal .modal-actions .btn-primary');
  if (submitBtn) {
    const already = bookings.some(b => b.slotId === slotId && b.status !== 'cancelled');
    submitBtn.disabled = already;
    submitBtn.textContent = 'Записаться →';
    submitBtn.style.opacity = '';
    submitBtn.style.cursor = '';
    submitBtn.title = already ? 'Вы уже записаны на это занятие' : '';
  }

  document.getElementById('bm-hall-wrap').style.display = usesHall ? '' : 'none';
  if (usesHall) renderHall(slotId);
}

async function renderHall(slotId) {
  const hall = document.getElementById('bm-hall');
  const hint = document.getElementById('bm-station-hint');
  hall.innerHTML = ''; hint.textContent = 'Загрузка схемы зала…';
  let data;
  try { data = await StationsAPI.availability(slotId); }
  catch (e) { hint.textContent = 'Не удалось загрузить схему зала'; return; }
  const free = (data.stations || []).filter(x => x.state === 'free').length;
  // «Свободно» в шапке — из слота (всего мест − занято), как и в деталях слота
  const fe = document.getElementById('bm-free');
  if (fe && selectedSlot) fe.textContent = slotFree(selectedSlot);

  hallFill(hall, data, selectedStation, 'selectStation');
  hint.textContent = free > 0 ? ('Свободно: ' + free + '. Кликните место.') : 'Свободных мест нет';
}

// Плитка станка: значок типа и подпись. Единственное место, где строится разметка станка, — её используют
// схема зала (hallFill), карточка своей записи (js/site/trainings.js) и админка (блокировка станков на занятие,
// редактор зала). st — {label, icon}, cls — классы состояния (free / taken / blocked / selected…),
// attrs — остальные атрибуты кнопки (onclick, disabled, title, data-…)
function stationHtml(st, cls, attrs) {
  return '<button type="button" class="station ' + cls + '"' + (attrs ? ' ' + attrs : '') + '>'
    + '<span class="station-ico">' + (st.icon || '') + '</span><span>' + escAttr(st.label) + '</span></button>';
}

// Схема зала в элементе hall: сетка cols × rows, станки по координатам (pos_x — колонка, pos_y — ряд).
// data — {cols, rows, stations: [{id, label, pos_x, pos_y, icon, state}]}; свободный станок вызывает onSelect(id).
// Общая для записи на групповую тренировку, индивидуальной записи и переноса (js/admin/journal-book.js)
function hallFill(hall, data, selectedId, onSelect) {
  const cols = data.cols || 6, rows = data.rows || 2;
  const byPos = {};
  (data.stations || []).forEach(st => { byPos[st.pos_x + ',' + st.pos_y] = st; });
  hall.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  let html = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const st = byPos[x + ',' + y];
      if (!st) { html += '<div class="cell-empty"></div>'; continue; }
      const sel = (Number(st.id) === Number(selectedId)) ? ' selected' : '';
      const on = st.state === 'free' ? `onclick="${onSelect}(${st.id})"` : 'disabled';
      html += stationHtml(st, st.state + sel, `data-station="${st.id}" ${on} title="${escAttr(st.label)}"`);
    }
  }
  hall.innerHTML = html;
}
function selectStation(id) {
  selectedStation = id;
  document.querySelectorAll('#bm-hall .station').forEach(b => b.classList.remove('selected'));
  const el = [...document.querySelectorAll('#bm-hall .station')].find(b => (b.getAttribute('onclick') || '') === 'selectStation(' + id + ')');
  if (el) el.classList.add('selected');
  document.getElementById('bm-station-hint').textContent = 'Место выбрано ✓';
}

function closeBookingModal() {
  document.getElementById('booking-modal').classList.remove('show');
  selectedSlot = null;
}

async function confirmBooking() {
  const s = selectedSlot;
  if (!s) return;
  const usesHall = slotUsesHall(s.cat);
  if (usesHall && !selectedStation) { showToast('Выберите место на схеме зала', 'error'); return; }

  const btn = document.querySelector('.modal-actions .btn-primary');
  if (btn) { btn.textContent = 'Записываем...'; btn.disabled = true; }

  try {
    // API-запрос
    const notes = document.getElementById('f-comment').value.trim();
    const res = await BookingsAPI.create(s.id, usesHall ? selectedStation : null, notes);
    // Обновляем локальный массив слотов
    s.taken++;
    // Подгружаем актуальные записи
    await loadMyBookings();
    closeBookingModal();
    renderSitePages();
    showToast(' Вы записаны! Ждём вас в ' + s.time, 'success');
  } catch (e) {
    // Ошибка/недоступность сервера уже показана в apiRequest; локально запись не подделываем
  } finally {
    if (btn) { btn.textContent = 'Записаться →'; btn.disabled = false; }
  }
}

