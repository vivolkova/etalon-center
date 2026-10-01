// Сайт: экран «Индивидуальные тренировки» — персональная (с тренером) и самостоятельная.
// Над сеткой клиент выбирает тип, тренера (у персональной) или длительность (у самостоятельной); недельная сетка
// показывает только то, на что можно записаться: зелёные времена начала и серые блоки с причиной недоступности.
// Нажатие на время открывает форму со схемой зала — клиент сам выбирает станок.
// Занятость и свободное время считает сервер (api/individual.php?action=week), при записи он же всё перепроверяет.

// ═══ INDIVIDUAL TRAININGS PAGE ════════════════════════════════════

let indPg = { locId: null, item: null, spec: null, dur: null, week: null };
let indPgReq = 0;   // номер последнего запроса недели (ответ на устаревший выбор отбрасываем)
let indPgWeekStart = (function () {
  const d = new Date(today);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
})();

// Подписи серых блоков сетки по причине недоступности (reason из api/individual.php indDayBlocks)
const IND_REASONS = {
  off: 'Тренер не работает',
  other_loc: 'Тренер в другом филиале',
  busy: 'Тренер занят',
  group: 'Групповая тренировка',
  full: 'Нет свободных станков',
  mine: 'Вы записаны',
  closed: 'Филиал закрыт',   // добавляется на клиенте: часы сетки вне режима работы этого дня
};

// Тренировки филиала, на которые записываются индивидуально (услуги — в разделе «Услуги»)
function indPgItems() {
  const opts = IND_OPTS[indPg.locId];
  return opts ? opts.items.filter(function (i) { return i.cat === 'training'; }) : [];
}
function indPgItem() { return indPgItems().find(function (i) { return i.id === indPg.item; }); }

async function renderIndividualPage() {
  renderSchLoc();
  const loc = schLoc();
  const filters = document.getElementById('indp-filters');
  const body = document.getElementById('indp-body');
  if (!loc || !filters) return;
  const opts = await indLoadOptions(loc.id);
  if (!schLoc() || Number(schLoc().id) !== Number(loc.id)) return;   // пока грузили, филиал сменили
  const prevLoc = indPg.locId;
  indPg.locId = Number(loc.id);
  const items = opts ? indPgItems() : [];
  if (!items.length) {
    filters.innerHTML = '';
    body.style.display = 'none';
    document.getElementById('indp-empty').style.display = '';
    return;
  }
  body.style.display = '';
  document.getElementById('indp-empty').style.display = 'none';
  // Выбор сохраняем, пока он подходит филиалу
  if (prevLoc !== indPg.locId || !indPgItem()) indPgPick(items[0]);
  indPgRenderFilters();
  indPgLoadWeek();
}

// Выбор занятия: тренер — первый из списка, длительность — минимальная
function indPgPick(it) {
  indPg.item = it.id;
  indPg.spec = it.needs_specialist && it.specialists.length ? Number(it.specialists[0].id) : null;
  indPg.dur = it.durations[0];
}
function indPgSelectItem(id) {
  const it = indPgItems().find(function (i) { return i.id === Number(id); });
  if (!it) return;
  indPgPick(it); indPgRenderFilters(); indPgLoadWeek();
}
function indPgSelectSpec(id) { indPg.spec = Number(id); indPgRenderFilters(); indPgLoadWeek(); }
function indPgSelectDur(m) { indPg.dur = Number(m); indPgRenderFilters(); indPgLoadWeek(); }

// День для вида «один день» на телефоне (0 = Пн); null — по умолчанию для недели (wgDefaultDay)
let indPgDayIdx = null;

function indPgChangeWeek(dir) {
  indPgWeekStart = new Date(indPgWeekStart);
  indPgWeekStart.setDate(indPgWeekStart.getDate() + dir * 7);
  indPgDayIdx = null;
  indPgLoadWeek();
}
function indPgToday() {
  const d = new Date(today);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  indPgWeekStart = d;
  indPgDayIdx = null;
  indPgLoadWeek();
}
// Данные недели уже загружены — день переключается без запроса
function indPgSelectDay(i) {
  indPgDayIdx = i;
  indPgRenderGrid();
}

