// Админка: недельная сетка расписания, форма слота, drag&drop

// ── SCHEDULE MANAGEMENT ────────────────────────────────────────────

// ── ADMIN WEEK SCHEDULE ───────────────────────────────────────────
let ADM_ROW_H = 60;  // px на час — берётся из --wg-row-h сетки при отрисовке (css/week-grid.css)
const ADM_ADD_GUTTER = 18;   // px справа в ячейке, свободные от занятий: «+» для ещё одного занятия (css .wg--admin)

let admWeekStart = (function () {
  const d = new Date(today);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
})();

async function admWeekChange(dir) {
  admWeekStart = new Date(admWeekStart);
  admWeekStart.setDate(admWeekStart.getDate() + dir * 7);
  const weekEnd = new Date(admWeekStart); weekEnd.setDate(admWeekStart.getDate() + 6);
  await loadSlots(admWeekStart, weekEnd);
  renderAdminSchedule();
}
async function admWeekToday() {
  const d = new Date(today);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  admWeekStart = d;
  const weekEnd = new Date(admWeekStart); weekEnd.setDate(admWeekStart.getDate() + 6);
  await loadSlots(admWeekStart, weekEnd);
  renderAdminSchedule();
}

// ── Какие залы показывать в сетке: текущий филиал панели или все доступные (переключатель в шапке) ──

// ── Фильтр по специалисту: null — все; иначе id. Выбор запоминается в браузере ──
const ADM_SPEC_KEY = 'etalon.admSchedule.specialist';
let admSpecFilter = (function () {
  try { const v = parseInt(localStorage.getItem(ADM_SPEC_KEY)); return v || null; } catch (e) { return null; }
})();

function admRenderSpecFilter() {
  const sel = document.getElementById('adm-spec-filter');
  if (!sel) return;
  const list = admSpecialists().slice().sort(function (a, b) { return a.full.localeCompare(b.full, 'ru'); });
  sel.innerHTML = '<option value="">Все специалисты</option>' +
    list.map(function (t) { return '<option value="' + t.id + '">' + escAttr(t.full) + '</option>'; }).join('');
  // Сохранённый специалист больше не в списке (деактивирован) — показываем всех
  if (admSpecFilter && !list.some(function (t) { return t.id === admSpecFilter; })) admSpecFilter = null;
  sel.value = admSpecFilter || '';
}

function admSpecFilterChanged(val) {
  admSpecFilter = parseInt(val) || null;
  try {
    if (admSpecFilter) localStorage.setItem(ADM_SPEC_KEY, String(admSpecFilter));
    else localStorage.removeItem(ADM_SPEC_KEY);
  } catch (e) { /* хранилище недоступно — выбор действует до перезагрузки */ }
  renderAdminSchedule();
}

// Слот показывается при текущем фильтре специалиста
function admSpecVisible(s) {
  return !admSpecFilter || Number(s.specialist_id) === admSpecFilter;
}

// Слот показывается при текущем фильтре филиалов
function admLocVisible(s) {
  return admCurLocs().some(function (l) { return Number(l.id) === Number(s.location_id); });
}

// Название филиала слота (для подсказки; на карточке — только когда в сетке несколько филиалов)
function admSlotLocName(s) {
  if (admLocs().length < 2) return '';
  const l = findLocation(s.location_id);
  return l ? l.name : '';
}

// В сетке больше одного филиала — тогда на карточке слота пишем его филиал
function admManyLocsShown() {
  return admCurLocs().length > 1;
}

