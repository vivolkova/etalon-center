// Сайт: групповые тренировки (недельная сетка занятий выбранного филиала, запись на занятие)

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

// Переключатель рисуется на каждом экране, зависящем от филиала (.sch-loc): тренировки и услуги
function renderSchLoc() {
  const boxes = document.querySelectorAll('.sch-loc');
  const loc = schLoc();
  let h = '';
  if (!loc) { boxes.forEach(function (b) { b.innerHTML = ''; }); return; }
  if (LOCATIONS.length > 1) {
    h += '<div class="filter-chips sch-loc-chips">' + LOCATIONS.map(function (l) {
      return '<button class="chip' + (l.id === loc.id ? ' active' : '') + '" onclick="selectSchLoc(' + l.id + ')">' + escAttr(l.name) + '</button>';
    }).join('') + '</div>';
  }
  const info = [loc.address, loc.phone].filter(Boolean).map(escAttr).join(' · ');
  if (info) h += '<div class="sch-loc-info">' + info + '</div>';
  boxes.forEach(function (b) { b.innerHTML = h; });
}

function selectSchLoc(id) {
  schLocId = Number(id);
  try { localStorage.setItem(SCH_LOC_KEY, String(schLocId)); } catch (e) { /* хранилище недоступно — выбор до перезагрузки */ }
  renderSitePages();
}

// Перерисовать экраны, зависящие от филиала и от того, кто вошёл: групповые тренировки и открытый сейчас экран
function renderSitePages() {
  renderSchedule();
  if (currentPage === 'individual') renderIndividualPage();
  if (currentPage === 'services') renderServices();
}

// Название филиала слота/записи — только когда филиалов несколько (при одном это лишний шум)
function siteLocName(locId) {
  if (LOCATIONS.length < 2 || locId == null) return '';
  const l = LOCATIONS.find(function (x) { return Number(x.id) === Number(locId); });
  return l ? l.name : '';
}

function renderSchedule() {
  renderSchLoc();
  renderWeekCal();
}

// День для вида «один день» на телефоне (0 = Пн); null — по умолчанию для недели (wgDefaultDay)
let schDayIdx = null;

function schChangeWeek(dir) {
  schWeekStart = new Date(schWeekStart);
  schWeekStart.setDate(schWeekStart.getDate() + dir * 7);
  schDayIdx = null;
  renderWeekCal();
}

function schGoToday() {
  const d = new Date(today);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  schWeekStart = d;
  schDayIdx = null;
  renderWeekCal();
}

