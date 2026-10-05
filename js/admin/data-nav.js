// Админка: данные специалистов и навигация по разделам

// ═══ ADMIN DATA ══════════════════════════════════════════════════════

let SPECIALISTS_DATA = [];   // активные (для выпадающих списков)
let SPECIALISTS_ALL = [];    // все, включая неактивных (панель «Специалисты»)

// ═══ ПРАВА ═══════════════════════════════════════════════════════════
// Что доступно вошедшему в панели — приходит с сервера при входе (currentUser.rights, currentUser.branches);
// сервер проверяет права и филиал сам на каждом вызове, здесь — только чтобы не показывать недоступное.

// Есть ли право: journal, bookings, clients, schedule, spec_hours (графики специалистов) — у любого администратора
// (в своих филиалах); specialists (добавить, изменить, удалить специалиста), library, hall, system — у администратора системы
function canDo(right) {
  return !!(currentUser && (currentUser.rights || []).indexOf(right) >= 0);
}
const NEED_TITLE = 'Изменять может администратор системы';
// Атрибуты кнопки, на действие которой у вошедшего нет права: кнопка видна, но недоступна (для шаблонов в JS)
function needAttr(right) {
  return canDo(right) ? '' : ' disabled title="' + NEED_TITLE + '"';
}
// То же для кнопок в index.html: data-need="право"
function admApplyNeeds() {
  document.querySelectorAll('[data-need]').forEach(function (el) {
    const ok = canDo(el.getAttribute('data-need'));
    el.disabled = !ok;
    el.title = ok ? '' : NEED_TITLE;
  });
}

// ═══ ФИЛИАЛЫ ПАНЕЛИ ══════════════════════════════════════════════════
// Список филиалов в панели берётся только отсюда: у администратора системы — все, у администратора студии — свои.
// withInactive — вместе с недействующими (настройки, история записей)
function admLocs(withInactive) {
  const src = withInactive && LOCATIONS_ALL.length ? LOCATIONS_ALL : LOCATIONS;
  const b = currentUser ? currentUser.branches : null;
  return b ? src.filter(function (l) { return b.indexOf(Number(l.id)) >= 0; }) : src;
}
// Пункты выпадающего списка филиалов. opts: empty — подпись пустого пункта («Все филиалы», «— Выберите филиал —»);
// single — если филиал один, пустого пункта нет (он и так выбран); withInactive; list — готовый поднабор филиалов
function locOptionsHtml(opts) {
  opts = opts || {};
  const list = opts.list || admLocs(opts.withInactive);
  const empty = opts.empty && !(opts.single && list.length === 1) ? '<option value="">' + escAttr(opts.empty) + '</option>' : '';
  return empty + list.map(function (l) {
    return '<option value="' + l.id + '">' + escAttr(l.name) + (opts.withInactive && !Number(l.active) ? ' (недействующий)' : '') + '</option>';
  }).join('');
}
// Выпадающий список филиала — один на всю панель: заполняет <select> (элемент или id). opts — как у locOptionsHtml,
// плюс value — что выбрать (не задано — остаётся прежний выбор). Возвращает выбранное значение
function fillLocSelect(sel, opts) {
  if (typeof sel === 'string') sel = document.getElementById(sel);
  if (!sel) return '';
  opts = opts || {};
  const keep = opts.value !== undefined ? String(opts.value || '') : sel.value;
  sel.innerHTML = locOptionsHtml(opts);
  sel.value = keep;
  if (sel.selectedIndex < 0 && sel.options.length) sel.selectedIndex = 0;   // прежнего выбора в списке нет — первый пункт
  return sel.value;
}
// Те же филиалы для списка с выбором нескольких (msHtml)
function locMsOptions(withInactive) {
  return admLocs(withInactive).map(function (l) { return { value: l.id, label: l.name }; });
}
// ═══ ТЕКУЩИЙ ФИЛИАЛ ══════════════════════════════════════════════════
// Один переключатель в шапке (#adm-branch) на всю панель: журнал записи, записи, расписание, библиотека и зал
// показывают выбранный филиал; отдельных списков филиалов на этих экранах нет.
// «Все филиалы» (admBranchId = null) есть, когда у администратора их несколько: сводные экраны показывают все,
// а экраны одного филиала (журнал, зал) просят выбрать филиал.
// Выбор запоминается в браузере отдельно для каждого пользователя.
let admBranchId = null;
function admBranchKey() { return 'etalon.admBranch.' + (currentUser ? currentUser.id : 0); }