function renderAdminSchedule() {
  const grid = document.getElementById('adm-week-grid');
  if (!grid) return;
  admRenderSpecFilter();
  // Менять расписание может администратор системы; администратор студии видит его и блокирует станки на занятие
  const canEdit = canDo('schedule');
  grid.classList.toggle('wg--readonly', !canEdit);

  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Заголовок недели
  const we = new Date(admWeekStart); we.setDate(admWeekStart.getDate() + 6);
  const lbl = document.getElementById('adm-week-label');
  if (lbl) {
    const s = admWeekStart, e = we;
    lbl.textContent = s.getDate() + ' ' + MONTHS_SHORT[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS_SHORT[e.getMonth()] + ' ' + s.getFullYear();
  }

  // Строим массив дней (пн-вс)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(admWeekStart); d.setDate(admWeekStart.getDate() + i); return d;
  });

  // Слоты недели — в выбранных филиалах и у выбранного специалиста.
  // В SLOTS только расписание — групповые тренировки, которые поставил админ; слоты, созданные записью клиента
  // (slots.auto_created = 1), сервер сюда не отдаёт — они видны в «Журнале записи».
  const weekSlots = SLOTS.filter(s => {
    const sd = s.date;
    return sd >= admWeekStart && sd <= we && admLocVisible(s) && admSpecVisible(s);
  });

  // Шапка: угол + заголовки дней
  let h = '<div class="wg-corner"></div>';
  days.forEach(function (d, di) {
    const isTod = d.getTime() === today.getTime();
    h += '<div class="wg-day-hdr' + (isTod ? ' today' : '') + '">' +
      '<div class="wg-dow">' + DAYS_SHORT[di] + '</div>' +
      '<div class="wg-date">' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + '</div>' +
      '</div>';
  });

  // Временная шкала + ячейки
  ADM_ROW_H = wgRowHeight(grid);
  const hrRange = weekHourRange(weekSlots, admCurLocs().map(function (l) { return Number(l.id); }));
  // Раскладка по колонкам для пересекающихся занятий — по каждому дню целиком
  const dayLayouts = days.map(function (d) {
    return wgLayoutDay(weekSlots.filter(function (s) { return s.date.getDate() === d.getDate() && s.date.getMonth() === d.getMonth(); }));
  });
  for (let hr = hrRange.start; hr < hrRange.end; hr++) {
    const timeStr = String(hr).padStart(2, '0') + ':00';
    h += '<div class="wg-time-col"><div class="wg-time-row">' + timeStr + '</div></div>';

    days.forEach(function (d, di) {
      const isTod = d.getTime() === today.getTime();
      // Найти слоты этого часа для этого дня
      const daySlots = weekSlots.filter(function (s) {
        return s.date.getDate() === d.getDate() &&
          s.date.getMonth() === d.getMonth() &&
          parseInt(s.time.split(':')[0]) === hr;
      });

      // Час занят каким-либо занятием (начавшимся в этом часе или раньше) — «+» в полосе справа, а не по центру
      const busy = weekSlots.some(function (s) {
        if (s.date.getDate() !== d.getDate() || s.date.getMonth() !== d.getMonth()) return false;
        const st = timeToMin(s.time), en = st + (parseInt(s.dur) || 0);
        return st < (hr + 1) * 60 && en > hr * 60;
      });
      let cellHtml = "<div class='wg-cell" + (busy ? " wg-cell--busy" : "") + "' data-day='" + di + "' data-hr='" + hr + "'" + (canEdit ? " onclick='openSlotModalAtTime(" + di + "," + hr + ")' title='Добавить занятие в " + timeStr + "'" : "") + ">";

      // Рисуем слоты
      daySlots.forEach(function (s) {
        const topMin = parseInt(s.time.split(':')[1]);
        const topPx = Math.round(topMin * ADM_ROW_H / 60);
        const heightPx = Math.max(Math.round(s.dur * ADM_ROW_H / 60), 24);
        // Пересекающиеся занятия — рядом по колонкам, чтобы были видны все
        const colStyle = wgLaneStyle(dayLayouts[di].get(s.id), ADM_ADD_GUTTER);
        const locName = admSlotLocName(s);
        cellHtml += '<div class="wg-slot ' + colorClass(s.cat, s.type) + '" draggable="' + canEdit + '" data-slot-id="' + s.id + '" style="top:' + topPx + 'px;height:' + heightPx + 'px;' + colStyle + '" onclick="event.stopPropagation();openSlotModal(' + s.id + ')" title="' + escAttr(s.name + ' · ' + s.time + (locName ? ' · ' + locName : '')) + ' (перетащите, чтобы изменить время)">';
        cellHtml += '<div class="wg-slot-time">' + s.time + '</div>';
        cellHtml += '<div class="wg-slot-name">' + s.name + '</div>';
        // Филиал (зал) · специалист · цена · свободно/мест (у байкфита мест в зале нет); пустые части не показываем
        const meta = [locName && admManyLocsShown() ? '<b>' + escAttr(locName) + '</b>' : '', s.specialist, s.price.toLocaleString('ru') + '₽', slotUsesHall(s.cat) ? slotFree(s) + '/' + slotCap(s) : ''].filter(Boolean).join(' · ');
        cellHtml += '<div class="wg-slot-meta">' + meta + '</div>';
        // Кнопки занятия — только у того, кто может менять расписание; остальным занятие открывается нажатием (блокировка станков)
        if (canEdit) {
          cellHtml += '<div class="wg-slot-btns">';
          cellHtml += '<button class="wg-slot-btn" title="Изменить" aria-label="Изменить" onclick="event.stopPropagation();openSlotModal(' + s.id + ')">' + ICO_EDIT_SM + '</button>';
          cellHtml += '<button class="wg-slot-btn" title="Удалить" aria-label="Удалить" onclick="event.stopPropagation();deleteSlot(' + s.id + ')">✕</button>';
          cellHtml += '</div>';
        }
        cellHtml += '</div>';
      });

      cellHtml += '</div>';
      h += '<div class="wg-day-col' + (isTod ? ' today-col' : '') + '">' + cellHtml + '</div>';
    });
  }

  grid.innerHTML = h;
  admInitDragDrop(grid);
}

