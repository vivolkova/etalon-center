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
    grid.innerHTML = '<div class="lib-empty"><div class="u-text-ui u-strong u-mb-8">Ничего не найдено</div><button class="btn-primary" onclick="openLibItemModal(null,\'' + libCurrentType + '\')">' +
      (libCurrentType === 'trainings' ? 'Добавить тренировку' : 'Добавить услугу') + '</button></div>';
    return;
  }
  const cardHtml = function (item) {
    const locObj = LOCATIONS_ALL.concat(LOCATIONS).find(function (x) { return x.id === item.location_id; });
    const locName = locObj ? locObj.name : '';
    const features = (item.features || []).slice(0, 3);
    let difficultyHtml = (isTraining && item.difficulty) ? '<div class="lib-difficulty">' + (DIFFICULTY_LABEL[item.difficulty] || item.difficulty) + '</div>' : '';
    let featuresHtml = '';
    if (features.length) {
      featuresHtml = '<div class="lib-card-features">' +
        features.map(function (f) {
          return '<div class="lib-card-feature"><div class="lib-card-feature-dot"></div><span>' + f + '</span></div>';
        }).join('') + '</div>';
    }
    let maxHtml = (isTraining && item.max) ? '<span class="lib-meta-tag">до ' + item.max + ' чел.</span>' : '';
    const inactive = !Number(item.active);
    const delBadge = inactive ? '<span class="lib-meta-tag tag-muted">Удалена</span>' : '';
    const actionsHtml = inactive
      ? '<button class="action-btn confirm btn-sm" onclick="openLibItemModal(' + item.id + ')">Ред.</button>'
      : (libCanSchedule(item) ? '<button class="lib-add-slot-btn" onclick="addToScheduleFromLib(' + item.id + ')">+ В расписание</button>' : '') +
        '<button class="action-btn confirm btn-sm" onclick="openLibItemModal(' + item.id + ')">Ред.</button>' +
        '<button class="action-btn cancel btn-sm" onclick="deleteLibItem(' + item.id + ')">Уд.</button>';
    // Цвет плашки и точек — по категории и виду тренировки
    return '<div class="lib-card ' + colorClass(item.cat, item.type) + (inactive ? ' is-inactive' : '') + '">' +
      difficultyHtml +
      '<div class="lib-card-header"><div>' +
      '<div class="lib-card-cat">' + catName(item.cat) + '</div>' +
      '<div class="lib-card-title">' + item.name + '</div>' +
      '</div></div>' +
      '<div class="lib-card-desc">' + item.desc + '</div>' +
      featuresHtml +
      '<div class="lib-card-meta">' + delBadge + (locName ? '<span class="lib-meta-tag">' + locName + '</span>' : '') + (item.type ? '<span class="lib-meta-tag">' + escAttr(slotTypeName(item.type)) + '</span>' : '') + '<span class="lib-meta-tag">' + item.dur + ' мин</span>' + maxHtml + '</div>' +
      '<div class="lib-card-footer">' +
      '<div class="lib-card-price">' + Number(item.price).toLocaleString('ru') + ' ₽</div>' +
      '<div class="lib-card-actions">' + actionsHtml + '</div>' +
      '</div>' +
      '</div>';
  };

  // Блоки: тренировки — по виду (групповые, персональные, самостоятельные; порядок справочника slot_type),
  // услуги — по категории (порядок справочника). Пустые блоки не показываем; заголовок — как на странице «Услуги» сайта
  const isTraining = libCurrentType === 'trainings';
  const keyOf = function (item) { return isTraining ? (item.type || '') : item.cat; };
  const keys = (isTraining ? SLOT_TYPES : ACTIVITY_CATS).map(function (x) { return x.code; });
  items.forEach(function (item) { if (keys.indexOf(keyOf(item)) < 0) keys.push(keyOf(item)); });
  grid.innerHTML = keys.map(function (key) {
    const block = items.filter(function (item) { return keyOf(item) === key; });
    if (!block.length) return '';
    const title = isTraining ? (LIB_TYPE_TITLES[key] || slotTypeName(key)) : catName(key);
    return '<div class="svc-section ' + (isTraining ? colorClass('training', key) : colorClass(key)) + '">' +
      '<h3 class="svc-section-title"><span class="svc-dot"></span>' + escAttr(title) + '</h3>' +
      '<div class="lib-grid">' + block.map(cardHtml).join('') + '</div></div>';
  }).join('');
}

