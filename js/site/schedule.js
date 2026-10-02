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
  const pin = '<svg class="ico-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.800-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  box.innerHTML = '<button type="button" class="btn-ghost ms-btn u-max-w-280" title="Филиал">' + pin + escAttr(loc.name) + '</button>'
    + '<div class="ms-panel u-w-280">' + LOCATIONS.map(function (l) {
      const info = [l.address, l.phone].filter(Boolean).map(escAttr).join(' · ');
      return '<div class="ms-opt u-col u-items-start u-gap-4" onclick="selectSchLoc(' + l.id + ')">'
        + '<span class="u-strong' + (l.id === loc.id ? ' u-brand-dark' : '') + '">' + escAttr(l.name) + '</span>'
        + (info ? '<span class="u-text-small u-muted">' + info + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  document.querySelectorAll('.site-loc-name').forEach(function (el) { el.innerHTML = pin + escAttr(loc.name); });
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
  if (currentPage === 'services') renderServices();
}

// Название филиала слота/записи — только когда филиалов несколько (при одном это лишний шум)
function siteLocName(locId) {
  if (LOCATIONS.length < 2 || locId == null) return '';
  const l = LOCATIONS.find(function (x) { return Number(x.id) === Number(locId); });
  return l ? l.name : '';
}

// Слот групповой тренировки в ячейке часа сетки: время, название, тренер, места, кнопка записи.
// ROW_H — px на час, pos — колонка при пересечении занятий (wgLayoutDay), booked — клиент уже записан
function schSlotHtml(s, ROW_H, pos, booked) {
  const mins = parseInt(s.time.split(':')[1]) || 0;
  const topPx = Math.round(mins * ROW_H / 60);
  const heightPx = Math.max(Math.round(s.dur * ROW_H / 60), 36);
  const full = slotFree(s) <= 0;
  const spotsText = full && !booked ? 'Мест нет' : slotFree(s) + '/' + slotCap(s) + ' мест';

  // Размер слота: xs<28, sm<44, md<70, lg>=70
  const sizeClass = heightPx < 28 ? 'slot-xs' : heightPx < 44 ? 'slot-sm' : heightPx < 70 ? 'slot-md' : 'slot-lg';
  let cls = 'wg-slot ' + colorClass(s.cat, s.type) + ' ' + sizeClass;
  if (booked) cls += ' booked';
  else if (full) cls += ' full';

  const bookLabel = booked ? '✓ Вы записаны' : full ? 'Мест нет' : 'Записаться';
  const bookOnclick = (!full && !booked)
    ? 'event.stopPropagation();openBookingModal(' + s.id + ')'
    : 'event.stopPropagation()';

  let feats = [];
  if (s.features) { try { feats = Array.isArray(s.features) ? s.features : JSON.parse(s.features); } catch (e) { } }
  // Подсказка при наведении — всегда время, название и тренер (узкий слот при нескольких занятиях
  // в одно время не вмещает текст), плюс описание и особенности, если есть
  let tipAttr = ' data-name="' + escAttr([s.time, s.name, s.specialist].filter(Boolean).join(' · ')) + '"';
  if (s.description) tipAttr += ' data-desc="' + escAttr(s.description) + '"';
  if (feats && feats.length) tipAttr += ' data-feat="' + escAttr(JSON.stringify(feats)) + '"';
  let h = '<div class="' + cls + '" style="top:' + topPx + 'px;height:' + heightPx + 'px;' + wgLaneStyle(pos) + '"' + tipAttr + ' onclick="' + (booked || full ? 'openSlotDetail(' + s.id + ')' : 'openBookingModal(' + s.id + ')') + '">';
  if (heightPx >= 28) h += '<div class="wg-slot-time">' + s.time + '</div>';
  if (heightPx >= 20) h += '<div class="wg-slot-name">' + s.name + '</div>';
  // Тренер — когда хватает высоты (занятие от часа); места — от 45 минут
  if (heightPx >= 88 && s.specialist) h += '<div class="wg-slot-meta wg-slot-spec">' + escAttr(s.specialist) + '</div>';
  if (heightPx >= 60) h += '<div class="wg-slot-meta">' + spotsText + '</div>';
  // Кнопка всегда — адаптируется по размеру через CSS
  h += '<button class="wg-slot-book" onclick="' + bookOnclick + '">' + bookLabel + '</button>';
  return h + '</div>';
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