function admInitDragDrop(grid) {
  if (grid.dataset.dragInit) return;   // слушатели вешаем один раз на грид
  grid.dataset.dragInit = '1';
  var dragSlotId = null;
  var grabOffsetPx = 0;   // где внутри слота схватили — чтобы верх слота встал туда, куда его отпустили

  // Время под курсором с шагом 15 минут: час ячейки + смещение внутри неё
  // (смещение может выйти за ячейку, если курсор над длинным слотом — тогда это следующие часы)
  function dropMinutes(cell, clientY) {
    var hr = parseInt(cell.getAttribute('data-hr'));
    var offsetPx = clientY - cell.getBoundingClientRect().top - grabOffsetPx;
    var m = hr * 60 + Math.round(offsetPx * 60 / ADM_ROW_H / 15) * 15;
    return Math.max(0, Math.min(24 * 60 - 15, m));
  }

  // Метка времени, показывающая, куда встанет слот
  function showDropMarker(cell, minutes) {
    var marker = grid.querySelector('.wg-drop-marker');
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'wg-drop-marker';   // стиль — css/week-grid.css
    }
    if (marker.parentNode !== cell) cell.appendChild(marker);
    var hr = parseInt(cell.getAttribute('data-hr'));
    marker.style.top = Math.round((minutes - hr * 60) * ADM_ROW_H / 60) + 'px';
    marker.textContent = minToTime(minutes);
  }

  // Drag start — запоминаем id и точку захвата
  grid.addEventListener('dragstart', function (e) {
    var slot = e.target.closest('[data-slot-id]');
    if (!slot) { e.preventDefault(); return; }
    dragSlotId = parseInt(slot.getAttribute('data-slot-id'));
    grabOffsetPx = e.clientY - slot.getBoundingClientRect().top;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSlotId);
    setTimeout(function () { slot.classList.add('dragging'); }, 0);
  });

  // Drag over — подсвечиваем ячейку-цель
  grid.addEventListener('dragover', function (e) {
    var cell = e.target.closest('.wg-cell');
    if (!cell || !dragSlotId) return;
    e.preventDefault();
    grid.querySelectorAll('.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    cell.classList.add('drag-over');
    showDropMarker(cell, dropMinutes(cell, e.clientY));
  });

  grid.addEventListener('dragleave', function (e) {
    var cell = e.target.closest('.wg-cell');
    if (cell) cell.classList.remove('drag-over');
  });

  // Drop — перемещаем слот в новый день+час
  grid.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!dragSlotId) return;
    var cell = e.target.closest('.wg-cell');
    if (!cell) return;

    var dayIdx = parseInt(cell.getAttribute('data-day'));
    var hr = parseInt(cell.getAttribute('data-hr'));
    if (isNaN(dayIdx) || isNaN(hr)) return;

    var newTime = minToTime(dropMinutes(cell, e.clientY));   // шаг 15 минут
    var newDate = new Date(admWeekStart);
    newDate.setDate(admWeekStart.getDate() + dayIdx);
    newDate.setHours(0, 0, 0, 0);

    var s = SLOTS.find(function (x) { return x.id === dragSlotId; });
    if (s) {
      var whErr = workHoursError(s.location_id, dayIdx, newTime, s.dur);
      if (whErr) { showToast(whErr, 'error'); cleanup(); return; }
      var dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      // Сохраняем через API; слот переносим на экране только после успешного сохранения —
      // при отказе сервера (специалист занят, не работает…) он остаётся на месте, текст ошибки показывает apiRequest
      SlotsAPI.update({
        id: s.id,
        location_id: s.location_id,
        library_id: s.library_id || null,
        name: s.name,
        category: s.cat,
        slot_date: fmtLocalDate(newDate),
        start_time: newTime,
        duration: s.dur,
        price: s.price,
        specialist_id: s.specialist_id || null,
      }).then(function () {
        s.time = newTime;
        s.date = newDate;
        s.dayOfWeek = (newDate.getDay() + 6) % 7;
        showToast(s.name + ' → ' + dayNames[dayIdx] + ' ' + newTime, 'success');
        renderAdminSchedule();
      }).catch(function () { renderAdminSchedule(); });
    }

    cleanup();
  });

  document.addEventListener('dragend', function () { cleanup(); });

  function cleanup() {
    dragSlotId = null;
    grabOffsetPx = 0;
    var marker = grid.querySelector('.wg-drop-marker'); if (marker) marker.remove();
    grid.querySelectorAll('.dragging').forEach(function (el) { el.classList.remove('dragging'); });
    grid.querySelectorAll('.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
  }
}