function indPgRenderFilters() {
  const it = indPgItem();
  const row = function (label, chips) {
    return '<div class="indp-row"><span class="indp-row-label">' + label + '</span><div class="filter-chips">' + chips + '</div></div>';
  };
  let h = row('Тренировка', indPgItems().map(function (i) {
    return indChip(escAttr(i.name), i.id === indPg.item, 'indPgSelectItem(' + i.id + ')');
  }).join(''));
  if (it.needs_specialist) {
    h += row('Тренер', it.specialists.map(function (s) {
      return indChip(escAttr(s.full_name || s.name), Number(s.id) === indPg.spec, 'indPgSelectSpec(' + s.id + ')');
    }).join(''));
  }
  if (it.durations.length > 1) {
    h += row('Длительность', it.durations.map(function (m) {
      return indChip(fmtDurShort(m), m === indPg.dur, 'indPgSelectDur(' + m + ')');
    }).join(''));
  }
  // У самостоятельной цена растёт с длительностью — показываем, из чего она складывается
  const formula = it.extra_price && it.durations.length > 1
    ? '<span>' + it.price.toLocaleString('ru') + ' ₽ за ' + fmtDurShort(it.duration) + ', далее +' + it.extra_price.toLocaleString('ru') + ' ₽ за каждые ' + fmtDurShort(IND_OPTS[indPg.locId].step) + '</span>'
    : '';
  h += '<div class="indp-price">' + fmtDurShort(indPg.dur) + ' · ' + indPgPrice(it, indPg.dur).toLocaleString('ru') + ' ₽'
    + formula + (it.summary ? '<span>' + escAttr(it.summary) + '</span>' : '') + '</div>';
  document.getElementById('indp-filters').innerHTML = h;
}

// Цена тренировки выбранной длительности (сервер считает её для каждой длительности — prices; он же берёт её при записи)
function indPgPrice(it, dur) {
  const i = it.durations.indexOf(dur);
  return it.prices && i >= 0 ? it.prices[i] : it.price;
}

// Неделя с сервера; пока грузится — прежняя сетка остаётся на месте, приглушённая
async function indPgLoadWeek() {
  const grid = document.getElementById('indp-grid');
  indPgRenderHeader();
  grid.classList.add('wg--loading');
  const req = ++indPgReq;
  let week = null;
  try {
    week = await IndividualAPI.week({ library_id: indPg.item, specialist_id: indPg.spec, duration: indPg.dur, from: fmtLocalDate(indPgWeekStart) });
  } catch (e) {
    if (req === indPgReq) showToast(e.message || 'Не удалось загрузить расписание', 'error');
  }
  if (req !== indPgReq) return;
  grid.classList.remove('wg--loading');
  indPg.week = week;
  indPgRenderGrid();
}

