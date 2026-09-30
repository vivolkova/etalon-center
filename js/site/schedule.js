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

// ── Филиал: в сетке всегда ровно один. Выбор запоминается в браузере ──
const SCH_LOC_KEY = 'etalon.site.location';
let schLocId = (function () {
  try { return parseInt(localStorage.getItem(SCH_LOC_KEY)) || null; } catch (e) { return null; }
})();

// Выбранный филиал среди действующих; сохранённого нет или он закрыт — первый действующий
function schLoc() {
  return LOCATIONS.find(function (l) { return Number(l.id) === schLocId; }) || LOCATIONS[0] || null;
}

function renderSchLoc() {
  const box = document.getElementById('sch-loc');
  if (!box) return;
  const loc = schLoc();
  if (!loc) { box.innerHTML = ''; return; }
  let h = '';
  if (LOCATIONS.length > 1) {
    h += '<div class="filter-chips sch-loc-chips">' + LOCATIONS.map(function (l) {
      return '<button class="chip' + (l.id === loc.id ? ' active' : '') + '" onclick="selectSchLoc(' + l.id + ')">' + escAttr(l.name) + '</button>';
    }).join('') + '</div>';
  }
  const info = [loc.address, loc.phone].filter(Boolean).map(escAttr).join(' · ');
  if (info) h += '<div class="sch-loc-info">' + info + '</div>';
  box.innerHTML = h;
}

function selectSchLoc(id) {
  schLocId = Number(id);
  try { localStorage.setItem(SCH_LOC_KEY, String(schLocId)); } catch (e) { /* хранилище недоступно — выбор до перезагрузки */ }
  renderSchedule();
}

// Название филиала слота/записи — только когда филиалов несколько (при одном это лишний шум)
function siteLocName(locId) {
  if (LOCATIONS.length < 2 || locId == null) return '';
  const l = LOCATIONS.find(function (x) { return Number(x.id) === Number(locId); });
  return l ? l.name : '';
}

