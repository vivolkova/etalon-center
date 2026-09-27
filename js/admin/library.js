// Админка: библиотека тренировок/услуг, «В расписание»

// ═══ LIBRARY ════════════════════════════════════════════════════════

let libCurrentType = 'trainings';

// Вкладки «Тренировки» / «Услуги»: фильтр по activity_category (training / всё остальное)
function switchLibTab(type, btn) {
  libCurrentType = type;
  document.querySelectorAll('#adm-library .chip').forEach(c => c.classList.remove('active'));
  (btn || document.getElementById('lib-tab-' + type)).classList.add('active');
  const catSel = document.getElementById('lib-cat-filter');
  if (catSel) { catSel.value = ''; catSel.style.display = type === 'services' ? '' : 'none'; }
  renderLibrary();
}

function renderLibrary() {
  const q = (document.getElementById('lib-search') ? document.getElementById('lib-search').value : '').toLowerCase();
  const locSel = document.getElementById('lib-loc-filter');
  let locFilter = null;
  if (locSel) {
    const cur = locSel.value;
    locSel.innerHTML = '<option value="">Все филиалы</option>' +
      LOCATIONS.map(function (l) { return '<option value="' + l.id + '">' + l.name + '</option>'; }).join('');
    locSel.value = cur;
    locFilter = locSel.value ? parseInt(locSel.value) : null;
  }
  const actSel = document.getElementById('lib-active-filter');
  const activeOnly = actSel && actSel.value === 'active';
  // Категории услуг (всё, кроме training) — из справочника activity_category
  const catSel = document.getElementById('lib-cat-filter');
  let catFilter = '';
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">Все категории</option>' +
      ACTIVITY_CATS.filter(function (c) { return c.code !== 'training'; })
        .map(function (c) { return '<option value="' + c.code + '">' + c.name + '</option>'; }).join('');
    catSel.value = cur;
    catFilter = libCurrentType === 'services' ? catSel.value : '';
  }
  const items = LIBRARY[libCurrentType].filter(function (item) {
    const okQ = !q || item.name.toLowerCase().includes(q) || (item.desc || '').toLowerCase().includes(q);
    const okLoc = !locFilter || item.location_id === locFilter;
    const okAct = !activeOnly || Number(item.active);
    const okCat = !catFilter || item.cat === catFilter;
    return okQ && okLoc && okAct && okCat;
  });
  const grid = document.getElementById('lib-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div class="lib-empty"><div style="font-size:13px;font-weight:600;margin-bottom:8px">Ничего не найдено</div><button class="btn-primary" style="font-size:12px;padding:8px 16px" onclick="openLibItemModal(null,\'' + libCurrentType + '\')">' +
      (libCurrentType === 'trainings' ? 'Добавить тренировку' : 'Добавить услугу') + '</button></div>';
    return;
  }
  grid.innerHTML = items.map(function (item) {
    const col = catColor(item.cat);
    const locObj = LOCATIONS_ALL.concat(LOCATIONS).find(function (x) { return x.id === item.location_id; });
    const locName = locObj ? locObj.name : '';
    const features = (item.features || []).slice(0, 3);
    const isTraining = libCurrentType === 'trainings';
    let difficultyHtml = (isTraining && item.difficulty) ? '<div class="lib-difficulty">' + (DIFFICULTY_LABEL[item.difficulty] || item.difficulty) + '</div>' : '';
    let featuresHtml = '';
    if (features.length) {
      featuresHtml = '<div class="lib-card-features">' +
        features.map(function (f) {
          return '<div class="lib-card-feature"><div class="lib-card-feature-dot" style="background:' + col + '"></div><span>' + f + '</span></div>';
        }).join('') + '</div>';
    }
    let maxHtml = (isTraining && item.max) ? '<span class="lib-meta-tag">до ' + item.max + ' чел.</span>' : '';
    const inactive = !Number(item.active);
    const cardStyle = inactive ? ' style="background:#f3f4f6;opacity:.65"' : '';
    const delBadge = inactive ? '<span class="lib-meta-tag" style="background:#e5e7eb;color:#6b7280">Удалена</span>' : '';
    const actionsHtml = inactive
      ? '<button class="action-btn confirm" style="font-size:11px;padding:4px 8px" onclick="openLibItemModal(' + item.id + ')">Ред.</button>'
      : '<button class="lib-add-slot-btn" onclick="addToScheduleFromLib(' + item.id + ')">+ В расписание</button>' +
        '<button class="action-btn confirm" style="font-size:11px;padding:4px 8px" onclick="openLibItemModal(' + item.id + ')">Ред.</button>' +
        '<button class="action-btn cancel" style="font-size:11px;padding:4px 8px" onclick="deleteLibItem(' + item.id + ')">Уд.</button>';
    return '<div class="lib-card"' + cardStyle + '>' +
      difficultyHtml +
      '<div class="lib-card-header"><div>' +
      '<div class="lib-card-cat cat-' + item.cat + '">' + catName(item.cat) + '</div>' +
      '<div class="lib-card-title">' + item.name + '</div>' +
      '</div></div>' +
      '<div class="lib-card-desc">' + item.desc + '</div>' +
      featuresHtml +
      '<div class="lib-card-meta">' + delBadge + (locName ? '<span class="lib-meta-tag">' + locName + '</span>' : '') + '<span class="lib-meta-tag">' + item.dur + ' мин</span>' + maxHtml + '</div>' +
      '<div class="lib-card-footer">' +
      '<div class="lib-card-price">' + Number(item.price).toLocaleString('ru') + ' ₽</div>' +
      '<div class="lib-card-actions">' + actionsHtml + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}


// ── ADD TO SCHEDULE FROM LIBRARY ──────────────────────────────────
let ltsLibId = null;
let ltsWeekStart = new Date(admWeekStart);
let ltsSelectedDays = new Set();

function addToScheduleFromLib(id) {
  const item = LIBRARY[libCurrentType].find(x => x.id === id);
  if (!item) return;
  ltsLibId = id;
  ltsWeekStart = new Date(admWeekStart);
  ltsSelectedDays = new Set();

  // Превью
  document.getElementById('lts-cat-dot').style.background = catColor(item.cat);
  document.getElementById('lts-name').textContent = item.name;
  document.getElementById('lts-meta').textContent =
    catName(item.cat) + ' · ' + item.dur + ' мин · ' + Number(item.price).toLocaleString('ru') + ' ₽';

  // Тренер / Байкфиттер / Мастер — по категории записи (activity_category.ref_id)
  applySpecialistFilter('lts-specialist', 'lts-specialist-label', item.cat);
  ltsRenderWeekLabel();
  ltsRenderDayBtns();
  ltsRenderTimes();
  document.getElementById('lib-to-sch-modal').classList.add('show');
}

function ltsItem() {
  return [...LIBRARY.trainings, ...LIBRARY.services].find(function (x) { return x.id === ltsLibId; }) || null;
}

// Время начала — по режиму работы филиала записи библиотеки.
// Если выбрано несколько дней — пересечение их часов работы.
function ltsRenderTimes() {
  const lt = document.getElementById('lts-time');
  const item = ltsItem();
  if (!lt || !item) return;
  const cur = lt.value;
  if (!ltsSelectedDays.size) {
    lt.innerHTML = '<option value="">— Сначала выберите день —</option>';
    lt.disabled = true;
    return;
  }
  let from = 0, to = 24 * 60;
  ltsSelectedDays.forEach(function (i) {
    const h = locDayHours(item.location_id, i);
    if (h) { from = Math.max(from, h.from); to = Math.min(to, h.to); }
  });
  const opts = workTimeOptions(from, to, parseInt(item.dur) || 0, cur);
  lt.disabled = !opts;
  lt.innerHTML = opts || '<option value="">— Нет подходящего времени —</option>';
  if (opts && !lt.value) lt.selectedIndex = 0;
}

function closeLtsModal() {
  document.getElementById('lib-to-sch-modal').classList.remove('show');
}

function ltsChangeWeek(dir) {
  ltsWeekStart = new Date(ltsWeekStart);
  ltsWeekStart.setDate(ltsWeekStart.getDate() + dir * 7);
  ltsSelectedDays = new Set();
  ltsRenderWeekLabel();
  ltsRenderDayBtns();
  ltsRenderTimes();
}

function ltsRenderWeekLabel() {
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const we = new Date(ltsWeekStart); we.setDate(ltsWeekStart.getDate() + 6);
  const s = ltsWeekStart, e = we;
  document.getElementById('lts-week-label').textContent =
    s.getDate() + ' ' + MONTHS_SHORT[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS_SHORT[e.getMonth()];
}

function ltsRenderDayBtns() {
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const cont = document.getElementById('lts-days');
  const item = ltsItem();
  cont.innerHTML = DAYS.map(function (d, i) {
    const date = new Date(ltsWeekStart);
    date.setDate(ltsWeekStart.getDate() + i);
    const isPast = date < today;
    const closed = item && locDayHours(item.location_id, i) === null;   // выходной филиала
    const sel = ltsSelectedDays.has(i);
    return '<button class="lts-day-btn' + (sel ? ' selected' : '') + '"' +
      (isPast || closed ? ' disabled style="opacity:.35;cursor:default"' : ' onclick="ltsToggleDay(' + i + ',this)"') +
      ' title="' + d + ' ' + date.getDate() + ' ' + MONTHS_SHORT[date.getMonth()] + (closed ? ' — выходной' : '') + '">' +
      d + '</button>';
  }).join('');
}

function ltsToggleDay(idx, btn) {
  if (ltsSelectedDays.has(idx)) {
    ltsSelectedDays.delete(idx);
    btn.classList.remove('selected');
  } else {
    ltsSelectedDays.add(idx);
    btn.classList.add('selected');
  }
  ltsRenderTimes();
}

async function confirmAddToSchedule() {
  if (!ltsLibId) return;
  if (!ltsSelectedDays.size) { showToast('Выберите хотя бы один день', 'error'); return; }

  const item = ltsItem();
  if (!item) return;

  const time = document.getElementById('lts-time').value;
  if (!time) { showToast('Нет времени, подходящего под режим работы филиала во все выбранные дни', 'error'); return; }
  const trainerName = document.getElementById('lts-specialist').value;
  const trainerObj = SPECIALISTS_DATA ? SPECIALISTS_DATA.find(t => t.name === trainerName) : null;
  const repeat = document.getElementById('lts-repeat').value;
  const weeks = repeat === 'once' ? 1 : repeat === '2weeks' ? 2 : 4;

  let added = 0;
  const promises = [];

  for (let w = 0; w < weeks; w++) {
    ltsSelectedDays.forEach(function (dayIdx) {
      const slotDate = new Date(ltsWeekStart);
      slotDate.setDate(ltsWeekStart.getDate() + dayIdx + w * 7);
      slotDate.setHours(0, 0, 0, 0);
      if (slotDate < today) return;

      const apiData = {
        name: item.name,
        library_id: item.id,
        category: item.cat,
        slot_date: slotDate.getFullYear() + '-' + String(slotDate.getMonth() + 1).padStart(2, '0') + '-' + String(slotDate.getDate()).padStart(2, '0'),
        start_time: time,
        duration: item.dur,
        price: item.price,
        location_id: item.location_id,
        specialist_id: trainerObj ? trainerObj.id : null,
      };
      const dow = (slotDate.getDay() + 6) % 7;
      promises.push(
        SlotsAPI.create(apiData).then(function () { added++; }).catch(function () { })
      );
    });
  }

  await Promise.allSettled(promises);

  // Перечитываем слоты с сервера (полные данные: реальные id, location_id, specialist_id, library_id)
  admWeekStart = new Date(ltsWeekStart);
  const reloadFrom = new Date(ltsWeekStart);
  const reloadTo = new Date(ltsWeekStart);
  reloadTo.setDate(reloadTo.getDate() + weeks * 7);
  await loadSlots(reloadFrom, reloadTo);

  closeLtsModal();
  const schTab = document.querySelector('.atab[onclick*="schedule"]');
  if (schTab) switchAdminTab('schedule', schTab);
  renderAdminSchedule();
  showToast('Добавлено ' + added + ' занятий в расписание', 'success');
}


// kind: 'trainings' | 'services' — какая кнопка нажата («+ Тренировка» / «+ Услуга»).
// При редактировании вид определяется категорией записи.
function openLibItemModal(id, kind) {
  let item = null;
  if (id !== null) {
    item = [...LIBRARY.trainings, ...LIBRARY.services].find(x => x.id === id);
    if (!item) return;
    kind = item.cat === 'training' ? 'trainings' : 'services';
  }
  kind = kind || libCurrentType;
  const isTraining = kind === 'trainings';
  const modal = document.getElementById('lib-modal');

  // Категория: тренировка — фиксированно training (поле скрыто);
  // услуга — выпадающий список activity_category без training
  const catEl = document.getElementById('lm-cat');
  catEl.innerHTML = isTraining
    ? '<option value="training">' + catName('training') + '</option>'
    : ACTIVITY_CATS.filter(function (c) { return c.code !== 'training'; })
        .map(function (c) { return '<option value="' + c.code + '">' + c.name + '</option>'; }).join('');
  document.getElementById('lm-cat-wrap').style.display = isTraining ? 'none' : '';
  const diffWrap = document.getElementById('lm-difficulty-wrap');
  diffWrap.style.display = isTraining ? '' : 'none';
  const capWrap = document.getElementById('lm-cap-wrap');
  if (capWrap) {
    capWrap.style.display = isTraining ? '' : 'none';
    document.getElementById('lm-cap').value = HALL_CAP ?? '';
  }
  document.getElementById('lm-type').value = kind;

  // Список филиалов; если один — сразу выбран, иначе плейсхолдер
  const locSel = document.getElementById('lm-location');
  if (locSel) {
    locSel.innerHTML = (LOCATIONS.length === 1 ? '' : '<option value="">— Выберите филиал —</option>')
      + LOCATIONS.map(function (l) { return '<option value="' + l.id + '">' + l.name + '</option>'; }).join('');
  }

  if (item) {
    document.getElementById('lib-modal-title').textContent = isTraining ? 'Редактировать тренировку' : 'Редактировать услугу';
    document.getElementById('lm-id').value = id;
    if (locSel) locSel.value = item.location_id || '';
    document.getElementById('lm-name').value = item.name;
    document.getElementById('lm-cat').value = item.cat;
    document.getElementById('lm-dur').value = item.dur;
    document.getElementById('lm-price').value = item.price;
    document.getElementById('lm-difficulty').value = item.difficulty || 'any';
    document.getElementById('lm-desc').value = item.desc || '';
    document.getElementById('lm-features').value = (item.features || []).join('\n');
    document.getElementById('lm-active').checked = !!Number(item.active);
  } else {
    document.getElementById('lib-modal-title').textContent = isTraining ? 'Новая тренировка' : 'Новая услуга';
    document.getElementById('lm-id').value = '';
    if (locSel) locSel.value = LOCATIONS.length === 1 ? LOCATIONS[0].id : '';
    document.getElementById('lm-name').value = '';
    catEl.selectedIndex = 0;
    document.getElementById('lm-dur').value = 60;
    document.getElementById('lm-price').value = isTraining ? 1200 : 3000;
    document.getElementById('lm-difficulty').value = 'any';
    document.getElementById('lm-desc').value = '';
    document.getElementById('lm-features').value = '';
    document.getElementById('lm-active').checked = true;
  }
  // Категорию можно задать только при создании; при редактировании — только чтение
  catEl.disabled = (id !== null);
  catEl.classList.toggle('sm-locked', id !== null);
  catEl.classList.toggle('sm-editable', id === null);
  modal.classList.add('show');
}

function closeLibModal() {
  document.getElementById('lib-modal').classList.remove('show');
}

async function saveLibItem() {
  const name = document.getElementById('lm-name').value.trim();
  if (!name) { showToast('Введите название', 'error'); return; }
  const type = document.getElementById('lm-type').value;          // trainings | services
  const idVal = document.getElementById('lm-id').value;
  const location_id = parseInt(document.getElementById('lm-location').value) || null;
  if (!location_id) { showToast('Выберите филиал', 'error'); return; }
  const features = document.getElementById('lm-features').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);

  const cat = type === 'trainings' ? 'training' : document.getElementById('lm-cat').value;
  if (type === 'services' && (!cat || cat === 'training')) { showToast('Выберите категорию услуги', 'error'); return; }

  const data = {
    location_id,
    active: document.getElementById('lm-active').checked ? 1 : 0,
    name,
    cat,   // activity_category — определяет, тренировка это или услуга
    dur: parseInt(document.getElementById('lm-dur').value),
    price: parseInt(document.getElementById('lm-price').value),
    difficulty: document.getElementById('lm-difficulty').value,   // код
    desc: document.getElementById('lm-desc').value.trim(),
    features,
  };

  try {
    if (idVal) {
      await LibraryAPI.update({ id: parseInt(idVal), ...data });
      showToast('Обновлено', 'success');
    } else {
      await LibraryAPI.create(data);
      showToast('Добавлено в библиотеку', 'success');
    }
    await loadLibraryAll();
  } catch (e) {
    return;   // ошибка показана в apiRequest; модалку оставляем открытой для повторной попытки
  }
  closeLibModal();
  // Показываем вкладку, куда попала запись (тренировки / услуги)
  if (type !== libCurrentType) switchLibTab(type);
  else renderLibrary();
}

async function deleteLibItem(id) {
  if (!confirm('Удалить из библиотеки?')) return;
  const type = libCurrentType;
  try {
    await LibraryAPI.delete(id);
    await loadLibraryAll();
  } catch (e) {
    return;   // ошибка показана в apiRequest
  }
  renderLibrary();
  showToast('Удалено');
}


