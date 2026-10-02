// Админка: журнал записи — рабочий экран администратора. Один день одного филиала, по вертикали — время.
// Вкладки над доской: «Тренировки» — колонки станков зала (групповая занимает весь зал, внутри — кто на каком
// станке; персональная и самостоятельная — один станок) и по вкладке на каждую услугу филиала (байкфит, массаж…) —
// колонки её специалистов, запись на услугу занимает колонку специалиста.
// Нажатие на занятие — карточка: кто записан, станок, телефон, оплата, отмена записи. У групповой тренировки
// сверху схема зала (как в формах записи): нажатие на свободный станок — запись клиента на него.
// Нажатие на свободное время — запись клиента по звонку (js/admin/journal-book.js).
// На телефоне вместо доски — список занятий дня. Данные — api/journal.php?action=day.
// Недельное «Расписание» (js/admin/schedule.js) остаётся для планирования групповых занятий.

// ═══ JOURNAL ══════════════════════════════════════════════════════

const JR_ROW_H = 56;        // px на час
const JR_PAY = { paid: 'оплачено', unpaid: 'не оплачено', refunded: 'возврат' };
const JR_LOC_KEY = 'etalon.admJournal.location';

let jrDate = new Date(today);
let jrLocId = (function () { try { return parseInt(localStorage.getItem(JR_LOC_KEY)) || null; } catch (e) { return null; } })();
let jrData = null;          // ответ api/journal.php за выбранный день
let jrReq = 0;              // номер последнего запроса (ответ на устаревший выбор отбрасываем)
let jrView = { h0: 0, n: 0 }; // первый час доски и число станков — чтобы по месту нажатия понять время и станок
let jrTab = 'training';     // вкладка: training — зал, иначе код услуги (service_category)

function jrSelectTab(tab) { jrTab = tab; renderJournal(); }
// Занятия вкладки: тренировки или записи на выбранную услугу
function jrTabSlots() {
  return jrData.slots.filter(function (s) { return jrTab === 'training' ? s.cat === 'training' : s.cat === jrTab; });
}

function jrLoc() {
  return LOCATIONS.find(function (l) { return Number(l.id) === jrLocId; }) || LOCATIONS[0] || null;
}

// Данные дня с сервера; вызывается при входе в раздел, смене дня/филиала и после действий
async function jrLoad() {
  const loc = jrLoc();
  if (!loc) { jrData = null; return; }
  const req = ++jrReq;
  let data = null;
  try { data = await JournalAPI.day(loc.id, fmtLocalDate(jrDate)); } catch (e) { /* ошибка показана в apiRequest */ }
  if (req === jrReq) jrData = data;
}
async function jrReload() { await jrLoad(); renderJournal(); }

function jrChangeDay(dir) { jrDate = new Date(jrDate); jrDate.setDate(jrDate.getDate() + dir); jrReload(); }
function jrToday() { jrDate = new Date(today); jrReload(); }
function jrPickDate(val) { if (val) { jrDate = parseLocalDate(val); jrReload(); } }
function jrSelectLoc(id) {
  jrLocId = Number(id);
  try { localStorage.setItem(JR_LOC_KEY, String(jrLocId)); } catch (e) { /* выбор действует до перезагрузки */ }
  jrReload();
}

function jrStationLabel(id) {
  const st = jrData && jrData.stations.find(function (x) { return x.id === id; });
  return st ? st.label : '';
}
// Имя для клетки доски: «Иван П.» из «Иван Петров»
function jrShortName(name) {
  const p = String(name || '').trim().split(/\s+/);
  return p.length > 1 ? p[0] + ' ' + p[1][0] + '.' : (p[0] || '');
}
// Кто ведёт занятие — подписью: у тренировки «тренер Анна Козлова» (чтобы не путать с клиентами), у услуги — имя специалиста
function jrSpecLabel(s) { return s.specialist ? (s.cat === 'training' ? 'тренер ' : '') + s.specialist : ''; }
// Вид занятия для подписи и цвета: group / ind (персональная, самостоятельная) / svc (услуга)
function jrKind(s) { return s.cat !== 'training' ? 'svc' : s.individual ? 'ind' : 'group'; }