function renderSchedule() {
  renderSchLoc();
  const loc = schLoc();
  // Категории — доступные в выбранном филиале (location_dictionaries)
  const cats = loc ? catsAt(loc.id) : ACTIVITY_CATS;
  currentCat = validCat(currentCat, cats);
  const f = document.getElementById('sch-cat-filter'); if (f) f.innerHTML = catChipsHtml(currentCat, 'filterCat', cats);
  const lg = document.getElementById('sch-legend'); if (lg) lg.innerHTML = catLegendHtml(cats);
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
  const ROW_H = wgRowHeight(grid); // px на 1 час — из --wg-row-h (css/week-grid.css)

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

  // Слоты недели выбранного филиала
  const loc = schLoc();
  const locId = loc ? Number(loc.id) : null;
  const weekSlots = SLOTS.filter(function (s) {
    return s.date >= schWeekStart && s.date <= weekEnd &&
      (locId === null || Number(s.location_id) === locId) &&
      (currentCat === 'all' || s.cat === currentCat);
  });

  // ── Шапка: угол + заголовки дней ──
  let h = '<div class="wg-corner"></div>';
  days.forEach(function (d, di) {
    const isToday = d.getTime() === today.getTime();
    const isPast = d < today;
    const cnt = weekSlots.filter(function (s) {
      return s.date.getDate() === d.getDate() && s.date.getMonth() === d.getMonth();
    }).length;
    h += '<div class="wg-day-hdr' + (isToday ? ' today' : '') + (isPast && !isToday ? ' past' : '') + '">'
      + '<div class="wg-dow">' + DAYS_SHORT[di] + '</div>'
      + '<div class="wg-date">' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + '</div>'
      + '<div class="wg-day-sub">' + (cnt ? cnt + ' зан.' : '—') + '</div>'
      + '</div>';
  });

  // ── Строки часов ──
  // Часы — по режиму работы выбранного филиала
  const hrRange = weekHourRange(weekSlots, locId === null ? null : [locId]);
  // Раскладка по колонкам для пересекающихся занятий — по каждому дню целиком
  const dayLayouts = days.map(function (d) {
    return wgLayoutDay(weekSlots.filter(function (s) { return s.date.getDate() === d.getDate() && s.date.getMonth() === d.getMonth(); }));
  });
  for (var hr = hrRange.start; hr < hrRange.end; hr++) {
    const timeStr = String(hr).padStart(2, '0') + ':00';

    // Временна́я метка
    h += '<div class="wg-time-col"><div class="wg-time-row">' + timeStr + '</div></div>';

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

      let cellHtml = '<div class="wg-cell">';

      dayHrSlots.forEach(function (s) {
        const mins = parseInt(s.time.split(':')[1]) || 0;
        const topPx = Math.round(mins * ROW_H / 60);
        const heightPx = Math.max(Math.round(s.dur * ROW_H / 60), 36);
        const full = slotFree(s) <= 0;
        const booked = alreadyBooked.has(s.id);
        // У байкфита мест в зале нет — вместо «x/y мест» показываем специалиста
        const hallless = !slotUsesHall(s.cat);
        const spotsText = booked ? '✓ Записан'
          : full ? (hallless ? 'Занято' : 'Мест нет')
            : hallless ? (s.specialist || '')
              : slotFree(s) + '/' + slotCap(s) + ' мест';

        // Размер слота: xs<28, sm<44, md<70, lg>=70
        var sizeClass = heightPx < 28 ? 'slot-xs' : heightPx < 44 ? 'slot-sm' : heightPx < 70 ? 'slot-md' : 'slot-lg';
        let cls = 'wg-slot cat-' + s.cat + ' ' + sizeClass;
        if (booked) cls += ' booked';
        else if (full) cls += ' full';

        var bookLabel = booked ? '✓ Записан' : full ? (hallless ? 'Занято' : 'Мест нет') : 'Записаться';
        var bookOnclick = (!full && !booked)
          ? 'event.stopPropagation();openBookingModal(' + s.id + ')'
          : 'event.stopPropagation()';

        var feats = [];
        if (s.features) { try { feats = Array.isArray(s.features) ? s.features : JSON.parse(s.features); } catch (e) { } }
        // Подсказка при наведении — всегда время и название (узкий слот при нескольких занятиях
        // в одно время не вмещает текст), плюс описание и особенности, если есть
        var tipAttr = ' data-name="' + escAttr(s.time + ' · ' + s.name) + '"';
        if (s.description) tipAttr += ' data-desc="' + escAttr(s.description) + '"';
        if (feats && feats.length) tipAttr += ' data-feat="' + escAttr(JSON.stringify(feats)) + '"';
        cellHtml += '<div class="' + cls + '" style="top:' + topPx + 'px;height:' + heightPx + 'px;' + wgLaneStyle(dayLayouts[di].get(s.id)) + '"' + tipAttr + ' onclick="' + (booked || full ? 'openSlotDetail(' + s.id + ')' : 'openBookingModal(' + s.id + ')') + '">';
        if (heightPx >= 28) {
          cellHtml += '<div class="wg-slot-time">' + s.time + '</div>';
        }
        if (heightPx >= 20) {
          cellHtml += '<div class="wg-slot-name">' + s.name + '</div>';
        }
        if (heightPx >= 44) {
          cellHtml += '<div class="wg-slot-meta">' + spotsText + '</div>';
        }
        // Кнопка всегда — адаптируется по размеру через CSS
        cellHtml += '<button class="wg-slot-book" onclick="' + bookOnclick + '">' + bookLabel + '</button>';
        cellHtml += '</div>';
      });

      cellHtml += '</div>';

      h += '<div class="wg-day-col' + (isToday ? ' today-col' : '') + (isPast && !isToday ? ' past-col' : '') + '">' + cellHtml + '</div>';
    });
  }

  grid.innerHTML = h;
  wcBindTip(grid);
}

// ── Всплывающее описание тренировки над слотом расписания ──
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
    const slot = e.target.closest('.wg-slot');
    if (!slot || !grid.contains(slot)) return;
    const desc = slot.getAttribute('data-desc');
    const featRaw = slot.getAttribute('data-feat');
    if (!slot.getAttribute('data-name')) { t.classList.remove('show'); return; }
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
    const slot = e.target.closest('.wg-slot');
    if (!slot) return;
    if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
    t.classList.remove('show');
  });
}

function filterCat(cat, btn) {
  currentCat = cat;
  document.querySelectorAll('#sch-cat-filter .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderWeekCal();
}

