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

const SERVICES = [];


// Услуги грузятся ТОЛЬКО из БД (api/services.php). Встроенного списка больше нет.
async function loadServices() {
  try {
    const data = await ServicesAPI.list();
    if (Array.isArray(data)) { SERVICES.length = 0; data.forEach(function (s) { SERVICES.push(s); }); }
  } catch (e) {
    // Сервер недоступен — остаётся встроенный список услуг (без localStorage-кэша)
  }
}

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

// Категории активностей (dictionaries.activity_category): code -> name.
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
// Основной цвет категории — из CSS-переменной --cat-<код> (css/base.css); неизвестная — серый
function catColor(code) {
  const v = code ? getComputedStyle(document.documentElement).getPropertyValue('--cat-' + code).trim() : '';
  return v || '#888';
}
async function loadActivityCats() {
  try {
    const res = await LibraryAPI.categories();
    if (res && res.length) ACTIVITY_CATS = res;
  } catch (e) { /* сервер недоступен */ }
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
let currentCat = 'all';
let selectedDayIdx = todayIdx;
let selectedSlot = null;
let selectedStation = null;
let currentUser = null;
let bookings = [];
let authMode = 'login';
let HALL_CAP = null;   // вместимость зала (locations.max_people); заполняется после загрузки данных
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

