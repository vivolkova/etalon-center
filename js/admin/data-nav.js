// Админка: данные специалистов и навигация по разделам

// ═══ ADMIN DATA ══════════════════════════════════════════════════════

let SPECIALISTS_DATA = [];   // активные (для выпадающих списков)
let SPECIALISTS_ALL = [];    // все, включая неактивных (панель «Специалисты»)

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