function openSlotModalAtTime(dayIdx, hour) {
  openSlotModal(null);
  setTimeout(function () {
    document.getElementById('sm-day').value = dayIdx;
    smRenderTimes(String(hour).padStart(2, '0') + ':00');
  }, 30);
}

// Время начала слота: шаг 15 мин в пределах режима работы филиала в выбранный день
// (занятие должно закончиться до закрытия). Режим не задан — весь день с шагом 15 мин.
// keepOutside — при открытии существующего слота сохранить его время, даже если оно вне режима.
function smRenderTimes(selected, keepOutside) {
  const sel = document.getElementById('sm-time');
  if (!sel) return;
  const want = selected !== undefined ? selected : sel.value;
  const locId = parseInt(document.getElementById('sm-location').value) || null;
  const day = parseInt(document.getElementById('sm-day').value);
  const dur = parseInt(document.getElementById('sm-dur').value) || 0;
  const h = locId ? locDayHours(locId, day) : undefined;
  let opts;
  if (h === null) opts = '<option value="">— Выходной день филиала —</option>';
  else if (h) opts = workTimeOptions(h.from, h.to, dur, want) || '<option value="">— Нет подходящего времени —</option>';
  else opts = timeOptions15(want).replace('<option value=""></option>', '');
  sel.innerHTML = opts;
  if (want) sel.value = want;
  if (want && sel.value !== want) {
    if (keepOutside) {
      // Время существующего слота вне режима/сетки — показываем, чтобы не потерять (сохранить не даст проверка)
      sel.insertAdjacentHTML('afterbegin', '<option value="' + want + '">' + want + ' (вне режима работы)</option>');
      sel.value = want;
    } else {
      sel.selectedIndex = 0;
    }
  }
}

let smSelectedLibId = null;   // id выбранной записи библиотеки — slots.library_id