function renderJournal() {
  const loc = jrLoc();
  // Шапка: день и филиал
  const d = jrDate;
  document.getElementById('jr-date-label').textContent = DAYS_FULL[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ' ' + d.getFullYear();
  document.getElementById('jr-date-input').value = fmtLocalDate(d);
  const locBox = document.getElementById('jr-locs');
  locBox.innerHTML = LOCATIONS.length > 1 ? LOCATIONS.map(function (l) {
    return '<button class="chip' + (loc && l.id === loc.id ? ' active' : '') + '" onclick="jrSelectLoc(' + l.id + ')">' + escAttr(l.name) + '</button>';
  }).join('') : '';

  const board = document.getElementById('jr-board');
  const list = document.getElementById('jr-list');
  const tabs = document.getElementById('jr-tabs');
  const legend = document.getElementById('jr-legend');
  if (!jrData) { tabs.innerHTML = ''; legend.innerHTML = ''; board.innerHTML = ''; list.innerHTML = '<div class="jr-empty">Нет данных</div>'; return; }

  // Вкладки: тренировки и услуги филиала; рядом с названием — сколько записей в этот день
  const cats = jrData.categories || [];
  if (jrTab !== 'training' && !cats.some(function (c) { return c.code === jrTab; })) jrTab = 'training';
  const isTraining = jrTab === 'training';
  const booked = function (code) {
    return jrData.slots.reduce(function (n, x) { return n + (x.cat === code ? x.bookings.length : 0); }, 0);
  };
  tabs.innerHTML = [{ code: 'training', name: 'Тренировки' }].concat(cats).map(function (c) {
    const n = booked(c.code);
    return '<button class="chip' + (c.code === jrTab ? ' active' : '') + '" onclick="jrSelectTab(\'' + c.code + '\')">' + escAttr(c.name) + (n ? ' · ' + n : '') + '</button>';
  }).join('');
  legend.innerHTML = isTraining
    ? '<span><i class="jr-dot jr-dot--group"></i>Групповая</span>'
      + '<span><i class="jr-dot jr-dot--ind kind-personal"></i>Персональная</span>'
      + '<span><i class="jr-dot jr-dot--ind kind-free"></i>Самостоятельная</span>'
    : '<span><i class="jr-dot jr-dot--ind cat-' + jrTab + '"></i>Запись</span>'
      + '<span><i class="jr-dot jr-dot--off"></i>Специалист не работает</span>';

  const slots = jrTabSlots();
  const specs = isTraining ? [] : jrData.specialists.filter(function (sp) { return (sp.cats || []).indexOf(jrTab) >= 0; });

  // Диапазон часов: режим работы филиала в этот день, расширенный занятиями; филиал закрыт и занятий нет — сообщение
  const stationsCount = jrData.stations.length;
  let from = jrData.hours ? jrData.hours.from : Infinity, to = jrData.hours ? jrData.hours.to : -Infinity;
  jrData.slots.forEach(function (s) { from = Math.min(from, s.from); to = Math.max(to, s.to); });
  if (from === Infinity) {
    board.innerHTML = '<div class="jr-empty">Филиал в этот день не работает</div>';
    list.innerHTML = board.innerHTML;
    return;
  }
  const h0 = Math.floor(from / 60), h1 = Math.ceil(to / 60);
  jrView = { h0: h0, n: stationsCount };
  const px = function (min) { return Math.round((min - h0 * 60) * JR_ROW_H / 60); };
  const height = (h1 - h0) * JR_ROW_H;
  const stations = jrData.stations, n = Math.max(stations.length, 1);
  const pos = function (s) { return 'top:' + px(s.from) + 'px;height:' + (px(s.to) - px(s.from) - 2) + 'px;'; };
  const time = function (s) { return minToTime(s.from) + '–' + minToTime(s.to); };
  let times = '';
  for (let hr = h0; hr < h1; hr++) times += '<div class="jr-time" style="height:' + JR_ROW_H + 'px">' + String(hr).padStart(2, '0') + ':00</div>';
  const bodyOpen = '<div class="jr-body" style="height:' + height + 'px;--jr-row-h:' + JR_ROW_H + 'px"><div class="jr-times">' + times + '</div>';

  if (isTraining) {
    // ── Доска зала: колонки — станки ──
    let hallBlocks = '', lines = '';
    for (let i = 1; i < n; i++) lines += '<div class="jr-vline" style="left:' + (i * 100 / n) + '%"></div>';
    slots.forEach(function (s) {
      if (!s.individual) {
        // Групповая — на весь зал; под названием — кто на каком станке
        const cells = stations.map(function (st) {
          const b = s.bookings.find(function (x) { return x.station_id === st.id; });
          return '<span class="' + (b ? 'on' : '') + '">' + (b ? escAttr(jrShortName(b.name)) : s.blocked.indexOf(st.id) >= 0 ? '✕' : '') + '</span>';
        }).join('');
        hallBlocks += '<div class="jr-blk jr-blk--group" style="left:0;width:100%;' + pos(s) + '" onclick="event.stopPropagation();jrOpenSlot(' + s.id + ')" title="' + escAttr(time(s) + ' · ' + s.name) + '">'
          + '<div class="jr-blk-title">' + escAttr([s.name, jrSpecLabel(s)].filter(Boolean).join(' · ')) + ' · ' + s.bookings.length + ' из ' + (stations.length - s.blocked.length) + '</div>'
          + '<div class="jr-blk-seats" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + cells + '</div></div>';
      } else {
        // Персональная / самостоятельная — на станке клиента (станок не указан — первая колонка)
        const b = s.bookings[0];
        const idx = Math.max(0, stations.findIndex(function (st) { return b && st.id === b.station_id; }));
        hallBlocks += '<div class="jr-blk jr-blk--ind kind-' + (s.type === 'free' ? 'free' : 'personal') + '" style="left:' + (idx * 100 / n) + '%;width:calc(' + (100 / n) + '% - 4px);' + pos(s) + '" onclick="event.stopPropagation();jrOpenSlot(' + s.id + ')" title="' + escAttr(time(s) + ' · ' + s.name) + '">'
          + '<div class="jr-blk-title">' + escAttr(b ? jrShortName(b.name) : '—') + '</div>'
          + '<div class="jr-blk-sub">' + (s.specialist ? 'тренер ' + escAttr(jrShortName(s.specialist)) : 'самостоятельно') + '</div></div>';
      }
    });
    board.innerHTML = '<div class="jr" style="min-width:' + (60 + stations.length * 86) + 'px">'
      + '<div class="jr-head"><div class="jr-time-h"></div>'
      + '<div class="jr-hall-h" style="flex:' + n + '">' + (stations.length
        ? stations.map(function (st) { return '<div class="jr-col-h" title="' + escAttr(st.type_name) + '">' + escAttr(st.label) + '</div>'; }).join('')
        : '<div class="jr-col-h">В зале нет станков</div>') + '</div></div>'
      + bodyOpen
      + '<div class="jr-hall" style="flex:' + n + '" onclick="jrFreeClick(event,this)" onmousemove="jrHover(event,this)" onmouseleave="jrHoverOff(this)"><div class="jr-plus"></div>' + lines + hallBlocks + '</div>'
      + '</div></div>';
  } else if (!specs.length) {
    board.innerHTML = '<div class="jr-empty">В этот день специалисты услуги в филиале не работают</div>';
  } else {
    // ── Доска услуги: колонки — её специалисты ──
    const specCols = specs.map(function (sp) {
      // Нерабочее время специалиста в этом филиале — серым
      let off = '', cur = h0 * 60;
      sp.work.concat([{ from: h1 * 60, to: h1 * 60 }]).forEach(function (w) {
        if (w.from > cur) off += '<div class="jr-off" style="top:' + px(cur) + 'px;height:' + (px(w.from) - px(cur)) + 'px"></div>';
        cur = Math.max(cur, w.to);
      });
      const blocks = slots.filter(function (s) { return s.specialist_id === sp.id; }).map(function (s) {
        const b = s.bookings[0];
        return '<div class="jr-blk jr-blk--svc" style="left:0;width:100%;' + pos(s) + '" onclick="event.stopPropagation();jrOpenSlot(' + s.id + ')" title="' + escAttr(time(s) + ' · ' + s.name) + '">'
          + '<div class="jr-blk-title">' + escAttr(b ? b.name : '—') + '</div><div class="jr-blk-sub">' + escAttr(s.name) + '</div></div>';
      }).join('');
      return { head: '<div class="jr-col-h jr-col-h--spec" title="' + escAttr(sp.full_name) + '">' + escAttr(sp.full_name) + '</div>', body: '<div class="jr-spec" data-spec="' + sp.id + '" onclick="jrFreeClick(event,this)" onmousemove="jrHover(event,this)" onmouseleave="jrHoverOff(this)"><div class="jr-plus"></div>' + off + blocks + '</div>' };
    });
    // цвет услуги — классом категории на доске; ширина — по числу специалистов (одна колонка не растягивается на весь экран)
    board.innerHTML = '<div class="jr cat-' + jrTab + '" style="min-width:' + (60 + specCols.length * 160) + 'px;max-width:' + (60 + specCols.length * 360) + 'px">'
      + '<div class="jr-head"><div class="jr-time-h"></div>' + specCols.map(function (c) { return c.head; }).join('') + '</div>'
      + bodyOpen + specCols.map(function (c) { return c.body; }).join('') + '</div></div>';
  }

  // ── Список (телефон) ──
  list.innerHTML = slots.length ? slots.map(function (s) {
    const who = s.bookings.map(function (b) {
      const st = jrStationLabel(b.station_id);
      return escAttr(b.name) + (st ? ' <span>' + escAttr(st) + '</span>' : '');
    }).join(', ');
    const kind = jrKind(s);
    // Цвет полосы — по виду: групповая и услуга — цвет категории, персональная и самостоятельная — свой
    const color = kind === 'ind' ? 'kind-' + (s.type === 'free' ? 'free' : 'personal') : 'cat-' + s.cat;
    return '<div class="jr-row ' + color + '" onclick="jrOpenSlot(' + s.id + ')">'
      + '<div class="jr-row-time">' + minToTime(s.from) + '<span>' + minToTime(s.to) + '</span></div>'
      + '<div class="jr-row-info"><div class="jr-row-name">' + escAttr(s.name) + '</div>'
      + '<div class="jr-row-meta">' + [jrSpecLabel(s), kind === 'group' ? s.bookings.length + ' из ' + (stations.length - s.blocked.length) + ' мест' : ''].filter(Boolean).map(escAttr).join(' · ') + '</div>'
      + (who ? '<div class="jr-row-who">' + who + '</div>' : '') + '</div></div>';
  }).join('') : '<div class="jr-empty">' + (isTraining ? 'В этот день тренировок и записей нет' : 'В этот день записей на услугу нет') + '</div>';
}

// Нажатие на свободное место доски — запись клиента (js/admin/journal-book.js): в зале — на станок под курсором,
// в колонке специалиста — на услугу открытой вкладки к нему. Время — по высоте нажатия, с шагом 30 минут
function jrFreeClick(e, col) {
  const p = jrPoint(e, col);
  if (col.dataset.spec) { jbOpen({ specId: Number(col.dataset.spec), cat: jrTab, start: p.start }); return; }
  const st = jrData.stations[p.idx];
  jbOpen({ stationId: st ? st.id : null, start: p.start });
}

// Место под курсором: время начала (шаг 30 минут) и номер колонки станка (в колонке специалиста — 0)
function jrPoint(e, col) {
  const r = col.getBoundingClientRect();
  const cols = col.dataset.spec ? 1 : Math.max(jrView.n, 1);
  return {
    start: jrView.h0 * 60 + Math.floor((e.clientY - r.top) * 60 / JR_ROW_H / 30) * 30,
    idx: Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - r.left) * cols / r.width))),
    cols: cols,
  };
}

