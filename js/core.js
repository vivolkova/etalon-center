// Общие данные и состояние: даты, справочники, библиотека, филиалы, навигация по страницам

// ═══ DATA ═══════════════════════════════════════════════════════

const today = new Date(); today.setHours(0, 0, 0, 0);
const todayIdx = ((today.getDay() + 6) % 7); // пн=0

const SLOTS = [];
const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Слоты берутся ТОЛЬКО из БД (loadSlots -> SlotsAPI.list). Демо-генератор убран.

// ═══ LIBRARY ════════════════════════════════════════════════════════
let LIBRARY = { trainings: [], services: [] };

// Уровень сложности: код в БД -> русская подпись на фронте
const DIFFICULTY_LABEL = { any: 'Любой', beginner: 'Начинающий', intermediate: 'Средний', advanced: 'Продвинутый' };

// Библиотека грузится ТОЛЬКО из БД (api/library.php).
async function loadLocations() {
  try {
    const res = await LocationsAPI.list();
    if (res && res.length) {
      LOCATIONS = res;
      HALL_CAP = parseInt(res[0].max_people);   // вместимость — из локации
    }
  } catch (e) { /* сервер недоступен */ }
}

async function loadLocationsAll() {
  try {
    const res = await LocationsAPI.listAll();
    if (res) LOCATIONS_ALL = res;
  } catch (e) { /* сервер недоступен */ }
}

// Категории занятий: training (dictionaries.activity_category) и услуги (service_category, is_service = 1): code -> name.
// Значения по умолчанию — пока справочник не загрузился.
// spec_type / spec_name — тип специалиста категории (dictionaries.ref_id -> specialist_type).
let ACTIVITY_CATS = [
  { code: 'training', name: 'Тренировка', spec_type: 'trainer',    spec_name: 'Тренер' },
  { code: 'bikefit',  name: 'Байкфит',    spec_type: 'bikefitter', spec_name: 'Байкфиттер' },
  { code: 'workshop', name: 'Мастерская', spec_type: 'mechanic',   spec_name: 'Мастер' },
];
function catName(code) {
  const c = ACTIVITY_CATS.find(function (x) { return x.code === code; });
  return c ? c.name : (code || '—');
}
// Экранирование текста для вставки в HTML (атрибуты и содержимое)
function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Кнопки-фильтры категорий («Все» + категории из справочника activity_category) и легенда.
// onclickFn — имя глобальной функции-обработчика (cat, btn).
// cats — какие категории показать (по умолчанию все; сайт передаёт доступные в выбранном филиале).
function catChipsHtml(current, onclickFn, cats) {
  return '<button class="chip' + (current === 'all' ? ' active' : '') + '" onclick="' + onclickFn + '(\'all\',this)">Все</button>' +
    (cats || ACTIVITY_CATS).map(function (c) {
      return '<button class="chip cat-chip cat-' + c.code + (current === c.code ? ' active' : '') + '" onclick="' + onclickFn + '(\'' + c.code + '\',this)">' + escAttr(c.name) + '</button>';
    }).join('');
}
function catLegendHtml(cats) {
  return (cats || ACTIVITY_CATS).map(function (c) {
    return '<div class="sch-legend-item"><div class="sch-legend-dot cat-' + c.code + '"></div>' + escAttr(c.name) + '</div>';
  }).join('');
}
// Выбранная категория пропала из справочника (выключили) или из списка cats — сбросить на «Все»
function validCat(cat, cats) {
  return cat === 'all' || (cats || ACTIVITY_CATS).some(function (c) { return c.code === cat; }) ? cat : 'all';
}

// Занимает ли занятие места в зале (станки, вместимость, блокировки станков): только тренировки.
// Услуги (байкфит, мастерская…) проходят в своих помещениях.
function slotUsesHall(cat) { return cat === 'training'; }

// Места на занятии: вместимость филиала минус заблокированные на это занятие станки (ремонт и т.п.);
// свободно = места минус записи. s.blocked приходит из api/slots.php.
// Занятие без зала (байкфит) — один клиент на слот.
// Индивидуальное занятие (всё, кроме групповой тренировки) — один клиент; создаётся записью клиента.
// То же правило на сервере (slotIsIndividual в middleware/slot_rules.php)
function slotIsIndividual(s) { return !(s.cat === 'training' && s.type === 'group'); }
function slotCap(s) { return slotIsIndividual(s) ? 1 : Math.max((s.max || 0) - (s.blocked || 0), 0); }
function slotFree(s) { return Math.max(slotCap(s) - (s.taken || 0), 0); }

// Основной цвет категории — из CSS-переменной --cat-<код> (css/base.css); у категории без своего цвета
// (новая услуга) — общий --cat-other
function catColor(code) {
  const cs = getComputedStyle(document.documentElement);
  const v = code ? cs.getPropertyValue('--cat-' + code).trim() : '';
  return v || cs.getPropertyValue('--cat-other').trim() || '#888';
}
async function loadActivityCats() {
  try {
    const res = await LibraryAPI.categories();
    if (res && res.length) ACTIVITY_CATS = res.map(function (c) { return Object.assign({}, c, { id: Number(c.id) }); });
  } catch (e) { /* сервер недоступен */ }
}

