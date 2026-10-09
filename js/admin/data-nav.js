// Админка: данные специалистов и навигация по разделам

// ═══ ADMIN DATA ══════════════════════════════════════════════════════

let SPECIALISTS_DATA = [];   // работающие специалисты (для выпадающих списков)

// ═══ ПРАВА ═══════════════════════════════════════════════════════════
// Что доступно вошедшему в панели — приходит с сервера при входе (currentUser.rights, currentUser.branches);
// сервер проверяет права и филиал сам на каждом вызове, здесь — только чтобы не показывать недоступное.

// Есть ли право: journal, bookings, clients, blocks (блокировка станков на занятие), spec_hours (графики специалистов) —
// у любого администратора (в своих филиалах); schedule (изменение расписания), staff (добавить и изменить сотрудника,
// его роли), library, hall, system — у администратора системы
function canDo(right) {
  return !!(currentUser && (currentUser.rights || []).indexOf(right) >= 0);
}
const NEED_TITLE = 'Изменять может главный управляющий';
// Кнопки, на действие которых у вошедшего нет права, на экране нет вовсе (решение владельца 09.10.2026; раньше они
// были серыми). needAttr — атрибут такой кнопки для шаблонов в JS
function needAttr(right) {
  return canDo(right) ? '' : ' style="display:none"';
}
// Поле, которое вошедший видит, но менять не может (значение ему нужно): остаётся на экране недоступным
function needFieldAttr(right) {
  return canDo(right) ? '' : ' disabled title="' + NEED_TITLE + '"';
}
// То же для кнопок в index.html: data-need="право"
function admApplyNeeds() {
  document.querySelectorAll('[data-need]').forEach(function (el) {
    el.style.display = canDo(el.getAttribute('data-need')) ? '' : 'none';
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
// Специалисты панели (активные): у администратора студии — только те, кто работает в его филиалах
function admSpecialists() {
  const b = currentUser ? currentUser.branches : null;
  return b ? SPECIALISTS_DATA.filter(function (t) { return t.location_ids.some(function (id) { return b.indexOf(id) >= 0; }); }) : SPECIALISTS_DATA;
}

// ═══ ТЕКУЩИЙ ФИЛИАЛ ══════════════════════════════════════════════════
// Текущий филиал один на всю панель: журнал записи, записи, расписание, библиотека и зал показывают выбранный филиал.
// Где он выбирается (решение владельца 09.10.2026):
//   • у администратора студии — переключатель в шапке (#adm-branch): он в одно время работает в одном филиале;
//   • у главного управляющего шапка без переключателя — выбор стоит рядом с заголовком экранов, которым нужен
//     филиал (блоки [data-adm-branch] в index.html: one — экран одного филиала, all — есть «Все филиалы»).
// Выбор общий: выбрали филиал на одном экране — он же на остальных.
// «Все филиалы» (admBranchId = null) есть, когда у администратора их несколько: сводные экраны показывают все,
// а экраны одного филиала (журнал, зал) просят выбрать филиал.
// Выбор запоминается в браузере отдельно для каждого пользователя.
let admBranchId = null;
function admBranchKey() { return 'etalon.admBranch.' + (currentUser ? currentUser.id : 0); }

// При входе и выходе: показать переключатель администратору и восстановить его выбор (по умолчанию — первый филиал)
function admBranchInit() {
  const box = document.getElementById('adm-branch');
  if (!box) return;
  const isAdmin = !!currentUser && currentUser.role === 'admin';
  box.hidden = !isAdmin || !admBranchInHeader();
  admBranchId = null;
  if (!isAdmin) { box.innerHTML = ''; return; }
  const locs = admLocs();
  let saved = null;
  try { saved = localStorage.getItem(admBranchKey()); } catch (e) { /* хранилище недоступно */ }
  const known = saved !== null && (saved === '' || locs.some(function (l) { return String(l.id) === saved; }));
  const value = known ? saved : (locs[0] ? String(locs[0].id) : '');
  admBranchId = Number(value) || null;
  admBranchRender();
}
// Выбор филиала в шапке — у администратора студии; у главного управляющего (филиалы — все) — на экранах
function admBranchInHeader() {
  return !!currentUser && currentUser.branches !== null && currentUser.branches !== undefined;
}
// Переключатель — того же вида, что выбор филиала на сайте (locPickerHtml в js/site/schedule.js).
// «Все филиалы» — когда у администратора их несколько. На экранах: блок one — без «Все филиалы» (экран одного
// филиала; пока филиал не выбран — «Выберите филиал»); филиал всего один — выбирать не из чего, блока нет
function admBranchRender() {
  const box = document.getElementById('adm-branch');
  const locs = admLocs(), cur = admCurLoc();
  const inHeader = admBranchInHeader();
  box.innerHTML = inHeader ? locPickerHtml(locs, cur ? cur.id : null, cur ? cur.name : 'Все филиалы', 'admBranchSet', locs.length > 1 ? 'Все филиалы' : '') : '';
  const isAdmin = !!currentUser && currentUser.role === 'admin';
  document.querySelectorAll('[data-adm-branch]').forEach(function (el) {
    const all = el.getAttribute('data-adm-branch') === 'all';
    const show = isAdmin && !inHeader && locs.length > 1;
    el.hidden = !show;
    el.innerHTML = show ? locPickerHtml(locs, cur ? cur.id : null, cur ? cur.name : (all ? 'Все филиалы' : 'Выберите филиал'), 'admBranchSet', all ? 'Все филиалы' : '') : '';
  });
}

// Администратор выбрал филиал: запомнить и перерисовать открытый раздел панели
function admBranchSet(value) {
  admBranchId = Number(value) || null;
  try { localStorage.setItem(admBranchKey(), admBranchId ? String(admBranchId) : ''); } catch (e) { /* выбор действует до перезагрузки */ }
  admBranchRender();
  document.querySelectorAll('.ms.open').forEach(function (x) { x.classList.remove('open'); });
  navToggle(false);   // на телефоне переключатель — в выпадающем меню шапки
  const cur = document.querySelector('.adm-nav-item.active');
  if (cur && currentPage === 'admin') admNav(admNavName(cur), cur);
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
const ADM_PICK_BRANCH = 'Выберите филиал — этот раздел показывает один филиал';

// Разделы меню, которые требуют права (остальные видит любой администратор)
const ADM_NAV_RIGHT = { journal: 'journal', bookings: 'bookings', clients: 'clients', schedule: 'blocks' };
// Скрыть в меню разделы без права и пункты шапки тех групп, в которых ничего не осталось.
// Вызывается при входе и выходе: без администратора пунктов групп в шапке нет
function admMenuApply() {
  const isAdmin = !!currentUser && currentUser.role === 'admin';
  document.querySelector('.nav').classList.toggle('nav--admin', isAdmin);   // у администратора шапка плотнее (css/admin.css)
  document.querySelectorAll('.adm-nav-group').forEach(function (group) {
    let shown = 0;
    group.querySelectorAll('.adm-nav-item').forEach(function (el) {
      const name = admNavName(el);
      const ok = !ADM_NAV_RIGHT[name] || canDo(ADM_NAV_RIGHT[name]);
      el.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    admGroupLink(group.getAttribute('data-group')).style.display = isAdmin && shown ? '' : 'none';
  });
  admApplyNeeds();
}
// Раздел, который открывает пункт левого меню
function admNavName(el) {
  const m = (el.getAttribute('onclick') || '').match(/admNav\('(\w+)'/);
  return m ? m[1] : '';
}

// ═══ ГРУППЫ РАЗДЕЛОВ ═════════════════════════════════════════════════
// Группы панели («Запись из расписания», «Клиенты», «Управление записями», «Управление расписанием», «Филиалы», «Сотрудники», «Настройки») — пункты шапки (index.html, data-adm-group);
// в меню слева — разделы выбранной группы (.adm-nav-group). Экран один для администратора системы
// и администратора студии: что видно и доступно, решают права (admMenuApply, needAttr)
let admGroupCur = 'journal';
function admGroupLink(name) {
  return document.querySelector('.nav-link[data-adm-group="' + name + '"]');
}
// Пункт шапки: открыть группу
function admGroup(name) {
  admGroupCur = name;
  showPage('admin');
}
// Показать текущую группу и её первый доступный раздел (вызывается из showPage('admin'))
function admGroupOpen() {
  const visible = function (el) { return el.style.display !== 'none'; };
  const groups = Array.from(document.querySelectorAll('.adm-nav-group'));
  const open = function (g) { return visible(admGroupLink(g.getAttribute('data-group'))); };
  const group = groups.find(function (g) { return g.getAttribute('data-group') === admGroupCur && open(g); }) || groups.find(open);
  if (!group) return;
  admGroupCur = group.getAttribute('data-group');
  groups.forEach(function (g) { g.classList.toggle('active', g === group); });
  const link = admGroupLink(admGroupCur);
  setNavActive(link);
  document.getElementById('adm-group-title').textContent = link.textContent;
  const items = Array.from(group.querySelectorAll('.adm-nav-item')).filter(visible);
  // в группе один раздел — меню слева не нужно (css/admin.css, .adm-layout--solo)
  document.querySelector('.adm-layout').classList.toggle('adm-layout--solo', items.length < 2);
  const first = items[0];
  admNav(admNavName(first), first);
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
  // Пункты «Филиалы», «Типы станков», «Справочники», «Параметры», «Документы» (set_<код>) —
  // одна панель adm-settings, каждый показывает свою её часть (settingsTab, js/admin/settings.js)
  if (name.indexOf('set_') === 0) { settingsTab = name.slice(4); name = 'settings'; }
  const panel = document.getElementById('adm-' + name);
  if (panel) panel.classList.add('active');

  // Подгружаем свежие данные с сервера при переключении раздела
  const loaders = {
    journal: async function () { await Promise.allSettled([jrLoad(), loadClients()]); },   // день филиала; клиенты — для записи по звонку
    bookings: loadBookingsPanel,   // с фильтрами раздела (период, филиал)
    clients: loadClients,
    staff: async function () { await Promise.allSettled([loadStaff(), loadLocationsAll(), loadSpecialists()]); },
    settings: loadLocationsAll,
  };
  if (loaders[name]) await loaders[name]().catch(function () { });

  const renders = {
    journal: renderJournal,
    schedule: renderAdminSchedule,
    bookings: renderAdminBookings,
    clients: renderAdminClients,
    staff: staffOpen,
    settings: renderSettings,
    profile: renderAdmProfile,
  };
  if (renders[name]) renders[name]();
}

