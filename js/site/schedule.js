// Сайт: общее для клиентских экранов — выбор филиала, перерисовка экранов, групповая тренировка в сетке и в списке
// дня (сам экран — js/site/trainings.js), всплывающее описание тренировки

// ═══ SCHEDULE ════════════════════════════════════════════════════

// ── Филиал: на экранах сайта всегда ровно один. Выбор запоминается в браузере ──
const SCH_LOC_KEY = 'etalon.site.location';
let schLocId = (function () {
  try { return parseInt(localStorage.getItem(SCH_LOC_KEY)) || null; } catch (e) { return null; }
})();

// Выбранный филиал среди действующих; сохранённого нет или он закрыт — первый действующий
function schLoc() {
  return LOCATIONS.find(function (l) { return Number(l.id) === schLocId; }) || LOCATIONS[0] || null;
}

// Выбор филиала в шапке — один вид для сайта (#nav-loc) и панели администратора (#adm-branch, js/admin/data-nav.js):
// кнопка с меткой и названием, по нажатию — список филиалов с адресом и телефоном (готовый выпадающий .ms из js/ui.js).
// list — филиалы, curId — выбранный (null — «все»), label — подпись кнопки, onSelect — имя функции выбора (получает id
// или '' для «всех»), allLabel — пункт «Все филиалы», если он нужен
const LOC_PIN = '<svg class="ico-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.800-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
function locPickerHtml(list, curId, label, onSelect, allLabel) {
  const opt = function (id, name, info, on) {
    return '<div class="ms-opt u-col u-items-start u-gap-4" onclick="' + onSelect + '(' + (id === '' ? "''" : id) + ')">'
      + '<span class="u-strong' + (on ? ' u-brand-dark' : '') + '">' + escAttr(name) + '</span>'
      + (info ? '<span class="u-text-small u-muted">' + info + '</span>' : '') + '</div>';
  };
  return '<button type="button" class="btn-ghost ms-btn u-max-w-280" title="Филиал">' + LOC_PIN + escAttr(label) + '</button>'
    + '<div class="ms-panel u-w-280">' + (allLabel ? opt('', allLabel, '', curId === null) : '')
    + list.map(function (l) {
      return opt(l.id, l.name, [l.address, l.phone].filter(Boolean).map(escAttr).join(' · '), Number(l.id) === Number(curId));
    }).join('') + '</div>';
}

// Выбор филиала — в шапке сайта, справа (#nav-loc), как выбор города: кнопка с названием выбранного филиала,
// по нажатию — список филиалов с адресом и телефоном. Список — готовый выпадающий .ms (js/ui.js открывает его
// по кнопке .ms-btn, закрывает нажатием мимо и клавишей Esc).
// Филиал один — выбирать не из чего: блока в шапке нет
function renderSchLoc() {
  const box = document.getElementById('nav-loc');
  const loc = schLoc();
  if (!box) return;
  box.hidden = !loc || LOCATIONS.length < 2;
  // На телефоне выбор спрятан в меню шапки — название выбранного филиала показываем под заголовком экрана (.site-loc-name)
  document.querySelectorAll('.site-loc-name').forEach(function (el) { el.innerHTML = ''; });
  if (box.hidden) { box.innerHTML = ''; return; }
  box.innerHTML = locPickerHtml(LOCATIONS, loc.id, loc.name, 'selectSchLoc');
  document.querySelectorAll('.site-loc-name').forEach(function (el) { el.innerHTML = LOC_PIN + escAttr(loc.name); });
}

function selectSchLoc(id) {
  schLocId = Number(id);
  try { localStorage.setItem(SCH_LOC_KEY, String(schLocId)); } catch (e) { /* хранилище недоступно — выбор до перезагрузки */ }
  document.getElementById('nav-loc').classList.remove('open');
  navToggle(false);   // на телефоне выбор филиала — в выпадающем меню шапки
  renderSitePages();
}

// Перерисовать то, что зависит от филиала и от того, кто вошёл: выбор филиала в шапке и открытый сейчас экран
function renderSitePages() {
  renderSchLoc();
  if (currentPage === 'trainings') renderTrainings();
  if (currentPage === 'catalog') renderCatalog();
  if (currentPage === 'services') renderServices();
}

// Название филиала слота/записи — только когда филиалов несколько (при одном это лишний шум)
function siteLocName(locId) {
  if (LOCATIONS.length < 2 || locId == null) return '';
  const l = LOCATIONS.find(function (x) { return Number(x.id) === Number(locId); });
  return l ? l.name : '';
}

// Занятие уже началось или прошло: записаться на него нельзя (сервер проверяет то же по времени филиала)
function slotStarted(s) {
  const t = s.time.split(':');
  const start = new Date(s.date);
  start.setHours(parseInt(t[0]) || 0, parseInt(t[1]) || 0, 0, 0);
  return start <= new Date();
}
const SLOT_CLOSED = 'Запись закрыта';

// Строка списка занятий дня (телефон): время и длительность, название, тренер · места · цена, кнопка записи.
// Нажатие на строку — карточка занятия с описанием; на кнопку — запись
function schListRowHtml(s, booked) {
  const closed = slotStarted(s);
  const full = closed || slotFree(s) <= 0;
  const meta = [s.specialist, closed ? '' : full ? 'мест нет' : slotFree(s) + '/' + slotCap(s) + ' мест', s.price.toLocaleString('ru') + ' ₽']
    .filter(Boolean).map(escAttr).join(' · ');
  const action = booked ? '<span class="sch-row-state booked">✓ Вы записаны</span>'
    : full ? '<span class="sch-row-state">' + (closed ? SLOT_CLOSED : 'Мест нет') + '</span>'
      : '<button class="btn-primary sch-row-btn" onclick="event.stopPropagation();openBookingModal(' + s.id + ')">Записаться</button>';
  return '<div class="sch-row ' + colorClass(s.cat, s.type) + (booked ? ' booked' : full ? ' full' : '') + '" onclick="openSlotDetail(' + s.id + ')">'
    + '<div class="sch-row-time">' + s.time + '<span>' + fmtDurShort(s.dur) + '</span></div>'
    + '<div class="sch-row-info"><div class="sch-row-name">' + escAttr(s.name) + '</div><div class="sch-row-meta">' + meta + '</div></div>'
    + action + '</div>';
}