// «+» на свободном месте под курсором — как в недельном расписании (над занятием не показываем)
function jrHover(e, col) {
  const plus = col.querySelector('.jr-plus');
  if (!plus) return;
  if (e.target.closest('.jr-blk')) { plus.style.display = 'none'; return; }
  const p = jrPoint(e, col);
  plus.style.display = 'flex';
  plus.style.left = (p.idx * 100 / p.cols) + '%';
  plus.style.width = (100 / p.cols) + '%';
  plus.style.top = Math.round((p.start - jrView.h0 * 60) * JR_ROW_H / 60) + 'px';
  plus.style.height = (JR_ROW_H / 2) + 'px';
}
function jrHoverOff(col) {
  const plus = col.querySelector('.jr-plus');
  if (plus) plus.style.display = 'none';
}

// ═══ КАРТОЧКА ЗАНЯТИЯ: кто записан, станок, телефон, оплата, отмена ═══

function jrOpenSlot(slotId) {
  const s = jrData && jrData.slots.find(function (x) { return x.id === slotId; });
  if (!s) return;
  const old = document.getElementById('jr-slot-modal'); if (old) old.remove();
  const d = parseLocalDate(jrData.date);
  const kind = jrKind(s);
  const stations = jrData.stations;
  // Кто записан: станок, клиент, телефон, оплата, комментарий — и действия: отмена; у индивидуальной записи — перенос
  const rows = s.bookings.map(function (b) {
    const st = jrStationLabel(b.station_id);
    return '<div class="jr-card-row"><div><div class="jr-card-name">' + (st ? escAttr(st) + ' · ' : '') + escAttr(b.name) + '</div>'
      + '<div class="jr-card-meta">' + [b.phone, JR_PAY[b.payment_status] || b.payment_status].filter(Boolean).map(escAttr).join(' · ') + '</div>'
      + (b.notes ? '<div class="jr-card-meta">«' + escAttr(b.notes) + '»</div>' : '') + '</div>'
      + '<div class="u-flex u-gap-6 u-shrink-0">'
      + (s.individual ? '<button class="action-btn confirm btn-sm" onclick="jbOpenMove(' + s.id + ')">Перенести</button>' : '')
      + '<button class="action-btn cancel btn-sm" onclick="jrCancelBooking(' + b.id + ',' + s.id + ')">Отменить</button></div></div>';
  }).join('');
  // У групповой — схема зала этого занятия: тот же элемент, что в формах записи (hallFill, js/site/booking.js).
  // Нажатие на свободный станок — запись клиента на него
  const hall = kind === 'group'
    ? '<div id="jr-card-hall" class="hall-scheme"></div><div class="station-hint" id="jr-card-hall-hint">Загрузка схемы зала…</div>'
    : '';
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'jr-slot-modal';
  el.innerHTML = '<div class="admin-modal u-max-w-560">'
    + '<div class="admin-modal-title">' + escAttr(s.name) + '</div>'
    + '<div class="jr-card-sub">' + [d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ', ' + minToTime(s.from) + '–' + minToTime(s.to),
      jrSpecLabel(s), kind === 'group' ? s.bookings.length + ' из ' + (stations.length - s.blocked.length) + ' мест' : s.price.toLocaleString('ru') + ' ₽'].filter(Boolean).map(escAttr).join(' · ') + '</div>'
    + hall + (rows || '<div class="jr-card-row"><div class="jr-card-meta">Записей нет</div></div>')
    + '<div class="admin-modal-actions"><button class="btn-ghost" onclick="document.getElementById(\'jr-slot-modal\').remove()">Закрыть</button></div></div>';
  document.body.appendChild(el);
  if (kind === 'group') jrCardHall(s.id);
}

