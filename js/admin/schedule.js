// Админка: недельная сетка расписания, форма слота, drag&drop

// ── SCHEDULE MANAGEMENT ────────────────────────────────────────────

// ── ADMIN WEEK SCHEDULE ───────────────────────────────────────────
const ADM_ROW_H = 60;  // px на час

// Диапазон часов сетки: от самого раннего открытия до самого позднего закрытия
// среди активных филиалов (режим работы — Панель → Настройки → Филиалы),
// расширенный так, чтобы были видны все слоты недели. Без режима работы — 08–22.
function admHourRange(weekSlots) {
  let from = Infinity, to = -Infinity;
  LOCATIONS.forEach(function (l) {
    for (let i = 0; i < 7; i++) {
      const h = locDayHours(l.id, i);
      if (h) { from = Math.min(from, h.from); to = Math.max(to, h.to); }
    }
  });
  (weekSlots || []).forEach(function (s) {
    const st = timeToMin(s.time);
    from = Math.min(from, st); to = Math.max(to, st + (parseInt(s.dur) || 0));
  });
  if (from === Infinity) return { start: 8, end: 22 };
  return { start: Math.floor(from / 60), end: Math.min(24, Math.ceil(to / 60)) };
}

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

function renderAdminSchedule() {
  const grid = document.getElementById('adm-week-grid');
  if (!grid) return;

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

  // Слоты недели
  const weekSlots = SLOTS.filter(s => {
    const sd = s.date;
    return sd >= admWeekStart && sd <= we;
  });

  // Шапка: угол + заголовки дней
  let h = '<div class="adm-wg-corner"></div>';
  days.forEach(function (d, di) {
    const isTod = d.getTime() === today.getTime();
    h += '<div class="adm-wg-day-hdr' + (isTod ? ' today' : '') + '">' +
      '<div class="adm-wg-dow">' + DAYS_SHORT[di] + '</div>' +
      '<div class="adm-wg-dnum">' + d.getDate() + '</div>' +
      '<div class="adm-wg-ddate">' + MONTHS_SHORT[d.getMonth()] + '</div>' +
      '</div>';
  });

  // Временная шкала + ячейки
  const hrRange = admHourRange(weekSlots);
  for (let hr = hrRange.start; hr < hrRange.end; hr++) {
    const timeStr = String(hr).padStart(2, '0') + ':00';
    const isLast = hr === hrRange.end - 1;
    h += '<div class="adm-time-col"><div class="adm-time-row' + (isLast ? ' style="border-bottom:none"' : '') + '">' + timeStr + '</div></div>';

    days.forEach(function (d, di) {
      const isTod = d.getTime() === today.getTime();
      // Найти слоты этого часа для этого дня
      const daySlots = weekSlots.filter(function (s) {
        return s.date.getDate() === d.getDate() &&
          s.date.getMonth() === d.getMonth() &&
          parseInt(s.time.split(':')[0]) === hr;
      });

      let cellHtml = "<div class='adm-time-cell' data-day='" + di + "' data-hr='" + hr + "' onclick='openSlotModalAtTime(" + di + "," + hr + ")' title='Добавить занятие в " + timeStr + "'>";

      // Рисуем слоты
      const nn = daySlots.length;
      daySlots.forEach(function (s, si) {
        const topMin = parseInt(s.time.split(':')[1]);
        const topPx = Math.round(topMin * ADM_ROW_H / 60);
        const heightPx = Math.max(Math.round(s.dur * ADM_ROW_H / 60), 24);
        // Несколько занятий на одно время — раскладываем по колонкам, чтобы были видны все
        const colStyle = nn > 1
          ? 'left:calc(' + (si * 100 / nn) + '% + 2px);width:calc(' + (100 / nn) + '% - 4px);right:auto;'
          : '';
        cellHtml += '<div class="adm-slot cat-' + s.cat + '" draggable="true" data-slot-id="' + s.id + '" style="top:' + topPx + 'px;height:' + heightPx + 'px;' + colStyle + '" onclick="event.stopPropagation();openSlotModal(' + s.id + ')" title="' + s.name + ' · ' + s.time + ' (перетащите, чтобы изменить время)">';
        cellHtml += '<div class="adm-slot-time">' + s.time + '</div>';
        cellHtml += '<div class="adm-slot-name">' + s.name + '</div>';
        cellHtml += '<div class="adm-slot-info">' + s.specialist + ' · ' + s.price.toLocaleString('ru') + '₽ · ' + (s.max - s.taken) + '/' + s.max + '</div>';
        cellHtml += '<div class="adm-slot-btns">';
        cellHtml += '<button class="adm-slot-btn" onclick="event.stopPropagation();openSlotModal(' + s.id + ')">Ред.</button>';
        cellHtml += '<button class="adm-slot-btn" style="color:#dc2626" onclick="event.stopPropagation();deleteSlot(' + s.id + ')">Уд.</button>';
        cellHtml += '</div>';
        cellHtml += '</div>';
      });

      cellHtml += '</div>';
      h += '<div class="adm-day-col' + (isTod ? ' today-col' : '') + '">' + cellHtml + '</div>';
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
    var marker = grid.querySelector('.adm-drop-marker');
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'adm-drop-marker';
      marker.style.cssText = 'position:absolute;left:2px;right:2px;height:0;border-top:2px dashed var(--green);' +
        'pointer-events:none;z-index:5;font-size:10px;font-weight:700;color:var(--green)';
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
    var cell = e.target.closest('.adm-time-cell');
    if (!cell || !dragSlotId) return;
    e.preventDefault();
    grid.querySelectorAll('.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    cell.classList.add('drag-over');
    showDropMarker(cell, dropMinutes(cell, e.clientY));
  });

  grid.addEventListener('dragleave', function (e) {
    var cell = e.target.closest('.adm-time-cell');
    if (cell) cell.classList.remove('drag-over');
  });

  // Drop — перемещаем слот в новый день+час
  grid.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!dragSlotId) return;
    var cell = e.target.closest('.adm-time-cell');
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
      var oldTime = s.time;
      s.time = newTime;
      s.date = newDate;
      s.dayOfWeek = (newDate.getDay() + 6) % 7;
      var dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      // Сохраняем через API
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
      }).catch(function (e) { showToast('Ошибка сохранения перемещения', 'error'); });
      showToast(s.name + ' → ' + dayNames[dayIdx] + ' ' + newTime, 'success');
    }

    cleanup();
    renderAdminSchedule();
  });

  document.addEventListener('dragend', function () { cleanup(); });

  function cleanup() {
    dragSlotId = null;
    grabOffsetPx = 0;
    var marker = grid.querySelector('.adm-drop-marker'); if (marker) marker.remove();
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

let smSelectedLibId = null;   // id выбранной строки библиотеки для slots.library_id

function smFillLibSelect() {
  const sel = document.getElementById('sm-lib-select');
  if (!sel) return;
  const allItems = [...(LIBRARY.trainings || []), ...(LIBRARY.services || [])];
  sel.innerHTML = '<option value="">— Выбрать из библиотеки —</option>' +
    allItems.map(function (item) {
      return '<option value="' + item.id + '__' + (LIBRARY.trainings.includes(item) ? 'trainings' : 'services') + '">' +
        '[' + catName(item.cat) + '] ' + item.name + ' · ' + item.dur + 'мин · ' + Number(item.price).toLocaleString('ru') + '₽' +
        '</option>';
    }).join('');
  document.getElementById('sm-lib-preview').style.display = 'none';
}

function smApplyLibItem(val) {
  if (!val) { smClearLib(); return; }
  const parts = val.split('__');
  const id = parseInt(parts[0]);
  const type = parts[1];
  const item = (LIBRARY[type] || []).find(x => x.id === id);
  if (!item) return;
  smSelectedLibId = item.id;   // связываем слот с записью библиотеки

  // Заполняем поля формы
  document.getElementById('sm-name').value = item.name;
  document.getElementById('sm-cat').value = item.cat;
  { const cv = document.getElementById('sm-cat-view'); if (cv) cv.textContent = catName(item.cat); }
  smApplySpecialistFilter(item.cat);
  document.getElementById('sm-dur').value = item.dur;
  smRenderTimes();
  document.getElementById('sm-price').value = item.price;
  document.getElementById('sm-max').value = HALL_CAP ?? '';
  smRenderLibPreview(item);
}

// Превью выбранной записи библиотеки (без перезаписи полей формы)
function smRenderLibPreview(item) {
  const catCol = { training: '#00BAB3', bikefit: '#c07a10', workshop: '#4e42b5' };
  const prev = document.getElementById('sm-lib-preview');
  if (!prev) return;
  prev.style.display = '';
  prev.innerHTML =
    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (catCol[item.cat] || '#888') + ';margin-right:6px;vertical-align:middle"></span>' +
    '<strong>' + item.name + '</strong> · ' + catName(item.cat) + ' · ' + item.dur + ' мин · ' + Number(item.price).toLocaleString('ru') + ' ₽' +
    (item.desc ? '<div style="color:var(--ink-60);margin-top:4px">' + item.desc + '</div>' : '');
}

function smClearLib() {
  smSelectedLibId = null;
  const sel = document.getElementById('sm-lib-select');
  if (sel) sel.value = '';
  const prev = document.getElementById('sm-lib-preview');
  if (prev) prev.style.display = 'none';
}

// Заполнить выпадающий список филиалов в форме слота; один — сразу выбран.
function smFillLocations(selectedId) {
  const sel = document.getElementById('sm-location');
  if (!sel) return;
  sel.innerHTML = (LOCATIONS.length === 1 ? '' : '<option value="">— Выберите филиал —</option>')
    + LOCATIONS.map(function (l) { return '<option value="' + l.id + '">' + l.name + '</option>'; }).join('');
  if (selectedId) sel.value = selectedId;
  else if (LOCATIONS.length === 1) sel.value = LOCATIONS[0].id;
  else sel.value = '';
}

// Режим формы слота: при редактировании нередактируемые поля показываем как значения
function smSetSlotMode(isEdit) {
  const show = function (id, vis) { const e = document.getElementById(id); if (e) e.style.display = vis ? '' : 'none'; };
  show('sm-location', !isEdit);        show('sm-location-view', isEdit);
  show('sm-name', !isEdit);            show('sm-name-view', isEdit);
  show('sm-specialist', true);            show('sm-specialist-view', false);
}

function openSlotModal(slotId) {
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
    document.getElementById('sm-max').value = s.max != null ? s.max : (HALL_CAP ?? '');
    document.getElementById('sm-specialist').value = s.specialist;
    document.getElementById('sm-price').value = s.price;
    smSelectedLibId = s.library_id || null;   // ссылка на библиотеку сохраняется как есть
    // Значения для нередактируемых полей (режим редактирования)
    const locObj = (LOCATIONS.find(function (x) { return x.id === s.location_id; })
                 || LOCATIONS_ALL.find(function (x) { return x.id === s.location_id; }) || {});
    document.getElementById('sm-location-view').textContent = locObj.name || '—';
    document.getElementById('sm-name-view').textContent = s.name || '—';
    document.getElementById('sm-cat-view').textContent = catName(s.cat);
    smSetSlotMode(true);
  } else {
    document.getElementById('slot-modal-title').textContent = 'Добавить слот';
    document.getElementById('sm-id').value = '';
    smSelectedLibId = null;
    smFillLocations(null);
    document.getElementById('sm-name').value = '';
    document.getElementById('sm-cat').value = 'training';
    document.getElementById('sm-cat-view').textContent = 'Тренировка';
    smApplySpecialistFilter('training');
    document.getElementById('sm-day').value = '0';
    document.getElementById('sm-dur').value = '60';
    smRenderTimes('10:00');
    document.getElementById('sm-max').value = HALL_CAP ?? '';
    document.getElementById('sm-specialist').value = '';
    document.getElementById('sm-price').value = '1200';
    smSetSlotMode(false);
  }
  modal.classList.add('show');
}
function closeSlotModal() { document.getElementById('slot-modal').classList.remove('show'); }