// Тренировки для слота: групповые тренировки из библиотеки выбранного филиала (то же проверяет сервер)
function smFillLibSelect() {
  const sel = document.getElementById('sm-lib');
  if (!sel) return;
  const locId = parseInt(document.getElementById('sm-location').value) || null;
  const items = (LIBRARY.trainings || []).filter(function (item) { return libCanSchedule(item) && item.location_id === locId; });
  sel.innerHTML = '<option value="">' + (!locId ? '— Сначала выберите филиал —' : items.length ? '— Выберите тренировку —' : '— В библиотеке филиала нет групповых тренировок —') + '</option>' +
    items.map(function (item) {
      return '<option value="' + item.id + '">' + escAttr(item.name) + '</option>';   // длительность и цена — в полях ниже
    }).join('');
  sel.value = '';
}

// Выбрана тренировка: название, категория, длительность и цена — из записи библиотеки
function smApplyLibItem(val) {
  const item = val ? (LIBRARY.trainings || []).find(function (x) { return x.id === parseInt(val); }) : null;
  smSelectedLibId = item ? item.id : null;
  document.getElementById('sm-name').value = item ? item.name : '';
  document.getElementById('sm-cat').value = 'training';
  document.getElementById('sm-cat-view').textContent = catName('training');
  smApplySpecialistFilter('training');
  if (!item) return;
  document.getElementById('sm-dur').value = item.dur;
  document.getElementById('sm-price').value = item.price;
  smRenderTimes();
}

// Сменили филиал нового слота: тренировки — из библиотеки этого филиала, время — по его режиму работы
function smLocationChanged() {
  smFillLibSelect();
  smApplyLibItem('');
  smRenderTimes();
  const locId = parseInt(document.getElementById('sm-location').value) || null;
  document.getElementById('sm-max').value = locId ? (hallCapOf(locId) ?? '') : '';
}

// Заполнить выпадающий список филиалов в форме слота; один — сразу выбран.
function smFillLocations(selectedId) {
  const sel = document.getElementById('sm-location');
  if (!sel) return;
  fillLocSelect(sel, { empty: '— Выберите филиал —', single: true, value: selectedId || '' });
}

// Режим формы слота: при редактировании нередактируемые поля показываем как значения
function smSetSlotMode(isEdit) {
  const show = function (id, vis) { const e = document.getElementById(id); if (e) e.style.display = vis ? '' : 'none'; };
  show('sm-location', !isEdit);        show('sm-location-view', isEdit);
  show('sm-lib', !isEdit);             show('sm-name-view', isEdit);
  show('sm-specialist', true);            show('sm-specialist-view', false);
}