// Схема зала в карточке групповой тренировки: свободные станки — кнопки записи (jbOpenGroup)
let jrCardSlotId = null;
async function jrCardHall(slotId) {
  jrCardSlotId = slotId;
  let data = null;
  try { data = await StationsAPI.availability(slotId); } catch (e) { /* подпись под схемой */ }
  const box = document.getElementById('jr-card-hall'), hint = document.getElementById('jr-card-hall-hint');
  if (!box || jrCardSlotId !== slotId) return;   // карточку закрыли или открыли другую
  if (!data) { hint.textContent = 'Не удалось загрузить схему зала'; return; }
  hallFill(box, data, null, 'jrCardStation');
  const free = data.stations.filter(function (x) { return x.state === 'free'; }).length;
  hint.textContent = free ? 'Свободно: ' + free + '. Нажмите на станок, чтобы записать клиента.' : 'Свободных станков нет';
}
function jrCardStation(stationId) { jbOpenGroup(jrCardSlotId, stationId); }

async function jrCancelBooking(bookingId, slotId) {
  if (!confirm('Отменить запись клиента?')) return;
  try { await BookingsAPI.setStatus(bookingId, 'cancelled'); } catch (e) { return; }   // ошибка показана в apiRequest
  showToast('Запись отменена');
  // Счётчики мест и недельное расписание берут данные из слотов — перечитываем и их
  await Promise.allSettled([jrLoad(), loadSlots(jrDate, jrDate)]);
  renderJournal();
  const modal = document.getElementById('jr-slot-modal'); if (modal) modal.remove();
  // Групповое занятие остаётся — показываем обновлённую карточку; индивидуальное снято вместе с записью
  if (jrData && jrData.slots.some(function (x) { return x.id === slotId; })) jrOpenSlot(slotId);
}