async function saveSlot() {
  const name = document.getElementById('sm-name').value.trim();
  if (!name) { showToast('Введите название занятия', 'error'); return; }
  const sid = document.getElementById('sm-id').value;
  const dayOfWeek = parseInt(document.getElementById('sm-day').value);
  const time = document.getElementById('sm-time').value;
  if (!time) { showToast('Укажите время начала', 'error'); return; }

  // Вычисляем дату слота
  const slotDate = new Date(admWeekStart);
  const startDow = (admWeekStart.getDay() + 6) % 7;
  slotDate.setDate(admWeekStart.getDate() + ((dayOfWeek - startDow + 7) % 7));
  slotDate.setHours(0, 0, 0, 0);

  // Находим specialist_id по имени
  const trainerName = document.getElementById('sm-specialist').value;
  const trainerObj = SPECIALISTS_DATA ? SPECIALISTS_DATA.find(t => t.name === trainerName) : null;

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
    specialist_id: trainerObj ? trainerObj.id : null,
    price: parseInt(document.getElementById('sm-price').value),
  };

  // описание для мгновенного показа во всплывашке (до перезагрузки слотов)
  let libDesc = '';
  if (smSelectedLibId) {
    const li = [...(LIBRARY.trainings || []), ...(LIBRARY.services || [])].find(x => x.id === smSelectedLibId);
    if (li) libDesc = li.desc || '';
  }

  const localData = {
    name,
    cat: apiData.category,
    date: slotDate,
    dayOfWeek, time,
    dur: apiData.duration,
    max: HALL_CAP,
    specialist: trainerName,
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
      showToast('Слот обновлён', 'success');
    } else {
      const res = await SlotsAPI.create(apiData);
      const newId = res && res.id ? res.id : Date.now();
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
  renderWeekCal();
}

async function deleteSlot(slotId) {
  if (!confirm('Удалить этот слот из расписания?')) return;
  try {
    await SlotsAPI.delete(slotId);
  } catch (e) {
    if (!e.offline) return;  // сервер отклонил удаление — слот остаётся на месте
  }
  const idx = SLOTS.findIndex(x => x.id === slotId);
  if (idx >= 0) { SLOTS.splice(idx, 1); }
  renderAdminSchedule();
  renderWeekCal();
  showToast('Слот удалён');
}

