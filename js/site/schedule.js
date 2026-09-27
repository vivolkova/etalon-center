// Сайт: расписание (недельный календарь, подсказки, список слотов)

// ═══ SCHEDULE ════════════════════════════════════════════════════

// ── WEEK CALENDAR ──────────────────────────────────────────────────
// schWeekStart — понедельник текущей отображаемой недели
let schWeekStart = (function () {
  const d = new Date(today);
  const dow = (d.getDay() + 6) % 7; // пн=0
  d.setDate(d.getDate() - dow);
  return d;
})();

function renderSchedule() {
  renderWeekCal();
}

function schChangeWeek(dir) {
  schWeekStart = new Date(schWeekStart);
  schWeekStart.setDate(schWeekStart.getDate() + dir * 7);
  renderWeekCal();
}

function schGoToday() {
  const d = new Date(today);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  schWeekStart = d;
  renderWeekCal();
}

function renderWeekCal() {
  const grid = document.getElementById('week-cal-grid');
  if (!grid) return;

  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const HOUR_START = 8;
  const HOUR_END = 22;
  const ROW_H = 80; // px на 1 час

  // Заголовок недели
  const weekEnd = new Date(schWeekStart); weekEnd.setDate(schWeekStart.getDate() + 6);
  const hdrEl = document.getElementById('sch-cal-month');
  if (hdrEl) {
    const s = schWeekStart, e = weekEnd;
    hdrEl.textContent = s.getMonth() === e.getMonth()
      ? s.getDate() + ' – ' + e.getDate() + ' ' + MONTHS_SHORT[s.getMonth()] + ' ' + s.getFullYear()
      : s.getDate() + ' ' + MONTHS_SHORT[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS_SHORT[e.getMonth()] + ' ' + s.getFullYear();
  }

  const alreadyBooked = new Set(bookings.filter(b => b.status !== 'cancelled').map(b => b.slotId));

  // Массив дней недели
  const days = Array.from({ length: 7 }, function (_, i) {
    const d = new Date(schWeekStart); d.setDate(schWeekStart.getDate() + i); return d;
  });

  // Слоты недели
  const weekSlots = SLOTS.filter(function (s) {
    return s.date >= schWeekStart && s.date <= weekEnd &&
      (currentCat === 'all' || s.cat === currentCat);
  });

  // ── Шапка: угол + заголовки дней ──
  let h = '<div class="wc-corner"></div>';
  days.forEach(function (d, di) {
    const isToday = d.getTime() === today.getTime();
    const isPast = d < today;
    const cnt = weekSlots.filter(function (s) {
      return s.date.getDate() === d.getDate() && s.date.getMonth() === d.getMonth();
    }).length;
    h += '<div class="wc-day-hdr' + (isToday ? ' today' : '') + (isPast && !isToday ? ' past' : '') + '">'
      + '<div class="wc-dow">' + DAYS_SHORT[di] + '</div>'
      + '<div class="wc-date">' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + '</div>'
      + '<div class="wc-day-count">' + (cnt ? cnt + ' зан.' : '—') + '</div>'
      + '</div>';
  });

  // ── Строки часов ──
  for (var hr = HOUR_START; hr < HOUR_END; hr++) {
    const timeStr = String(hr).padStart(2, '0') + ':00';
    const isLast = hr === HOUR_END - 1;

    // Временна́я метка
    h += '<div class="wc-time-col"><div class="wc-time-row' + (isLast ? ' style="border-bottom:none"' : '') + '">' + timeStr + '</div></div>';

    // Колонки дней
    days.forEach(function (d, di) {
      const isToday = d.getTime() === today.getTime();
      const isPast = d < today;

      // Слоты этого часа для этого дня
      const dayHrSlots = weekSlots.filter(function (s) {
        return s.date.getDate() === d.getDate() &&
          s.date.getMonth() === d.getMonth() &&
          parseInt(s.time.split(':')[0]) === hr;
      });

      let cellHtml = '<div class="wc-cell">';

      dayHrSlots.forEach(function (s) {
        const mins = parseInt(s.time.split(':')[1]) || 0;
        const topPx = Math.round(mins * ROW_H / 60);
        const heightPx = Math.max(Math.round(s.dur * ROW_H / 60), 36);
        const full = (s.max - s.taken) <= 0;
        const booked = alreadyBooked.has(s.id);
        const spotsText = booked ? '✓ Записан'
          : full ? 'Мест нет'
            : (s.max - s.taken) + '/' + s.max + ' мест';

        // Размер слота: xs<28, sm<44, md<70, lg>=70
        var sizeClass = heightPx < 28 ? 'slot-xs' : heightPx < 44 ? 'slot-sm' : heightPx < 70 ? 'slot-md' : 'slot-lg';
        let cls = 'wc-slot cat-' + s.cat + ' ' + sizeClass;
        if (booked) cls += ' booked';
        else if (full) cls += ' full';

        var bookLabel = booked ? '✓ Записан' : full ? 'Мест нет' : 'Записаться';
        var bookOnclick = (!full && !booked)
          ? 'event.stopPropagation();openBookingModal(' + s.id + ')'
          : 'event.stopPropagation()';

        var feats = [];
        if (s.features) { try { feats = Array.isArray(s.features) ? s.features : JSON.parse(s.features); } catch (e) { } }
        var tipAttr = '';
        if (s.description || (feats && feats.length)) {
          tipAttr = ' data-name="' + escAttr(s.name) + '"';
          if (s.description) tipAttr += ' data-desc="' + escAttr(s.description) + '"';
          if (feats && feats.length) tipAttr += ' data-feat="' + escAttr(JSON.stringify(feats)) + '"';
        }
        cellHtml += '<div class="' + cls + '" style="top:' + topPx + 'px;height:' + heightPx + 'px"' + tipAttr + ' onclick="' + (booked || full ? 'openSlotDetail(' + s.id + ')' : 'openBookingModal(' + s.id + ')') + '">';
        if (heightPx >= 28) {
          cellHtml += '<div class="wc-slot-time">' + s.time + '</div>';
        }
        if (heightPx >= 20) {
          cellHtml += '<div class="wc-slot-name">' + s.name + '</div>';
        }
        if (heightPx >= 44) {
          cellHtml += '<div class="wc-slot-spots">' + spotsText + '</div>';
        }
        // Кнопка всегда — адаптируется по размеру через CSS
        cellHtml += '<button class="wc-slot-book" onclick="' + bookOnclick + '">' + bookLabel + '</button>';
        cellHtml += '</div>';
      });

      cellHtml += '</div>';

      h += '<div class="wc-day-col' + (isToday ? ' today-col' : '') + (isPast && !isToday ? ' past-col' : '') + '">' + cellHtml + '</div>';
    });
  }

  grid.innerHTML = h;
  wcBindTip(grid);
}

// ── Всплывающее описание тренировки над слотом расписания ──
function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function wcEnsureTip() {
  let t = document.getElementById('wc-tip');
  if (!t) { t = document.createElement('div'); t.id = 'wc-tip'; t.className = 'wc-tip'; document.body.appendChild(t); }
  return t;
}
function wcPositionTip(t, e) {
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
  if (x < 8) x = 8;
  if (y < 8) y = 8;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
function wcBindTip(grid) {
  if (grid._tipBound) return;   // делегирование навешиваем один раз
  grid._tipBound = true;
  const t = wcEnsureTip();
  grid.addEventListener('mouseover', function (e) {
    const slot = e.target.closest('.wc-slot');
    if (!slot || !grid.contains(slot)) return;
    const desc = slot.getAttribute('data-desc');
    const featRaw = slot.getAttribute('data-feat');
    if (!desc && !featRaw) { t.classList.remove('show'); return; }
    let html = '<div class="wc-tip-title">' + escAttr(slot.getAttribute('data-name') || '') + '</div>';
    if (desc) html += '<div class="wc-tip-body">' + escAttr(desc) + '</div>';
    if (featRaw) {
      let feats = [];
      try { feats = JSON.parse(featRaw); } catch (e) { }
      if (feats.length) html += '<ul class="wc-tip-feats">' + feats.map(f => '<li>' + escAttr(String(f)) + '</li>').join('') + '</ul>';
    }
    t.innerHTML = html;
    t.classList.add('show');
    wcPositionTip(t, e);
  });
  grid.addEventListener('mousemove', function (e) {
    if (t.classList.contains('show')) wcPositionTip(t, e);
  });
  grid.addEventListener('mouseout', function (e) {
    const slot = e.target.closest('.wc-slot');
    if (!slot) return;
    if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
    t.classList.remove('show');
  });
}

function filterCat(cat, btn) {
  currentCat = cat;
  document.querySelectorAll('#page-schedule .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderWeekCal();
}

function renderSlots() {
  const grid = document.getElementById('slots-grid');
  // Фильтрация по точной выбранной дате
  const filtered = SLOTS.filter(s => {
    const matchDate = s.date.getFullYear() === schSelYear && s.date.getMonth() === schSelMonth && s.date.getDate() === schSelDate;
    const matchCat = currentCat === 'all' || s.cat === currentCat;
    return matchDate && matchCat;
  }).sort((a, b) => a.time.localeCompare(b.time));
  if (!filtered.length) {
    grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--ink-60)">
  <div style="margin-bottom:12px;opacity:.35"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M8.5 17.5h7m-3-10.5l2 4 2-1.5m-4 0l-3 4h5"/><circle cx="15" cy="6" r="1"/></svg></div>
  <div style="font-size:15px;font-weight:600">Нет занятий в этот день</div>
  <div style="font-size:13px;margin-top:6px">Выберите другой день или категорию</div>
</div>`;
    return;
  }
  const alreadyBooked = new Set(bookings.filter(b => b.status !== 'cancelled').map(b => b.slotId));
  grid.innerHTML = filtered.map(s => {
    const left = s.max - s.taken;
    const full = left <= 0;
    const isBooked = alreadyBooked.has(s.id);
    const badgeClass = { training: 'badge-training', bikefit: 'badge-bikefit', workshop: 'badge-workshop' }[s.cat];
    const badgeLabel = catName(s.cat);
    const spotsHtml = isBooked
      ? `<span class="slot-badge badge-training">✓ Записан</span>`
      : full ? `<span class="spots-full">Мест нет</span>`
        : left <= 2 ? `<span class="spots-low">Осталось ${left}</span>`
          : `<span class="spots-ok">${left} / ${s.max} мест</span>`;
    return `<div class="slot-card${full && !isBooked ? ' full' : ''}" onclick="openSlotDetail(${s.id})" style="cursor:pointer">
  <div class="slot-time-block">
    <div class="slot-time">${s.time}</div>
    <div class="slot-dur">${s.dur} мин</div>
  </div>
  <div class="slot-divider"></div>
  <div class="slot-info">
    <div class="slot-name">${s.name}</div>
    <div class="slot-meta">
      <span class="slot-trainer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${s.specialist}</span>
      <span class="slot-badge ${badgeClass}">${badgeLabel}</span>
    </div>
  </div>
  <div class="slot-right">
    <div class="slot-price">${s.price.toLocaleString('ru')} ₽</div>
    ${spotsHtml}
    ${!full && !isBooked ? `<button class="btn-book" onclick="event.stopPropagation();openBookingModal(${s.id})">Записаться</button>` : ''}
  </div>
</div>`;
  }).join('');
}