function openSlotModal(slotId) {
  const canEdit = canDo('schedule');
  if (!slotId && !canEdit) return;   // добавлять занятия может только администратор системы
  const modal = document.getElementById('slot-modal');
  if (slotId) {
    const s = SLOTS.find(x => x.id === slotId);
    if (!s) return;
    document.getElementById('slot-modal-title').textContent = 'Редактировать слот';
    document.getElementById('sm-id').value = slotId;
    smFillLocations(s.location_id);
    document.getElementById('sm-name').value = s.name;
    document.getElementById('sm-cat').value = s.cat;
    smApplySpecialistFilter(s.cat);
    document.getElementById('sm-day').value = s.dayOfWeek;
    document.getElementById('sm-dur').value = s.dur;
    smRenderTimes(s.time, true);
    document.getElementById('sm-max').value = s.max != null ? s.max : (hallCapOf(s.location_id) ?? '');
    const spSel = document.getElementById('sm-specialist');
    spSel.value = s.specialist_id || '';
    if (s.specialist_id && spSel.value !== String(s.specialist_id)) {
      const sp = SPECIALISTS_DATA.find(function (t) { return t.id === s.specialist_id; });
      spSel.insertAdjacentHTML('beforeend', '<option value="' + s.specialist_id + '">' + escAttr(sp ? sp.full : s.specialist || '#' + s.specialist_id) + ' (не работает в филиале)</option>');
      spSel.value = s.specialist_id;
    }
    document.getElementById('sm-price').value = s.price;
    smSelectedLibId = s.library_id || null;   // ссылка на библиотеку сохраняется как есть
    // Значения для нередактируемых полей (режим редактирования)
    const locObj = (admLocs().find(function (x) { return x.id === s.location_id; })
                 || LOCATIONS_ALL.find(function (x) { return x.id === s.location_id; }) || {});
    document.getElementById('sm-location-view').textContent = locObj.name || '—';
    document.getElementById('sm-name-view').textContent = s.name || '—';
    document.getElementById('sm-cat-view').textContent = catName(s.cat);
    smSetSlotMode(true);
  } else {
    document.getElementById('slot-modal-title').textContent = 'Добавить слот';
    document.getElementById('sm-id').value = '';
    // В фильтре расписания выбран один филиал — он и подставляется
    smFillLocations(admBranchId);
    smFillLibSelect();
    smApplyLibItem('');
    document.getElementById('sm-day').value = '0';
    document.getElementById('sm-dur').value = '60';
    smRenderTimes('10:00');
    const newLoc = parseInt(document.getElementById('sm-location').value) || null;
    document.getElementById('sm-max').value = newLoc ? (hallCapOf(newLoc) ?? '') : '';
    document.getElementById('sm-specialist').value = '';
    document.getElementById('sm-price').value = '';
    smSetSlotMode(false);
  }
  // Схема зала с блокировками — только у сохранённого слота (блокировка привязана к занятию)
  // У байкфита нет мест в зале: скрыть «Мест в зале» и «Заблокировать станки» (с причиной)
  const usesHall = slotUsesHall(document.getElementById('sm-cat').value);
  document.getElementById('sm-max-wrap').style.display = usesHall ? '' : 'none';
  smHallSlotId = slotId && usesHall ? slotId : null;
  document.getElementById('sm-hall-wrap').style.display = smHallSlotId ? '' : 'none';
  if (smHallSlotId) smRenderHall();
  // Без права менять расписание: поля занятия только для чтения, доступны блокировка станков и её причина
  modal.querySelectorAll('select, input:not([type=hidden])').forEach(function (el) {
    if (el.id !== 'sm-block-reason') el.disabled = !canEdit;
  });
  if (!canEdit) document.getElementById('slot-modal-title').textContent = 'Блокировка станков';
  const save = document.getElementById('sm-save');
  save.style.display = !canEdit && !smHallSlotId ? 'none' : '';   // сохранять нечего — кнопки нет
  modal.classList.add('show');
}
function closeSlotModal() { document.getElementById('slot-modal').classList.remove('show'); }

// ── Заблокировать станки: блокировка станков на занятие (slot_station_blocks) ──
// Клик по станку отмечает / снимает отметку (можно несколько); одна «Причина блокировки»
// для всех новых блокировок. Изменения применяются по кнопке «Сохранить» слота.
let smHallSlotId = null;
let smHallOrig = new Map();   // id станка -> состояние на сервере: free | taken | blocked
let smHallWant = new Set();   // id станков, которые должны быть заблокированы

async function smRenderHall() {
  const slotId = smHallSlotId;
  const hall = document.getElementById('sm-hall');
  const hint = document.getElementById('sm-hall-hint');
  hall.innerHTML = ''; hint.textContent = 'Загрузка схемы зала…';
  document.getElementById('sm-block-reason').value = '';
  let data;
  try { data = await StationsAPI.availability(slotId); } catch (e) { hint.textContent = 'Не удалось загрузить схему зала'; return; }
  if (slotId !== smHallSlotId) return;   // окно успели переключить на другой слот
  smHallData = data;
  smHallOrig = new Map((data.stations || []).map(function (st) { return [Number(st.id), st.state]; }));
  smHallWant = new Set((data.stations || []).filter(function (st) { return st.state === 'blocked'; }).map(function (st) { return Number(st.id); }));
  smDrawHall();
}
let smHallData = null;