function indPgRenderHeader() {
  const s = indPgWeekStart, e = new Date(s); e.setDate(s.getDate() + 6);
  const el = document.getElementById('indp-month');
  if (!el) return;
  el.textContent = s.getMonth() === e.getMonth()
    ? s.getDate() + ' – ' + e.getDate() + ' ' + MONTHS_RU[s.getMonth()] + ' ' + s.getFullYear()
    : s.getDate() + ' ' + MONTHS_RU[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS_RU[e.getMonth()] + ' ' + s.getFullYear();
}

function indPgRenderGrid() {
  const grid = document.getElementById('indp-grid');
  if (!grid) return;
  const week = indPg.week;
  if (!week) { grid.innerHTML = ''; return; }
  const ROW_H = wgRowHeight(grid);
  const px = function (min) { return Math.round(min * ROW_H / 60); };
  const hrRange = weekHourRange([], [indPg.locId]);
  const stepH = px(week.step) - 2;

  // Шапка: угол + дни
  let h = '<div class="wg-corner"></div>';
  week.days.forEach(function (day, di) {
    const d = parseLocalDate(day.date);
    const isToday = d.getTime() === today.getTime();
    const sub = day.state === 'open' ? (day.starts.length ? 'есть время' : 'нет времени')
      : day.state === 'closed' ? 'выходной' : '—';
    h += '<div class="wg-day-hdr' + (isToday ? ' today' : '') + (day.state === 'past' ? ' past' : '') + '">'
      + '<div class="wg-dow">' + DAYS_RU[di] + '</div>'
      + '<div class="wg-date">' + d.getDate() + ' ' + MONTHS_RU[d.getMonth()] + '</div>'
      + '<div class="wg-day-sub">' + sub + '</div></div>';
  });

  const rows = hrRange.end - hrRange.start;
  for (let hr = hrRange.start; hr < hrRange.end; hr++) {
    h += '<div class="wg-time-col"><div class="wg-time-row">' + String(hr).padStart(2, '0') + ':00</div></div>';
    week.days.forEach(function (day, di) {
      const d = parseLocalDate(day.date);
      let cell = '<div class="wg-cell">';
      // День целиком недоступен — одна подпись на всю колонку (в первой строке)
      if (hr === hrRange.start && (day.state === 'closed' || day.state === 'later')) {
        cell += '<div class="wg-blk wg-blk--day" style="top:0;height:' + (rows * ROW_H - 1) + 'px">'
          + (day.state === 'closed' ? 'Филиал не работает' : 'Запись откроется позже') + '</div>';
      }
      if (day.state !== 'closed' && day.state !== 'later') {
        // Сетка идёт по самому раннему открытию и позднему закрытию за неделю — часы вне режима этого дня закрашиваем
        const wh = locDayHours(indPg.locId, (d.getDay() + 6) % 7);
        const blocks = day.blocks.slice();
        if (wh) {
          if (wh.from > hrRange.start * 60) blocks.push({ from: hrRange.start * 60, to: wh.from, reason: 'closed' });
          if (wh.to < hrRange.end * 60) blocks.push({ from: wh.to, to: hrRange.end * 60, reason: 'closed' });
        }
        // Что занято: блок рисуем в ячейке часа, где он начинается (высота — на всю длительность)
        blocks.forEach(function (b) {
          const from = Math.max(b.from, hrRange.start * 60), to = Math.min(b.to, hrRange.end * 60);
          if (Math.floor(from / 60) !== hr || to <= from) return;
          const height = px(to - from) - 2;
          const label = b.reason === 'mine'
            ? '<span>✓ Вы записаны' + (b.name && height >= 34 ? '<small>' + escAttr(b.name) + '</small>' : '') + '</span>'
            : IND_REASONS[b.reason] || '';
          const click = b.reason === 'mine' && b.slot_id ? ' onclick="openSlotDetail(' + b.slot_id + ')"' : '';
          cell += '<div class="wg-blk wg-blk--' + b.reason + '" style="top:' + px(from - hr * 60) + 'px;height:' + height + 'px"'
            + click + ' title="' + minToTime(b.from) + '–' + minToTime(b.to) + ' · ' + (IND_REASONS[b.reason] || '') + '">'
            + (height >= 16 ? label : '') + '</div>';
        });
        // Когда можно начать
        day.starts.forEach(function (m) {
          if (Math.floor(m / 60) !== hr) return;
          cell += '<button type="button" class="wg-free" style="top:' + px(m - hr * 60) + 'px;height:' + stepH + 'px"'
            + ' onclick="openIndBooking(\'' + day.date + '\',' + m + ')" title="Записаться на ' + minToTime(m) + '–' + minToTime(m + week.duration) + '">'
            + minToTime(m) + '</button>';
        });
      }
      cell += '</div>';
      h += '<div class="wg-day-col' + (d.getTime() === today.getTime() ? ' today-col' : '') + (day.state === 'past' ? ' past-col' : '') + '" data-di="' + di + '">' + cell + '</div>';
    });
  }
  grid.innerHTML = h;
  // Лента дней для вида «один день» на телефоне: под числом — есть ли на что записаться
  if (indPgDayIdx === null) indPgDayIdx = wgDefaultDay(parseLocalDate(week.days[0].date));
  wgRenderDayStrip('indp-days', grid, week.days.map(function (day) {
    return { date: parseLocalDate(day.date), sub: day.starts.length ? 'есть время' : '', muted: day.state !== 'open' };
  }), indPgDayIdx, 'indPgSelectDay');
}

// ═══ ФОРМА ЗАПИСИ: время выбрано в сетке, клиент выбирает станок ═══

let indB = null;   // { date, start (мин), station }

function openIndBooking(date, m) {
  if (!currentUser) { openAuth('login'); showToast('Войдите, чтобы записаться'); return; }
  const it = indPgItem();
  if (!it) return;
  indB = { date: date, start: m, station: null };
  const d = parseLocalDate(date);
  const spec = it.needs_specialist ? it.specialists.find(function (s) { return Number(s.id) === indPg.spec; }) : null;
  document.getElementById('indb-title').textContent = it.name;
  document.getElementById('indb-sub').textContent = [
    d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(m) + '–' + minToTime(m + indPg.dur),
    spec ? (spec.full_name || spec.name) : '', siteLocName(indPg.locId),
  ].filter(Boolean).join(' · ');
  document.getElementById('indb-total').textContent = fmtDurShort(indPg.dur) + ' · ' + indPgPrice(it, indPg.dur).toLocaleString('ru') + ' ₽';
  document.getElementById('indb-comment').value = '';
  const btn = document.getElementById('indb-submit');
  btn.disabled = true; btn.textContent = 'Записаться →';
  document.getElementById('indb-modal').classList.add('show');
  indBLoadHall();
}

function closeIndBooking() {
  document.getElementById('indb-modal').classList.remove('show');
  indB = null;
}

async function indBLoadHall() {
  const hall = document.getElementById('indb-hall');
  const hint = document.getElementById('indb-hint');
  const mine = indB;
  hall.innerHTML = ''; hint.textContent = 'Загрузка схемы зала…';
  let data;
  try {
    data = await IndividualAPI.stations({ library_id: indPg.item, date: mine.date, start: minToTime(mine.start), duration: indPg.dur });
  } catch (e) {
    if (indB === mine) hint.textContent = e.message || 'Не удалось загрузить схему зала';
    return;
  }
  if (indB !== mine) return;   // окно закрыли или открыли на другое время
  // Выбранный станок могли занять — сбрасываем выбор
  if (!data.stations.some(function (s) { return Number(s.id) === indB.station && s.state === 'free'; })) indB.station = null;
  hallFill(hall, data, indB.station, 'indBSelectStation');
  const free = data.stations.filter(function (s) { return s.state === 'free'; }).length;
  hint.textContent = indB.station ? 'Станок выбран ✓' : free ? 'Свободно: ' + free + '. Выберите станок.' : 'Свободных станков нет';
  document.getElementById('indb-submit').disabled = !indB.station;
}

function indBSelectStation(id) {
  indB.station = Number(id);
  document.querySelectorAll('#indb-hall .station').forEach(function (b) {
    b.classList.toggle('selected', Number(b.getAttribute('data-station')) === indB.station);
  });
  document.getElementById('indb-hint').textContent = 'Станок выбран ✓';
  document.getElementById('indb-submit').disabled = false;
}

async function confirmIndBooking() {
  if (!indB || !indB.station) { showToast('Выберите станок на схеме зала', 'error'); return; }
  const btn = document.getElementById('indb-submit');
  btn.disabled = true; btn.textContent = 'Записываем...';
  const it = indPgItem(), date = indB.date, start = indB.start;
  try {
    await IndividualAPI.create({
      library_id: indPg.item, specialist_id: indPg.spec, date: date, start: minToTime(start), duration: indPg.dur,
      station_id: indB.station, notes: document.getElementById('indb-comment').value.trim(),
    });
    closeIndBooking();
    // Новое занятие — в сетке («Вы записаны») и в «Моих записях»
    await Promise.allSettled([loadSlots(), loadMyBookings()]);
    indPgLoadWeek();
    const d = parseLocalDate(date);
    showToast('Вы записаны: ' + it.name + ', ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ' в ' + minToTime(start), 'success');
  } catch (e) {
    // Ошибка уже показана в apiRequest (время или станок могли занять) — обновляем схему зала и сетку
    if (indB) indBLoadHall();
    indPgLoadWeek();
  } finally {
    btn.textContent = 'Записаться →';
    if (indB) btn.disabled = !indB.station;
  }
}