// Типы специалистов (dictionaries.specialist_type): [{ id, code, name }] — активные.
// Значения по умолчанию — пока справочник не загрузился.
let SPEC_TYPES = [
  { id: 0, code: 'trainer', name: 'Тренер' },
  { id: 0, code: 'bikefitter', name: 'Байкфиттер' },
  { id: 0, code: 'mechanic', name: 'Мастер' },
];
function specTypeName(code) {
  const t = SPEC_TYPES.find(function (x) { return x.code === code; });
  return t ? t.name : (code || '—');
}
// Типы занятий (dictionaries.slot_type) — задаются в библиотеке у тренировок:
// group — групповая с тренером, personal — персональная с тренером, free — самостоятельная, без тренера
let SLOT_TYPES = [
  { id: 0, code: 'group', name: 'Групповая' },
  { id: 0, code: 'personal', name: 'Персональная' },
  { id: 0, code: 'free', name: 'Самостоятельная' },
];

// Нужен ли занятию специалист: групповая и персональная тренировка — да, самостоятельная — нет; услугу всегда
// оказывает специалист. То же правило на сервере (activityNeedsSpecialist в middleware/specialist_hours.php)
function activityNeedsSpecialist(cat, type) {
  return cat === 'training' ? (type === 'group' || type === 'personal') : true;
}
function slotTypeName(code) {
  const t = SLOT_TYPES.find(function (x) { return x.code === code; });
  return t ? t.name : (code || '—');
}

// Значения справочника для форм: типы специалистов и типы занятий (одним запросом)
async function loadDictValues() {
  try {
    const res = await DictionariesAPI.list();
    const pick = function (group) {
      return (res || []).filter(function (d) { return d.group_code === group && d.active; })
        .map(function (d) { return { id: Number(d.id), code: d.code, name: d.name }; });
    };
    const spec = pick('specialist_type'), slot = pick('slot_type');
    if (spec.length) SPEC_TYPES = spec;
    if (slot.length) SLOT_TYPES = slot;
  } catch (e) { /* сервер недоступен */ }
}

// Филиалы значений прикладных групп (activity_category, specialist_type): { dictionaryId: [locationId, …] }.
// Значение доступно только в своих филиалах; значений других групп здесь нет — они не зависят от филиала
let DICT_LOCS = {};
async function loadDictAvailability() {
  try {
    const res = await DictionariesAPI.availability();
    DICT_LOCS = {};
    (res || []).forEach(function (r) { DICT_LOCS[r.dictionary_id] = r.location_ids || []; });
  } catch (e) { /* сервер недоступен */ }
}
// Доступно ли значение справочника в филиале (нет данных — считаем доступным)
function dictAvailableAt(dictId, locId) {
  if (!dictId || !locId || !DICT_LOCS[dictId]) return true;
  return DICT_LOCS[dictId].indexOf(Number(locId)) >= 0;
}
// Категории активностей, доступные в филиале
function catsAt(locId) {
  return ACTIVITY_CATS.filter(function (c) { return dictAvailableAt(c.id, locId); });
}

// Тренировка — категория training, всё остальное — услуги
function groupLibrary(items) {
  const grouped = { trainings: [], services: [] };
  items.forEach(function (it) {
    (it.cat === 'training' ? grouped.trainings : grouped.services).push(it);
  });
  return grouped;
}

async function loadLibrary() {
  try {
    const items = await LibraryAPI.list();
    LIBRARY = groupLibrary(items);
    const wm = items.find(it => it.max != null);
    if (wm) HALL_CAP = wm.max;   // вместимость зала — из локации (одинакова для филиала)
  } catch (e) {
    // Сервер недоступен — остаются данные по умолчанию (без localStorage-кэша)
  }
}

// Библиотека для админки: все записи, включая удалённые (active=0)
async function loadLibraryAll() {
  try {
    const items = await LibraryAPI.listAll();
    LIBRARY = groupLibrary(items);
  } catch (e) { /* сервер недоступен */ }
}

// ═══ STATE ══════════════════════════════════════════════════════

let currentPage = 'home';
let selectedDayIdx = todayIdx;
let selectedSlot = null;
let selectedStation = null;
let currentUser = null;
let bookings = [];
let authMode = 'login';
let HALL_CAP = null;   // вместимость зала (locations.max_people); заполняется после загрузки данных

// Вместимость зала филиала (locations.max_people); нет данных — HALL_CAP
function hallCapOf(locId) {
  const l = locId && typeof findLocation === 'function' ? findLocation(locId) : null;
  return l && l.max_people != null ? parseInt(l.max_people) : HALL_CAP;
}
let LOCATIONS = [];    // активные филиалы (для выпадающих списков)
let LOCATIONS_ALL = []; // все филиалы, включая неактивные (для раздела Настройки)

// Fake user db
const USERS = [
  { email: 'admin@velo.ru', password: 'admin123', name: 'Администратор', phone: '+7 495 000-00-00', role: 'admin' },
];

// ─── CLIENT DATABASE ────────────────────────────────────────────────
let CLIENTS = [];

// ═══ PAGES ══════════════════════════════════════════════════════

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  currentPage = name;
  if (name === 'schedule') renderSchedule();
  if (name === 'individual') renderIndividualPage();
  if (name === 'services') renderServices();
  if (name === 'bookings') renderBookings();
  if (name === 'client') renderClientPanel();
  if (name === 'admin') { renderAdmin(); admNav('dashboard', document.querySelector('.adm-nav-item')); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setNavActive(el) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
}