function schSelectDay(i) {
  schDayIdx = i;
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

  // Групповые тренировки недели в выбранном филиале (индивидуальные занятия — на своём экране)
  const loc = schLoc();
  const locId = loc ? Number(loc.id) : null;
  const weekSlots = SLOTS.filter(function (s) {
    return s.date >= schWeekStart && s.date <= weekEnd &&
      (locId === null || Number(s.location_id) === locId) &&
      !slotIsIndividual(s);
  });

  // ── Шапка: угол + заголовки дней ──
  let h = '<div class="wg-corner"></div>';
  const strip = [];   // лента дней для вида «один день» на телефоне
  days.forEach(function (d, di) {
    const isToday = d.getTime() === today.getTime();
    const isPast = d < today;
    strip.push({ date: d, muted: isPast && !isToday });
    // Шапка дня — компактная: день недели и дата в одну строку
    h += '<div class="wg-day-hdr' + (isToday ? ' today' : '') + (isPast && !isToday ? ' past' : '') + '">'
      + '<div class="wg-dow">' + DAYS_SHORT[di] + '</div>'
      + '<div class="wg-date">' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + '</div>'
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
        const spotsText = full && !booked ? 'Мест нет' : slotFree(s) + '/' + slotCap(s) + ' мест';

        // Размер слота: xs<28, sm<44, md<70, lg>=70
        var sizeClass = heightPx < 28 ? 'slot-xs' : heightPx < 44 ? 'slot-sm' : heightPx < 70 ? 'slot-md' : 'slot-lg';
        let cls = 'wg-slot ' + colorClass(s.cat, s.type) + ' ' + sizeClass;
        if (booked) cls += ' booked';
        else if (full) cls += ' full';

        var bookLabel = booked ? '✓ Вы записаны' : full ? 'Мест нет' : 'Записаться';
        var bookOnclick = (!full && !booked)
          ? 'event.stopPropagation();openBookingModal(' + s.id + ')'
          : 'event.stopPropagation()';

        var feats = [];
        if (s.features) { try { feats = Array.isArray(s.features) ? s.features : JSON.parse(s.features); } catch (e) { } }
        // Подсказка при наведении — всегда время, название и тренер (узкий слот при нескольких занятиях
        // в одно время не вмещает текст), плюс описание и особенности, если есть
        var tipAttr = ' data-name="' + escAttr([s.time, s.name, s.specialist].filter(Boolean).join(' · ')) + '"';
        if (s.description) tipAttr += ' data-desc="' + escAttr(s.description) + '"';
        if (feats && feats.length) tipAttr += ' data-feat="' + escAttr(JSON.stringify(feats)) + '"';
        cellHtml += '<div class="' + cls + '" style="top:' + topPx + 'px;height:' + heightPx + 'px;' + wgLaneStyle(dayLayouts[di].get(s.id)) + '"' + tipAttr + ' onclick="' + (booked || full ? 'openSlotDetail(' + s.id + ')' : 'openBookingModal(' + s.id + ')') + '">';
        if (heightPx >= 28) {
          cellHtml += '<div class="wg-slot-time">' + s.time + '</div>';
        }
        if (heightPx >= 20) {
          cellHtml += '<div class="wg-slot-name">' + s.name + '</div>';
        }
        // Тренер — когда хватает высоты (занятие от часа); места — от 45 минут
        if (heightPx >= 88 && s.specialist) {
          cellHtml += '<div class="wg-slot-meta wg-slot-spec">' + escAttr(s.specialist) + '</div>';
        }
        if (heightPx >= 60) {
          cellHtml += '<div class="wg-slot-meta">' + spotsText + '</div>';
        }
        // Кнопка всегда — адаптируется по размеру через CSS
        cellHtml += '<button class="wg-slot-book" onclick="' + bookOnclick + '">' + bookLabel + '</button>';
        cellHtml += '</div>';
      });

      cellHtml += '</div>';

      h += '<div class="wg-day-col' + (isToday ? ' today-col' : '') + (isPast && !isToday ? ' past-col' : '') + '" data-di="' + di + '">' + cellHtml + '</div>';
    });
  }

  grid.innerHTML = h;
  if (schDayIdx === null) schDayIdx = wgDefaultDay(schWeekStart);
  wgRenderDayStrip('sch-days', grid, strip, schDayIdx, 'schSelectDay');
  wcBindTip(grid);

  // На телефоне вместо сетки — список занятий выбранного дня (css/week-grid.css: .sch-list, @media max-width 700px)
  const list = document.getElementById('sch-day-list');
  if (list) {
    const sd = days[schDayIdx];
    const daySlots = weekSlots.filter(function (s) { return s.date.getTime() === sd.getTime(); })
      .sort(function (a, b) { return timeToMin(a.time) - timeToMin(b.time); });
    list.innerHTML = daySlots.length
      ? daySlots.map(function (s) { return schListRowHtml(s, alreadyBooked.has(s.id)); }).join('')
      : '<div class="sch-list-empty">В этот день групповых тренировок нет</div>';
  }
}

// Строка списка занятий дня (телефон): время и длительность, название, тренер · места · цена, кнопка записи.
// Нажатие на строку — карточка занятия с описанием; на кнопку — запись
function schListRowHtml(s, booked) {
  const full = slotFree(s) <= 0;
  const meta = [s.specialist, full ? 'мест нет' : slotFree(s) + '/' + slotCap(s) + ' мест', s.price.toLocaleString('ru') + ' ₽']
    .filter(Boolean).map(escAttr).join(' · ');
  const action = booked ? '<span class="sch-row-state booked">✓ Вы записаны</span>'
    : full ? '<span class="sch-row-state">Мест нет</span>'
      : '<button class="btn-primary sch-row-btn" onclick="event.stopPropagation();openBookingModal(' + s.id + ')">Записаться</button>';
  return '<div class="sch-row ' + colorClass(s.cat, s.type) + (booked ? ' booked' : full ? ' full' : '') + '" onclick="openSlotDetail(' + s.id + ')">'
    + '<div class="sch-row-time">' + s.time + '<span>' + fmtDurShort(s.dur) + '</span></div>'
    + '<div class="sch-row-info"><div class="sch-row-name">' + escAttr(s.name) + '</div><div class="sch-row-meta">' + meta + '</div></div>'
    + action + '</div>';
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

