// Админка: журнал записи — рабочий экран администратора. Один день одного филиала, по вертикали — время.
// Вкладки над доской: «Тренировки» — один день, колонки — станки зала (групповая занимает весь зал, внутри — кто
// на каком станке; персональная и самостоятельная — один станок) и по вкладке на каждую услугу филиала (байкфит,
// мастерская…) — неделя одного её специалиста, колонки — дни.
// Нажатие на занятие — карточка: кто записан, станок, телефон, оплата, отмена записи. У групповой тренировки
// сверху схема зала (как в формах записи): нажатие на свободный станок — запись клиента на него.
// Нажатие на свободное время — запись клиента по звонку (js/admin/journal-book.js).
// У услуги специалист выбирается в списке рядом со стрелками: видно его рабочие часы, записи и свободное время
// по дням недели (jrRenderWeek); стрелки на вкладке услуги листают недели.
// На телефоне вместо доски — список занятий дня. Данные — api/journal.php?action=day.
// Недельное «Расписание» (js/admin/schedule.js) остаётся для планирования групповых занятий.

// ═══ JOURNAL ══════════════════════════════════════════════════════

const JR_ROW_H = 56;        // px на час
const JR_PAY = { paid: 'оплачено', unpaid: 'не оплачено', refunded: 'возврат' };

let jrDate = new Date(today);
const JR_OFF_SVG = '<svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><rect x="5" y="10" width="14" height="4" rx="1" fill="#fff"/></svg>';
let jrData = null;          // ответ api/journal.php за выбранный день
let jrReq = 0;              // номер последнего запроса (ответ на устаревший выбор отбрасываем)
let jrView = { h0: 0, n: 0 }; // первый час доски и число станков — чтобы по месту нажатия понять время и станок
let jrTab = 'training';     // вкладка: training — зал, иначе код услуги (service_category)