// Заголовки блоков тренировок по виду (slot_type); у нового вида — его название из справочника
const LIB_TYPE_TITLES = { group: 'Групповые тренировки', personal: 'Персональные тренировки', free: 'Самостоятельные тренировки' };


// ── ADD TO SCHEDULE FROM LIBRARY ──────────────────────────────────
let ltsLibId = null;
let ltsWeekStart = new Date(admWeekStart);
let ltsSelectedDays = new Set();

// Админ ставит в расписание только групповые тренировки (training + slot_type group).
// Персональную, самостоятельную и байкфит записывает клиент (или админ за клиента).
// Сервер проверяет то же самое (api/slots.php).
function libCanSchedule(item) {
  return !!item && item.cat === 'training' && item.type === 'group';
}

function addToScheduleFromLib(id) {
  const item = LIBRARY[libCurrentType].find(x => x.id === id);
  if (!item) return;
  if (!libCanSchedule(item)) { showToast('В расписание можно добавлять только групповые тренировки', 'error'); return; }
  ltsLibId = id;
  ltsWeekStart = new Date(admWeekStart);
  ltsSelectedDays = new Set();

  // Превью
  document.getElementById('lts-cat-dot').style.background = catColor(item.cat);
  document.getElementById('lts-name').textContent = item.name;
  document.getElementById('lts-meta').textContent =
    catName(item.cat) + ' · ' + item.dur + ' мин · ' + Number(item.price).toLocaleString('ru') + ' ₽';

  // Тренер / Байкфиттер / Мастер — по категории записи (activity_category.ref_id)
  applySpecialistFilter('lts-specialist', 'lts-specialist-label', item.cat, item.location_id);
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
  // Тренер — по id; у групповой тренировки обязателен (то же проверяет сервер)
  const trainerObj = SPECIALISTS_DATA.find(function (t) { return t.id === parseInt(document.getElementById('lts-specialist').value); }) || null;
  if (!trainerObj) { showToast('Выберите тренера', 'error'); return; }
  const repeat = document.getElementById('lts-repeat').value;
  const weeks = repeat === 'once' ? 1 : repeat === '2weeks' ? 2 : 4;

  // Слоты создаются по одному без отдельных сообщений; в конце — один итог с причинами отказов
  let added = 0;
  const failed = [];   // [{date, reason}]
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
        specialist_id: trainerObj.id,
      };
      promises.push(
        SlotsAPI.create(apiData, true)
          .then(function () { added++; })
          .catch(function (e) { failed.push({ date: slotDate, reason: e.message }); })
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

  const total = added + failed.length;
  // Ничего не добавлено — окно остаётся открытым, чтобы поменять время, тренера или дни
  if (!added) {
    showToast('Ни одно занятие не добавлено. ' + ltsFailText(failed), 'error');
    return;
  }
  closeLtsModal();
  const schTab = document.querySelector('.atab[onclick*="schedule"]');
  if (schTab) switchAdminTab('schedule', schTab);
  renderAdminSchedule();
  if (failed.length) showToast('Добавлено ' + added + ' из ' + total + '. Не добавлены: ' + ltsFailText(failed), 'error');
  else showToast('Добавлено ' + added + ' занятий в расписание', 'success');
}

// Причины отказов по датам: «14.10 — …; 16.10 — …» (не больше 5, дальше «и ещё N»)
function ltsFailText(failed) {
  const list = failed.slice().sort(function (a, b) { return a.date - b.date; });
  const dd = function (d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); };
  return list.slice(0, 5).map(function (f) { return dd(f.date) + ' — ' + escAttr(f.reason); }).join('; ') +
    (list.length > 5 ? '; и ещё ' + (list.length - 5) : '');
}


// kind: 'trainings' | 'services' — какая кнопка нажата («+ Тренировка» / «+ Услуга»).
// При редактировании вид определяется категорией записи.
// Категория в форме библиотеки: тренировка — фиксированно training (поле скрыто);
// услуга — категории activity_category без training, доступные в выбранном филиале.
// Категорию редактируемой записи показываем, даже если она отключена в филиале.
// Тип занятия (dictionaries.slot_type) в форме библиотеки
function lmFillFormat(code) {
  const sel = document.getElementById('lm-format');
  sel.innerHTML = SLOT_TYPES.map(function (t) { return '<option value="' + t.code + '">' + escAttr(t.name) + '</option>'; }).join('');
  sel.value = SLOT_TYPES.some(function (t) { return t.code === code; }) ? code : (SLOT_TYPES[0] ? SLOT_TYPES[0].code : '');
}