function smDrawHall() {
  const data = smHallData;
  const hall = document.getElementById('sm-hall');
  const cols = data.cols || 6, rows = data.rows || 2;
  const byPos = {};
  (data.stations || []).forEach(function (st) { byPos[st.pos_x + ',' + st.pos_y] = st; });
  hall.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
  let html = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const st = byPos[x + ',' + y];
      if (!st) { html += '<div class="cell-empty"></div>'; continue; }
      const id = Number(st.id);
      if (st.state === 'taken') {
        html += stationHtml(st, 'taken', 'disabled title="Занят записью клиента"');
        continue;
      }
      const want = smHallWant.has(id);
      const changed = want !== (st.state === 'blocked');
      const title = want
        ? (st.state === 'blocked' ? 'Заблокирован' + (st.block_reason ? ': ' + st.block_reason : '') : 'Будет заблокирован') + ' — клик, чтобы снять'
        : (st.state === 'blocked' ? 'Блокировка будет снята' : 'Свободен') + ' — клик, чтобы заблокировать';
      html += stationHtml(st, (want ? 'blocked' : 'free') + (changed ? ' pending' : ''), 'onclick="smToggleBlock(' + id + ')" title="' + escAttr(title) + '"');
    }
  }
  hall.innerHTML = html;
  const d = smBlockDiff();
  const taken = [...smHallOrig.values()].filter(function (v) { return v === 'taken'; }).length;
  document.getElementById('sm-hall-hint').textContent =
    'Заблокировано: ' + smHallWant.size + (taken ? ' · занято клиентами: ' + taken : '') +
    (d.block.length || d.unblock.length
      ? ' · изменения (' + (d.block.length ? '+' + d.block.length : '') + (d.block.length && d.unblock.length ? ' / ' : '') + (d.unblock.length ? '−' + d.unblock.length : '') + ') применятся по кнопке «Сохранить»'
      : ' · клик по станку — отметить для блокировки или снять отметку');
}

function smToggleBlock(stationId) {
  if (smHallWant.has(stationId)) smHallWant.delete(stationId); else smHallWant.add(stationId);
  smDrawHall();
}

// Что изменилось относительно сервера
function smBlockDiff() {
  const block = [], unblock = [];
  smHallOrig.forEach(function (state, id) {
    if (state === 'taken') return;
    const want = smHallWant.has(id);
    if (want && state !== 'blocked') block.push(id);
    if (!want && state === 'blocked') unblock.push(id);
  });
  return { block: block, unblock: unblock };
}

// Применить блокировки (вызывается из saveSlot после сохранения слота). Возвращает текст для уведомления.
async function smApplyBlocks(slotId) {
  if (slotId !== smHallSlotId) return '';
  const d = smBlockDiff();
  if (!d.block.length && !d.unblock.length) return '';
  const reason = document.getElementById('sm-block-reason').value.trim() || null;
  const results = await Promise.allSettled(
    d.block.map(function (id) { return StationsAPI.block(slotId, id, reason); })
      .concat(d.unblock.map(function (id) { return StationsAPI.unblock(slotId, id); }))
  );
  const failed = results.filter(function (r) { return r.status === 'rejected'; }).length;
  // Число заблокированных станков у слота — для «свободно» в сетке без перезагрузки
  const slot = SLOTS.find(function (x) { return x.id === slotId; });
  if (slot && !failed) slot.blocked = smHallWant.size;
  return failed ? ' (блокировки: ошибок — ' + failed + ')'
    : ' · станков заблокировано: ' + d.block.length + (d.unblock.length ? ', разблокировано: ' + d.unblock.length : '');
}