// Недельный вид (колонки — дни недели одного специалиста) — у всех услуг; день — только у тренировок
// (решение владельца 09.10.2026: сначала байкфит, затем и мастерская)
let jrWeek = null;          // данные семи дней показанной недели (Пн…Вс) — как jrData, по одному на день
// Недельный вид держит в памяти два месяца одним запросом (JR_RANGE_DAYS дней с понедельника): переход на любую
// неделю внутри загруженного — без обращения к серверу. После любого действия (запись, перенос, отмена) и при смене
// филиала данные запрашиваются заново
const JR_RANGE_DAYS = 63;   // девять полных недель — ближайшие два месяца
let jrRange = null;         // {locId, from: 'YYYY-MM-DD' (понедельник), days: [день, …]}
let jrSpec = null;          // специалист, чья неделя показана
function jrWeekTab() { return jrTab !== 'training'; }
// Услуги, на которые через этот экран пока не записывают (решение владельца 09.10.2026: запись в мастерскую не делаем):
// неделя специалиста видна, но нажатие на свободное время ничего не открывает
const JR_NO_BOOKING = ['workshop'];
// Понедельник недели выбранного дня
function jrWeekStart() {
  const d = new Date(jrDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
}
// Недельной вкладке нужны данные всей недели — при входе на неё и уходе с неё перечитываем
function jrSelectTab(tab) {
  const reload = jrWeekTab() || tab !== 'training';
  jrTab = tab;
  if (reload) jrReload(); else renderJournal();
}
function jrSelectSpec(id) { jrSpec = Number(id); renderJournal(); }
// Нажатие в колонке дня недельного вида: дальше форма записи и карточка занятия работают с этим днём
function jrWeekDay(i) {
  if (!jrWeek || !jrWeek[i]) return;
  jrDate = parseLocalDate(jrWeek[i].date);
  jrData = jrWeek[i];
}
// Занятия вкладки: тренировки или записи на выбранную услугу
function jrTabSlots() {
  return jrData.slots.filter(function (s) { return jrTab === 'training' ? s.cat === 'training' : s.cat === jrTab; });
}

// Филиал журнала — текущий филиал панели (переключатель в шапке); «все филиалы» — null: журнал ведётся по одному
function jrLoc() {
  return admCurLoc();
}

// Данные дня с сервера; вызывается при входе в раздел, смене дня/филиала и после действий
async function jrLoad() {
  const loc = jrLoc();
  if (!loc) { jrData = null; jrWeek = null; jrRange = null; return; }
  const req = ++jrReq;
  if (jrWeekTab()) {
    // неделя: два месяца одним запросом, начиная с понедельника показанной; jrData — день, выбранный в шапке
    // (с ним работают форма записи и карточка занятия)
    const from = fmtLocalDate(jrWeekStart());
    let days = null;
    try { days = await JournalAPI.range(loc.id, from, JR_RANGE_DAYS); } catch (e) { /* ошибка показана в apiRequest */ }
    if (req !== jrReq) return;
    jrRange = days ? { locId: Number(loc.id), from: from, days: days } : null;
    jrWeekPick();
    return;
  }
  let data = null;
  try { data = await JournalAPI.day(loc.id, fmtLocalDate(jrDate)); } catch (e) { /* ошибка показана в apiRequest */ }
  if (req === jrReq) jrData = data;
}
async function jrReload() { await jrLoad(); renderJournal(); }
// Показанная неделя — из загруженных дней: true, если она там есть целиком (тогда сервер не нужен)
function jrWeekPick() {
  const loc = jrLoc();
  const start = fmtLocalDate(jrWeekStart());
  const i = jrRange && loc && jrRange.locId === Number(loc.id) ? jrRange.days.findIndex(function (d) { return d.date === start; }) : -1;
  const week = i >= 0 ? jrRange.days.slice(i, i + 7) : [];
  if (week.length < 7) { jrWeek = null; jrData = null; return false; }
  jrWeek = week;
  jrData = week[(jrDate.getDay() + 6) % 7];
  return true;
}

// На недельной вкладке стрелки листают недели; соседняя неделя, уже загруженная в память, показывается без запроса
function jrChangeDay(dir) {
  jrDate = new Date(jrDate);
  jrDate.setDate(jrDate.getDate() + dir * (jrWeekTab() ? 7 : 1));
  if (jrWeekTab() && jrWeekPick()) { renderJournal(); return; }
  jrReload();
}
function jrToday() { jrDate = new Date(today); jrReload(); }
function jrPickDate(val) { if (val) { jrDate = parseLocalDate(val); jrReload(); } }

function jrStationLabel(id) {
  const st = jrData && jrData.stations.find(function (x) { return x.id === id; });
  return st ? st.label : '';
}
// Имя для клетки доски: «Иван П.» из «Иван Петров»
function jrShortName(name) {
  const p = String(name || '').trim().split(/\s+/);
  return p.length > 1 ? p[0] + ' ' + p[1][0] + '.' : (p[0] || '');
}
// Клиент в блоке занятия — белой плашкой внизу блока (тот же вид, что имена в групповой тренировке)
function jrClientChip(b) {
  return '<div class="jr-blk-seats jr-blk-seats--one"><span class="on">' + escAttr(b ? jrShortName(b.name) : '—') + '</span></div>';
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
  document.getElementById('jr-date-input').style.display = jrWeekTab() ? 'none' : '';
  document.getElementById('jr-spec-box').innerHTML = '';

  const board = document.getElementById('jr-board');
  const list = document.getElementById('jr-list');
  const tabs = document.getElementById('jr-tabs');
  const legend = document.getElementById('jr-legend');
  if (!jrData) { tabs.innerHTML = ''; legend.innerHTML = ''; board.innerHTML = ''; list.innerHTML = '<div class="jr-empty">' + (loc ? 'Нет данных' : ADM_PICK_BRANCH) + '</div>'; return; }

  // Вкладки: тренировки и услуги филиала
  const cats = jrData.categories || [];
  if (jrTab !== 'training' && !cats.some(function (c) { return c.code === jrTab; })) jrTab = 'training';
  const isTraining = jrTab === 'training';
  tabs.innerHTML = [{ code: 'training', name: 'Тренировки' }].concat(cats).map(function (c) {
    return '<button class="chip' + (c.code === jrTab ? ' active' : '') + '" onclick="jrSelectTab(\'' + c.code + '\')">' + escAttr(c.name) + '</button>';
  }).join('');
  legend.innerHTML = isTraining
    ? '<span><i class="jr-dot jr-dot--group"></i>Групповая</span>'
      + '<span><i class="jr-dot jr-dot--ind kind-personal"></i>Персональная</span>'
      + '<span><i class="jr-dot jr-dot--ind kind-free"></i>Самостоятельная</span>'
    : '<span><i class="jr-dot jr-dot--ind cat-' + jrTab + '"></i>Запись</span>'
      + '<span><i class="jr-dot jr-dot--off"></i>Специалист не работает</span>';

  if (jrWeekTab() && jrWeek) { jrRenderWeek(board, list, loc); return; }

  // дальше — только «Тренировки»: один день, колонки — станки зала
  const slots = jrTabSlots();

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
  // длительность и стоимость занятия — в блоке и в подсказке: «1 ч · 1 200 ₽»
  const cost = function (s) { return [fmtDurShort(s.to - s.from), s.price > 0 ? Number(s.price).toLocaleString('ru') + ' ₽' : ''].filter(Boolean).join(' · '); };
  let times = '';
  for (let hr = h0; hr < h1; hr++) times += '<div class="jr-time" style="height:' + JR_ROW_H + 'px">' + String(hr).padStart(2, '0') + ':00</div>';
  const bodyOpen = '<div class="jr-body" style="height:' + height + 'px;--jr-row-h:' + JR_ROW_H + 'px"><div class="jr-times">' + times + '</div>';

  {
    // ── Доска зала: колонки — станки ──
    let hallBlocks = '', lines = '';
    for (let i = 1; i < n; i++) lines += '<div class="jr-vline" style="left:' + (i * 100 / n) + '%"></div>';
    slots.forEach(function (s) {
      if (!s.individual) {
        // Групповая — на весь зал; под названием — кто на каком станке
        const cells = stations.map(function (st) {
          const b = s.bookings.find(function (x) { return x.station_id === st.id; });
          // станок заблокирован на это занятие — знак «недоступен» (красный круг с белой полосой)
          if (!b && s.blocked.indexOf(st.id) >= 0) return '<span class="off" title="Станок заблокирован">' + JR_OFF_SVG + '</span>';
          return '<span class="' + (b ? 'on' : '') + '">' + (b ? escAttr(jrShortName(b.name)) : '') + '</span>';
        }).join('');
        hallBlocks += '<div class="jr-blk jr-blk--group" style="left:0;width:100%;' + pos(s) + '" onclick="event.stopPropagation();jrOpenSlot(' + s.id + ')" title="' + escAttr([time(s), s.name, cost(s)].join(' · ')) + '">'
          + '<div class="jr-blk-title">' + escAttr([s.name, jrSpecLabel(s), cost(s)].filter(Boolean).join(' · ')) + '</div>'
          + '<div class="jr-blk-seats" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + cells + '</div></div>';
      } else {
        // Персональная / самостоятельная — на станке клиента (станок не указан — первая колонка).
      // Вид блока один для всех занятий: сверху название и кто ведёт, внизу клиенты плашками
        const b = s.bookings[0];
        const idx = Math.max(0, stations.findIndex(function (st) { return b && st.id === b.station_id; }));
        hallBlocks += '<div class="jr-blk jr-blk--ind kind-' + (s.type === 'free' ? 'free' : 'personal') + '" style="left:' + (idx * 100 / n) + '%;width:calc(' + (100 / n) + '% - 4px);' + pos(s) + '" onclick="event.stopPropagation();jrOpenSlot(' + s.id + ')" title="' + escAttr([time(s), s.name, jrSpecLabel(s)].filter(Boolean).join(' · ')) + '">'
          // блок узкий (один станок): тренер — второй строкой под названием, коротко («Максим Р.»); полностью — в подсказке
          + '<div class="jr-blk-title">' + escAttr(s.name) + (s.specialist ? '<br><span class="jr-blk-by">тренер ' + escAttr(jrShortName(s.specialist)) + '</span>' : '')
          + '<br><span class="jr-blk-by">' + escAttr(cost(s)) + '</span></div>'
          + jrClientChip(b) + '</div>';
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
  }).join('') : '<div class="jr-empty">В этот день тренировок и записей нет</div>';
}

// ── Недельный вид услуги (байкфит): неделя одного специалиста, колонки — дни ──
// Специалист — в списке над доской: все, у кого в этом филиале роль, которая ведёт услугу, и те, на кого на этой
// неделе есть записи. В колонке дня: серым — когда он не работает, блоки — записи, остальное свободно:
// нажатие на свободное время — запись клиента к нему на этот день, на запись — её карточка
function jrRenderWeek(board, list, loc) {
  const start = jrWeekStart();
  const end = new Date(start); end.setDate(start.getDate() + 6);
  document.getElementById('jr-date-label').textContent = start.getMonth() === end.getMonth()
    ? start.getDate() + ' – ' + end.getDate() + ' ' + MONTHS_FULL[end.getMonth()] + ' ' + end.getFullYear()
    : start.getDate() + ' ' + MONTHS_FULL[start.getMonth()] + ' – ' + end.getDate() + ' ' + MONTHS_FULL[end.getMonth()] + ' ' + end.getFullYear();

  const cat = ACTIVITY_CATS.find(function (c) { return c.code === jrTab; });
  const role = cat ? cat.spec_type : null;
  const specs = SPECIALISTS_DATA.filter(function (t) {
    return t.roles.some(function (r) { return r.code === role && Number(r.location_id) === Number(loc.id); });
  }).map(function (t) { return { id: Number(t.id), full_name: t.full }; });
  jrWeek.forEach(function (day) {
    day.specialists.forEach(function (sp) {
      if ((sp.cats || []).indexOf(jrTab) >= 0 && !specs.some(function (x) { return x.id === sp.id; })) specs.push({ id: sp.id, full_name: sp.full_name });
    });
  });
  if (!specs.length) {
    board.innerHTML = '<div class="jr-empty">В этом филиале нет специалистов этой услуги</div>';
    list.innerHTML = board.innerHTML;
    return;
  }
  if (!specs.some(function (x) { return x.id === jrSpec; })) jrSpec = specs[0].id;
  const mine = function (day) { return day.slots.filter(function (x) { return x.cat === jrTab && x.specialist_id === jrSpec; }); };

  // Часы доски: режим работы филиала за неделю, расширенный записями специалиста
  let from = Infinity, to = -Infinity;
  jrWeek.forEach(function (day) {
    if (day.hours) { from = Math.min(from, day.hours.from); to = Math.max(to, day.hours.to); }
    mine(day).forEach(function (x) { from = Math.min(from, x.from); to = Math.max(to, x.to); });
  });
  // список специалиста — в строке переключателя недель, рядом со стрелками (виден и на телефоне)
  document.getElementById('jr-spec-box').innerHTML = '<select class="form-input input-sm u-w-220" title="Специалист" onchange="jrSelectSpec(this.value)">'
    + specs.map(function (x) { return '<option value="' + x.id + '"' + (x.id === jrSpec ? ' selected' : '') + '>' + escAttr(x.full_name) + '</option>'; }).join('')
    + '</select>';
  if (from === Infinity) {
    board.innerHTML = '<div class="jr-empty">Филиал на этой неделе не работает</div>';
    list.innerHTML = '<div class="jr-empty">Филиал на этой неделе не работает</div>';
    return;
  }
  const h0 = Math.floor(from / 60), h1 = Math.ceil(to / 60);
  jrView = { h0: h0, n: 1 };
  const px = function (min) { return Math.round((min - h0 * 60) * JR_ROW_H / 60); };
  const cost = function (x) { return [fmtDurShort(x.to - x.from), x.price > 0 ? Number(x.price).toLocaleString('ru') + ' ₽' : ''].filter(Boolean).join(' · '); };
  let times = '';
  for (let hr = h0; hr < h1; hr++) times += '<div class="jr-time" style="height:' + JR_ROW_H + 'px">' + String(hr).padStart(2, '0') + ':00</div>';

  const canBook = JR_NO_BOOKING.indexOf(jrTab) < 0;
  let head = '', body = '';
  jrWeek.forEach(function (day, i) {
    const d = parseLocalDate(day.date);
    const isToday = d.getTime() === today.getTime();
    head += '<div class="jr-col-h jr-col-h--spec' + (isToday ? ' u-brand-dark' : '') + '">' + DAYS_RU[i] + ' ' + d.getDate() + '</div>';
    // нерабочее время специалиста в этот день — серым; его нет среди работающих — серый весь день
    const sp = day.specialists.find(function (x) { return x.id === jrSpec; });
    let off = '', cur = h0 * 60;
    (sp ? sp.work : []).concat([{ from: h1 * 60, to: h1 * 60 }]).forEach(function (w) {
      if (w.from > cur) off += '<div class="jr-off" style="top:' + px(cur) + 'px;height:' + (px(w.from) - px(cur)) + 'px"></div>';
      cur = Math.max(cur, w.to);
    });
    const blocks = mine(day).map(function (x) {
      const b = x.bookings[0];
      return '<div class="jr-blk jr-blk--svc" style="left:0;width:100%;top:' + px(x.from) + 'px;height:' + (px(x.to) - px(x.from) - 2) + 'px;"'
        + ' onclick="event.stopPropagation();jrWeekDay(' + i + ');jrOpenSlot(' + x.id + ')" title="' + escAttr([minToTime(x.from) + '–' + minToTime(x.to), x.name, cost(x)].join(' · ')) + '">'
        + '<div class="jr-blk-title">' + escAttr(x.name) + '<br><span class="jr-blk-by">' + escAttr(cost(x)) + '</span></div>' + jrClientChip(b) + '</div>';
    }).join('');
    body += canBook
      ? '<div class="jr-spec" data-spec="' + jrSpec + '" data-di="' + i + '" onclick="jrFreeClick(event,this)" onmousemove="jrHover(event,this)" onmouseleave="jrHoverOff(this)"><div class="jr-plus"></div>' + off + blocks + '</div>'
      : '<div class="jr-spec u-cursor-default">' + off + blocks + '</div>';
  });
  board.innerHTML = '<div class="jr cat-' + jrTab + '" style="min-width:' + (60 + 7 * 110) + 'px">'
    + '<div class="jr-head"><div class="jr-time-h"></div>' + head + '</div>'
    + '<div class="jr-body" style="height:' + ((h1 - h0) * JR_ROW_H) + 'px;--jr-row-h:' + JR_ROW_H + 'px"><div class="jr-times">' + times + '</div>' + body + '</div></div>';

  // Список (телефон): записи специалиста за неделю по дням
  const rows = [];
  jrWeek.forEach(function (day, i) {
    const d = parseLocalDate(day.date);
    mine(day).forEach(function (x) {
      rows.push('<div class="jr-row cat-' + x.cat + '" onclick="jrWeekDay(' + i + ');jrOpenSlot(' + x.id + ')">'
        + '<div class="jr-row-time">' + minToTime(x.from) + '<span>' + minToTime(x.to) + '</span></div>'
        + '<div class="jr-row-info"><div class="jr-row-name">' + escAttr(x.name) + '</div>'
        + '<div class="jr-row-meta">' + DAYS_RU[i] + ', ' + d.getDate() + ' ' + MONTHS_RU[d.getMonth()] + '</div>'
        + '<div class="jr-row-who">' + x.bookings.map(function (b) { return escAttr(b.name); }).join(', ') + '</div></div></div>');
    });
  });
  list.innerHTML = rows.join('') || '<div class="jr-empty">На этой неделе записей к специалисту нет</div>';
}

// Нажатие на свободное место доски — запись клиента (js/admin/journal-book.js): в зале — на станок под курсором,
// в колонке специалиста — на услугу открытой вкладки к нему. Время — по высоте нажатия, с шагом 30 минут
function jrFreeClick(e, col) {
  const p = jrPoint(e, col);
  if (col.dataset.di !== undefined) jrWeekDay(Number(col.dataset.di));
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
  // Кто записан: станок, клиент, телефон, оплата, комментарий — и действия: перенос и отмена
  const rows = s.bookings.map(function (b) {
    const st = jrStationLabel(b.station_id);
    return '<div class="jr-card-row"><div><div class="jr-card-name">' + (st ? escAttr(st) + ' · ' : '') + escAttr(b.name) + '</div>'
      + '<div class="jr-card-meta">' + [b.phone, JR_PAY[b.payment_status] || b.payment_status].concat(clientMarks({ hasAccount: b.has_account, phoneVerified: b.phone_verified, consentsOk: b.consents_ok })).filter(Boolean).map(escAttr).join(' · ') + '</div>'
      + (b.notes ? '<div class="jr-card-meta">«' + escAttr(b.notes) + '»</div>' : '') + '</div>'
      + '<div class="u-flex u-gap-6 u-shrink-0">'
      + '<button class="action-btn confirm btn-sm" onclick="' + (s.individual ? 'jbOpenMove(' + s.id + ')' : 'jbOpenGroupMove(' + s.id + ',' + b.id + ')') + '">Перенести</button>'
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
  if (!await uiConfirm('Отменить запись клиента?')) return;
  try { await BookingsAPI.setStatus(bookingId, 'cancelled'); } catch (e) { return; }   // ошибка показана в apiRequest
  showToast('Запись отменена');
  // Счётчики мест и недельное расписание берут данные из слотов — перечитываем и их
  await Promise.allSettled([jrLoad(), loadSlots(jrDate, jrDate)]);
  renderJournal();
  const modal = document.getElementById('jr-slot-modal'); if (modal) modal.remove();
  // Групповое занятие остаётся — показываем обновлённую карточку; индивидуальное снято вместе с записью
  if (jrData && jrData.slots.some(function (x) { return x.id === slotId; })) jrOpenSlot(slotId);
}