// При входе и выходе: показать переключатель администратору и восстановить его выбор (по умолчанию — первый филиал)
function admBranchInit() {
  const sel = document.getElementById('adm-branch');
  if (!sel) return;
  const isAdmin = !!currentUser && currentUser.role === 'admin';
  sel.style.display = isAdmin ? '' : 'none';
  admBranchId = null;
  if (!isAdmin) return;
  const locs = admLocs();
  let saved = null;
  try { saved = localStorage.getItem(admBranchKey()); } catch (e) { /* хранилище недоступно */ }
  const known = saved !== null && (saved === '' || locs.some(function (l) { return String(l.id) === saved; }));
  const value = known ? saved : (locs[0] ? String(locs[0].id) : '');
  admBranchId = Number(fillLocSelect(sel, { empty: 'Все филиалы', single: true, value: value })) || null;
}

// Администратор выбрал филиал: запомнить и перерисовать открытый раздел панели
function admBranchSet(value) {
  admBranchId = Number(value) || null;
  try { localStorage.setItem(admBranchKey(), admBranchId ? String(admBranchId) : ''); } catch (e) { /* выбор действует до перезагрузки */ }
  const cur = document.querySelector('.adm-nav-item.active');
  const m = cur ? (cur.getAttribute('onclick') || '').match(/admNav\('(\w+)'/) : null;
  if (m && currentPage === 'admin') admNav(m[1], cur);
}

// Текущий филиал (объект) или null — «все филиалы»
function admCurLoc() {
  return admBranchId ? admLocs().find(function (l) { return Number(l.id) === admBranchId; }) || null : null;
}
// Филиалы, которые сейчас показывают сводные экраны: выбранный или все доступные
function admCurLocs() {
  const loc = admCurLoc();
  return loc ? [loc] : admLocs();
}
// Подсказка на экранах одного филиала, когда выбраны «Все филиалы»
const ADM_PICK_BRANCH = 'Выберите филиал в шапке — этот раздел показывает один филиал';

// Разделы меню, которые требуют права (остальные видит любой администратор)
const ADM_NAV_RIGHT = { journal: 'journal', bookings: 'bookings', clients: 'clients', schedule: 'schedule', specialists: 'spec_hours' };
// Скрыть в меню разделы без права и заголовки групп, в которых ничего не осталось
function admMenuApply() {
  let group = null, shown = 0;
  const closeGroup = function () { if (group) group.style.display = shown ? '' : 'none'; };
  document.querySelectorAll('.adm-nav > *').forEach(function (el) {
    if (el.classList.contains('adm-nav-section')) { closeGroup(); group = el; shown = 0; return; }
    const m = (el.getAttribute('onclick') || '').match(/admNav\('(\w+)'/);
    const ok = !m || !ADM_NAV_RIGHT[m[1]] || canDo(ADM_NAV_RIGHT[m[1]]);
    el.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  closeGroup();
  admApplyNeeds();
}

// ═══ ADMIN NAVIGATION ════════════════════════════════════════════════

// Меню панели на телефоне: строка с названием текущего раздела раскрывает список разделов (css/admin.css, @media).
// На широком экране меню всегда открыто сбоку, и класс is-open ни на что не влияет
function admMenuToggle(open) {
  const sb = document.querySelector('.adm-sidebar');
  if (sb) sb.classList.toggle('is-open', open);
}
// Название выбранного раздела — в строку-переключатель (без счётчика уведомлений); список закрываем
function admMenuCurrent(el) {
  const cur = document.getElementById('adm-current');
  if (cur && el) {
    const copy = el.cloneNode(true);
    copy.querySelectorAll('.adm-nav-badge, svg').forEach(function (x) { x.remove(); });
    cur.textContent = copy.textContent.trim();
  }
  admMenuToggle(false);
}
// Нажатие мимо меню и Esc закрывают список
document.addEventListener('click', function (e) {
  if (e.target instanceof Element && !e.target.closest('.adm-sidebar')) admMenuToggle(false);
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') admMenuToggle(false); });

async function admNav(name, el) {
  document.querySelectorAll('.adm-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  admMenuCurrent(el);
  const panel = document.getElementById('adm-' + name);
  if (panel) panel.classList.add('active');

  // Подгружаем свежие данные с сервера при переключении раздела
  const loaders = {
    journal: async function () { await Promise.allSettled([jrLoad(), loadClients()]); },   // день филиала; клиенты — для записи по звонку
    bookings: loadBookingsPanel,   // с фильтрами раздела (период, филиал)
    clients: loadClients,
    specialists: async function () { await Promise.allSettled([loadSpecialists(), loadSpecialistsAll(), loadLocationsAll(), loadDictValues(), loadDictAvailability()]); },
    library: async function () { await Promise.allSettled([loadLibraryAll(), loadActivityCats(), loadDictAvailability(), loadDictValues()]); },
    settings: loadLocationsAll,
  };
  if (loaders[name]) await loaders[name]().catch(function () { });

  const renders = {
    journal: renderJournal,
    schedule: renderAdminSchedule,
    specialists: renderSpecialists,
    library: renderLibrary,
    bookings: renderAdminBookings,
    clients: renderAdminClients,
    settings: renderSettings,
  };
  if (renders[name]) renders[name]();
}

