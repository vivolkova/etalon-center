// Админка: демо-данные и навигация по разделам

// ═══ ADMIN DATA ══════════════════════════════════════════════════════

let SPECIALISTS_DATA = [];   // активные (для выпадающих списков)
let SPECIALISTS_ALL = [];    // все, включая неактивных (панель «Специалисты»)

let SUB_PLANS = [];

let SUB_SALES = [
  { client: 'Иван Петров', email: 'ivan@mail.ru', plan: 'Безлимит', bought: '01.05.2026', expires: '31.05.2026', left: 999, active: true },
  { client: 'Мария Сидорова', email: 'maria@mail.ru', plan: 'Продвинутый', bought: '15.05.2026', expires: '29.06.2026', left: 8, active: true },
  { client: 'Пётр Козлов', email: 'pete@sport.ru', plan: 'Базовый', bought: '20.04.2026', expires: '20.05.2026', left: 0, active: false },
];

let WAITLIST = [
  { id: 1, client: 'Анна Волкова', email: 'anna@gmail.com', slot: 'Интервальный сайкл', date: 'Сегодня 17:00', added: '06.06.2026' },
  { id: 2, client: 'Дмитрий Орлов', email: 'dmitry@yandex.ru', slot: 'Утренний сайкл', date: 'Завтра 07:00', added: '06.06.2026' },
  { id: 3, client: 'Елена Новикова', email: 'elena@sport.ru', slot: 'Endurance Ride', date: 'Среда 09:30', added: '05.06.2026' },
];

let PROMOS = [];

let MAILING_HISTORY = [
  { subject: 'Новое расписание на июнь', audience: 'Все клиенты', sent: '01.06.2026', count: 47 },
  { subject: 'Летняя акция — скидка 20%', audience: 'Активные', sent: '25.05.2026', count: 32 },
  { subject: 'Напоминание о записи', audience: 'VIP', sent: '20.05.2026', count: 8 },
];

// ═══ ADMIN NAVIGATION ════════════════════════════════════════════════

async function admNav(name, el) {
  document.querySelectorAll('.adm-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  const panel = document.getElementById('adm-' + name);
  if (panel) panel.classList.add('active');

  // Подгружаем свежие данные с сервера при переключении раздела
  const loaders = {
    journal: async function () { await Promise.allSettled([jrLoad(), loadClients()]); },   // день филиала; клиенты — для записи по звонку
    bookings: loadBookingsPanel,   // с фильтрами раздела (период, филиал)
    clients: loadClients,
    subscriptions: loadSubPlans,
    specialists: async function () { await Promise.allSettled([loadSpecialists(), loadSpecialistsAll(), loadLocationsAll(), loadDictValues(), loadDictAvailability()]); },
    promos: loadPromos,
    notif: loadNotifications,
    chat: loadChatDialogs,
    library: async function () { await Promise.allSettled([loadLibraryAll(), loadActivityCats(), loadDictAvailability(), loadDictValues()]); },
    settings: loadLocationsAll,
    finance: loadAdminBookings,
    dashboard: async function () { await Promise.allSettled([loadAdminBookings(), loadClients(), loadNotifications()]); },
  };
  if (loaders[name]) await loaders[name]().catch(function () { });

  const renders = {
    dashboard: renderDashboard,
    analytics: renderAnalytics,
    journal: renderJournal,
    schedule: renderAdminSchedule,
    specialists: renderSpecialists,
    library: renderLibrary,
    bookings: renderAdminBookings,
    clients: renderAdminClients,
    subscriptions: renderSubscriptions,
    waitlist: renderWaitlist,
    finance: renderFinance,
    promos: renderPromos,
    chat: renderChat,
    notif: renderNotifications,
    mailing: renderMailing,
    settings: renderSettings,
  };
  if (renders[name]) renders[name]();
}