function lmFillCats(isTraining, keepCode) {
  const catEl = document.getElementById('lm-cat');
  const locId = parseInt(document.getElementById('lm-location').value) || null;
  if (isTraining) { catEl.innerHTML = '<option value="training">' + catName('training') + '</option>'; return; }
  let list = catsAt(locId).filter(function (c) { return c.code !== 'training'; });
  if (keepCode && !list.some(function (c) { return c.code === keepCode; }))
    list = list.concat([{ code: keepCode, name: catName(keepCode) + ' (отключена в филиале)' }]);
  const cur = keepCode || catEl.value;
  catEl.innerHTML = list.length
    ? list.map(function (c) { return '<option value="' + c.code + '">' + escAttr(c.name) + '</option>'; }).join('')
    : '<option value="">— в филиале нет доступных категорий услуг —</option>';
  catEl.value = list.some(function (c) { return c.code === cur; }) ? cur : (list[0] ? list[0].code : '');
}

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

  const catEl = document.getElementById('lm-cat');
  document.getElementById('lm-cat-wrap').style.display = isTraining ? 'none' : '';
  // Тип занятия (групповая / индивидуальная) — только у тренировок
  document.getElementById('lm-format-wrap').style.display = isTraining ? '' : 'none';
  const diffWrap = document.getElementById('lm-difficulty-wrap');
  diffWrap.style.display = isTraining ? '' : 'none';
  const capWrap = document.getElementById('lm-cap-wrap');
  if (capWrap) capWrap.style.display = isTraining ? '' : 'none';
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
    document.getElementById('lm-dur').value = item.dur;
    document.getElementById('lm-price').value = item.price;
    document.getElementById('lm-difficulty').value = item.difficulty || 'any';
    lmFillFormat(item.type);
    document.getElementById('lm-desc').value = item.desc || '';
    document.getElementById('lm-features').value = (item.features || []).join('\n');
    document.getElementById('lm-active').checked = !!Number(item.active);
  } else {
    document.getElementById('lib-modal-title').textContent = isTraining ? 'Новая тренировка' : 'Новая услуга';
    document.getElementById('lm-id').value = '';
    if (locSel) locSel.value = LOCATIONS.length === 1 ? LOCATIONS[0].id : '';
    document.getElementById('lm-name').value = '';
    document.getElementById('lm-dur').value = 60;
    document.getElementById('lm-price').value = isTraining ? 1200 : 3000;
    document.getElementById('lm-difficulty').value = 'any';
    lmFillFormat('group');
    document.getElementById('lm-desc').value = '';
    document.getElementById('lm-features').value = '';
    document.getElementById('lm-active').checked = true;
  }
  // Категории — доступные в выбранном филиале (Настройки → Справочники); мест — вместимость зала филиала
  const lmSyncLocation = function () {
    lmFillCats(isTraining, item ? item.cat : null);
    const locId = parseInt(locSel.value) || null;
    const cap = locId ? hallCapOf(locId) : null;
    document.getElementById('lm-cap').value = cap ?? '';
  };
  lmSyncLocation();
  if (locSel) locSel.onchange = lmSyncLocation;
  // Филиал, категорию и тип занятия можно задать только при создании; при редактировании — только чтение
  // (слоты хранят снимок занятия; для другого филиала — новая запись)
  catEl.disabled = (id !== null);   // disabled → серый стиль неизменяемого поля (css/site.css)
  document.getElementById('lm-format').disabled = (id !== null);
  if (locSel) {
    locSel.disabled = (id !== null);
    locSel.title = id !== null ? 'Филиал записи не меняется — для другого филиала создайте новую запись' : '';
  }
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
  if (!idVal && !catsAt(location_id).some(function (c) { return c.code === cat; })) {
    showToast('«' + catName(cat) + '» отключена в этом филиале (Настройки → Справочники)', 'error'); return;
  }

  const data = {
    location_id,
    active: document.getElementById('lm-active').checked ? 1 : 0,
    name,
    cat,   // activity_category — определяет, тренировка это или услуга
    dur: parseInt(document.getElementById('lm-dur').value),
    price: parseInt(document.getElementById('lm-price').value),
    difficulty: document.getElementById('lm-difficulty').value,   // код
    type: cat === 'training' ? (document.getElementById('lm-format').value || 'group') : null,  // slot_type — только у тренировок
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
  if (!await uiConfirm('Удалить из библиотеки?')) return;
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