async function saveSlot() {
  // Администратор студии: занятие не меняется, сохраняются только блокировки станков
  if (!canDo('schedule')) {
    const slotId = parseInt(document.getElementById('sm-id').value);
    if (!slotId) return;
    const blk = await smApplyBlocks(slotId);
    showToast(blk ? 'Сохранено' + blk : 'Ничего не изменено', blk ? 'success' : undefined);
    closeSlotModal();
    renderAdminSchedule();
    return;
  }
  const sid = document.getElementById('sm-id').value;
  if (!smSelectedLibId) { showToast('Выберите тренировку из библиотеки', 'error'); return; }
  const name = document.getElementById('sm-name').value.trim();
  const dayOfWeek = parseInt(document.getElementById('sm-day').value);
  const time = document.getElementById('sm-time').value;
  if (!time) { showToast('Укажите время начала', 'error'); return; }

  // Вычисляем дату слота
  const slotDate = new Date(admWeekStart);
  const startDow = (admWeekStart.getDay() + 6) % 7;
  slotDate.setDate(admWeekStart.getDate() + ((dayOfWeek - startDow + 7) % 7));
  slotDate.setHours(0, 0, 0, 0);

  // Тренер — по id; у групповой тренировки обязателен (то же проверяет сервер)
  const trainerObj = SPECIALISTS_DATA.find(function (t) { return t.id === parseInt(document.getElementById('sm-specialist').value); }) || null;
  if (!trainerObj) { showToast('Выберите тренера', 'error'); return; }
  const price = parseInt(document.getElementById('sm-price').value);
  if (isNaN(price) || price < 0) { showToast('Укажите цену', 'error'); return; }

  const location_id = parseInt(document.getElementById('sm-location').value) || null;
  if (!location_id) { showToast('Выберите филиал', 'error'); return; }
  // Время — в пределах режима работы филиала (Панель → Настройки → Филиалы)
  const whErr = workHoursError(location_id, dayOfWeek, time, document.getElementById('sm-dur').value);
  if (whErr) { showToast(whErr, 'error'); return; }

  const apiData = {
    name,
    location_id,
    library_id: smSelectedLibId,
    category: document.getElementById('sm-cat').value,
    slot_date: fmtLocalDate(slotDate),
    start_time: time,
    duration: parseInt(document.getElementById('sm-dur').value),
    specialist_id: trainerObj.id,
    price: price,
  };

  // описание для мгновенного показа во всплывашке (до перезагрузки слотов)
  let libDesc = '';
  if (smSelectedLibId) {
    const li = [...(LIBRARY.trainings || []), ...(LIBRARY.services || [])].find(x => x.id === smSelectedLibId);
    if (li) libDesc = li.desc || '';
  }

  const localData = {
    name,
    location_id,
    cat: apiData.category,
    date: slotDate,
    dayOfWeek, time,
    dur: apiData.duration,
    max: hallCapOf(location_id),
    specialist: trainerObj.name,
    specialist_id: apiData.specialist_id,
    price: apiData.price,
    library_id: smSelectedLibId,
    description: libDesc,
  };

  try {
    if (sid) {
      await SlotsAPI.update({ id: parseInt(sid), ...apiData });
      const s = SLOTS.find(x => x.id === parseInt(sid));
      if (s) Object.assign(s, localData);
      // Блокировки станков применяются вместе с сохранением слота
      const blk = await smApplyBlocks(parseInt(sid));
      showToast('Слот обновлён' + blk, 'success');
    } else {
      const res = await SlotsAPI.create(apiData);
      const newId = res && res.id ? Number(res.id) : Date.now();
      SLOTS.push({ id: newId, taken: 0, ...localData });
      showToast('Слот добавлен', 'success');
    }
  } catch (e) {
    // Сервер отклонил сохранение — оставляем модалку открытой для повторной попытки
    if (!e.offline) return;
    // Fallback — только локально
    if (sid) {
      const s = SLOTS.find(x => x.id === parseInt(sid));
      if (s) Object.assign(s, localData);
      showToast('Слот обновлён (локально)', 'success');
    } else {
      SLOTS.push({ id: Date.now(), taken: 0, ...localData });
      showToast('Слот добавлен (локально)', 'success');
    }
  }
  closeSlotModal();
  renderAdminSchedule();
}

async function deleteSlot(slotId) {
  if (!await uiConfirm('Удалить этот слот из расписания?')) return;
  try {
    await SlotsAPI.delete(slotId);
  } catch (e) {
    if (!e.offline) return;  // сервер отклонил удаление — слот остаётся на месте
  }
  const idx = SLOTS.findIndex(x => x.id === slotId);
  if (idx >= 0) { SLOTS.splice(idx, 1); }
  renderAdminSchedule();
  showToast('Слот удалён');
}

