// API-клиент: ключ сессии, apiRequest, объекты *API для всех эндпоинтов

// ═══════════════════════════════════════════════════════════

const API_BASE = '/api'; // Замените на полный URL если нужно: 'https://ваш-домен.ru/api'

// ── Сессия ─────────────────────────────────────────────────
// Сама сессия — в cookie ec_session (HttpOnly: скриптам страницы недоступна, браузер передаёт её сам).
// Здесь — только ключ сессии: сервер выдаёт его при входе и в ответе «кто вошёл» (auth.php?action=me),
// страница держит его в памяти и передаёт в заголовке X-Session-Key с каждым изменяющим запросом.
const Auth = {
  key: null,
  set(key) { this.key = key || null; },
  clear() { this.key = null; },
  isLoggedIn() { return !!this.key; },
};
// Остатки прежнего входа по токену — убираем из браузера
try {
  localStorage.removeItem('ec_token'); localStorage.removeItem('ec_user');
  document.cookie = 'ec_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
} catch (e) { /* хранилище недоступно */ }

// ── Базовый запрос ─────────────────────────────────────────
// silent — не показывать сообщение об ошибке (вызывающий покажет итог сам, например по нескольким запросам)
async function apiRequest(endpoint, method = 'GET', body = null, silent = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (method !== 'GET' && Auth.key) headers['X-Session-Key'] = Auth.key;

  const opts = { method, headers, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);

  // offline = сервер недоступен (можно откатиться на локальные данные);
  // без флага — сервер осознанно отклонил запрос, подменять результат нельзя
  const fail = function (message, offline) {
    const e = new Error(message);
    e.offline = !!offline;
    if (!silent) showToast(message, 'error');
    throw e;
  };

  let res;
  try {
    res = await fetch(API_BASE + endpoint, opts);
  } catch (e) {
    fail('Ошибка соединения', true);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    fail('Сервер вернул некорректный ответ', true);
  }

  // Сессия закончилась (истёк срок, завершена на другом устройстве или администратором) — возвращаем страницу к виду «не вошёл»
  if (res.status === 401 && Auth.isLoggedIn()) {
    Auth.clear();
    if (typeof logoutLocal === 'function') logoutLocal();
    fail('Сессия завершена — войдите снова', false);
  }
  if (!data.success) fail(data.message || 'Ошибка сервера', false);
  return data.data;
}

// ── AUTH ───────────────────────────────────────────────────
const AuthAPI = {
  async register(data) {   // { first_name, last_name, phone, password }
    const res = await apiRequest('/auth.php?action=register', 'POST', data);
    Auth.set(res.session_key);
    return res.user;
  },
  async login(phone, password) {
    const res = await apiRequest('/auth.php?action=login', 'POST', { phone, password });
    Auth.set(res.session_key);
    return res.user;
  },
  // Завершить сессию на сервере; ключ забываем в любом случае
  async logout() {
    try { await apiRequest('/auth.php?action=logout', 'POST', null, true); } catch (e) { /* сессии уже нет или нет связи */ }
    Auth.clear();
  },
  async logoutAll() {
    await apiRequest('/auth.php?action=logout_all', 'POST');
    Auth.clear();
  },
  // Кто вошёл — по cookie сессии; не вошёл — ошибка без сообщения на экране
  async me() {
    const res = await apiRequest('/auth.php?action=me', 'GET', null, true);
    Auth.set(res.session_key);
    return res.user;
  },
  async update(data) {
    return apiRequest('/auth.php?action=update', 'PUT', data);
  },
};

// ── SLOTS ──────────────────────────────────────────────────
const SlotsAPI = {
  async list(from, to, cat) {
    let url = `/slots.php?action=list&from=${from}&to=${to}`;
    if (cat && cat !== 'all') url += `&cat=${cat}`;
    return apiRequest(url);
  },
  async get(id) {
    return apiRequest(`/slots.php?action=get&id=${id}`);
  },
  async create(data, silent) {
    return apiRequest('/slots.php?action=create', 'POST', data, silent);
  },
  async update(data) {
    return apiRequest('/slots.php?action=update', 'PUT', data);
  },
  async delete(id) {
    return apiRequest(`/slots.php?action=delete&id=${id}`, 'DELETE');
  },
};

// ── LIBRARY (библиотека тренировок/услуг — источник описаний слотов) ──
const LibraryAPI = {
  async list(kind) {   // kind: training | service (по activity_category)
    let url = '/library.php?action=list';
    if (kind) url += `&kind=${kind}`;
    return apiRequest(url);
  },
  async categories() { return apiRequest('/library.php?action=categories'); },
  async listAll() { return apiRequest('/library.php?action=list&all=1'); },
  async get(id) { return apiRequest(`/library.php?action=get&id=${id}`); },
  async create(data) { return apiRequest('/library.php?action=create', 'POST', data); },
  async update(data) { return apiRequest('/library.php?action=update', 'PUT', data); },
  async delete(id) { return apiRequest(`/library.php?action=delete&id=${id}`, 'DELETE'); },
};

// ── BOOKINGS ───────────────────────────────────────────────
// ── ИНДИВИДУАЛЬНАЯ ЗАПИСЬ (персональная / самостоятельная, байкфит) ──
const IndividualAPI = {
  // На что можно записаться в филиале: {items, today, horizon_days, lead_minutes, step}
  async options(locId) {
    return apiRequest(`/individual.php?action=options&location_id=${locId}`);
  },
  // Свободные времена начала: {times: ['10:00', …], message}
  async times(p) {
    let url = `/individual.php?action=times&library_id=${p.library_id}&date=${p.date}&duration=${p.duration}`;
    if (p.specialist_id) url += `&specialist_id=${p.specialist_id}`;
    if (p.user_id) url += `&user_id=${p.user_id}`;   // админ подбирает время клиенту: учесть его записи
    if (p.skip_slot_id) url += `&skip_slot_id=${p.skip_slot_id}`;   // перенос записи: её время не считать занятым
    return apiRequest(url, 'GET', null, true);
  },
  // Схема зала на время занятия: {cols, rows, stations: [{…, state: free|taken}]}
  async stations(p) {
    return apiRequest(`/individual.php?action=stations&library_id=${p.library_id}&date=${p.date}&start=${p.start}&duration=${p.duration}`
      + (p.skip_slot_id ? `&skip_slot_id=${p.skip_slot_id}` : ''), 'GET', null, true);
  },
  // {library_id, specialist_id, date, start, duration, station_id, notes} -> {slot_id, booking_id}
  async create(data) {
    return apiRequest('/individual.php?action=create', 'POST', data);
  },
  // Перенос индивидуальной записи (админ — любой, клиент — своей): {booking_id, date, start, duration, specialist_id, station_id}
  async move(data) {
    return apiRequest('/individual.php?action=move', 'PUT', data);
  },
};

// ── ЖУРНАЛ ЗАПИСИ (админка): день филиала по станкам и специалистам ──
const JournalAPI = {
  async day(locId, date) {
    return apiRequest(`/journal.php?action=day&location_id=${locId}&date=${date}`);
  },
};

const BookingsAPI = {
  async my() {
    return apiRequest('/bookings.php?action=my');
  },
  // opts: { from, to, location_id, status, search } — всё необязательно (по умолчанию −7…+30 дней, все филиалы)
  async all(opts) {
    const q = new URLSearchParams({ action: 'all' });
    Object.entries(opts || {}).forEach(function ([k, v]) { if (v) q.set(k, v); });
    return apiRequest('/bookings.php?' + q.toString());
  },
  async create(slotId, stationId, notes) {
    return apiRequest('/bookings.php?action=create', 'POST', { slot_id: slotId, station_id: stationId, notes: notes || '' });
  },
  // Администратор записывает клиента на групповую тренировку: data = { slot_id, station_id, notes, user_id | new_client: {name, phone} }
  async createFor(data) {
    return apiRequest('/bookings.php?action=create', 'POST', data);
  },
  // Перенос записи на групповую тренировку (админ — любой, клиент — своей): {booking_id, slot_id, station_id} — другой станок или другая тренировка
  async move(data) {
    return apiRequest('/bookings.php?action=move', 'PUT', data);
  },
  async setStatus(id, status) {
    return apiRequest('/bookings.php?action=status', 'PUT', { id, status });
  },
  async setPayment(id, paymentStatus, paymentId) {
    return apiRequest('/bookings.php?action=payment', 'PUT', { id, payment_status: paymentStatus, payment_id: paymentId });
  },
};

// ── STATIONS ───────────────────────────────────────────────
const StationsAPI = {
  async availability(slotId) {
    return apiRequest(`/stations.php?action=availability&slot_id=${slotId}`);
  },
  async listAll(locationId) { return apiRequest(`/stations.php?action=list&all=1&location_id=${locationId}`); },
  async create(data) { return apiRequest('/stations.php?action=create', 'POST', data); },
  async update(data) { return apiRequest('/stations.php?action=update', 'PUT', data); },
  async move(id, pos_x, pos_y) { return apiRequest('/stations.php?action=move', 'PUT', { id, pos_x, pos_y }); },
  async delete(id) { return apiRequest(`/stations.php?action=delete&id=${id}`, 'DELETE'); },
  // Блокировка станка на занятие (slot_station_blocks)
  async block(slot_id, station_id, reason) { return apiRequest('/stations.php?action=block', 'POST', { slot_id, station_id, reason }); },
  async unblock(slotId, stationId) { return apiRequest(`/stations.php?action=unblock&slot_id=${slotId}&station_id=${stationId}`, 'DELETE'); },
  // Типы станков (общие для всех филиалов)
  async types() { return apiRequest('/stations.php?action=types'); },
  async typeCreate(data) { return apiRequest('/stations.php?action=type_create', 'POST', data); },
  async typeUpdate(data) { return apiRequest('/stations.php?action=type_update', 'PUT', data); },
  async typeDelete(id) { return apiRequest(`/stations.php?action=type_delete&id=${id}`, 'DELETE'); },
};

// ── DICTIONARIES (общие справочники + доступность по филиалам) ──
const DictionariesAPI = {
  async list() { return apiRequest('/dictionaries.php?action=list'); },
  async availability() { return apiRequest('/dictionaries.php?action=availability'); },
  async create(data) { return apiRequest('/dictionaries.php?action=create', 'POST', data); },
  async update(data) { return apiRequest('/dictionaries.php?action=update', 'PUT', data); },
};

// ── LOCATIONS ──────────────────────────────────────────────
// Параметры студии (таблица settings)
const SettingsAPI = {
  async list() { return apiRequest('/settings.php?action=list'); },
  async update(values) { return apiRequest('/settings.php?action=update', 'PUT', { values }); },          // { code: value }
};

const LocationsAPI = {
  async list() { return apiRequest('/locations.php?action=list'); },
  async listAll() { return apiRequest('/locations.php?action=list&all=1'); },
  async create(data) { return apiRequest('/locations.php?action=create', 'POST', data); },
  async update(data) { return apiRequest('/locations.php?action=update', 'PUT', data); },
};

// ── CLIENTS ────────────────────────────────────────────────
const ClientsAPI = {
  async list(status, search) {
    let url = '/clients.php?action=list';
    if (status) url += `&status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiRequest(url);
  },
  async get(id) {
    return apiRequest(`/clients.php?action=get&id=${id}`);
  },
  async create(data) {
    return apiRequest('/clients.php?action=create', 'POST', data);
  },
  async update(data) {
    return apiRequest('/clients.php?action=update', 'PUT', data);
  },
  async delete(id) {
    return apiRequest(`/clients.php?action=delete&id=${id}`, 'DELETE');
  },
};

// ── TRAINERS ───────────────────────────────────────────────
const SpecialistsAPI = {
  // Человек с этим телефоном (форма нового специалиста): { id, first_name, last_name, name, specialist_id } или null
  async person(phone) { return apiRequest('/specialists.php?action=person', 'POST', { phone }, true); },
  async create(data) { return apiRequest('/specialists.php?action=create', 'POST', data); },
  async update(data) { return apiRequest('/specialists.php?action=update', 'PUT', data); },
  async delete(id) { return apiRequest(`/specialists.php?action=delete&id=${id}`, 'DELETE'); },
};

// График работы специалиста: периоды (недельные шаблоны) и исключения (отсутствия, особые часы)
const SpecialistHoursAPI = {
  async list(specialistId) { return apiRequest(`/specialist_hours.php?action=list&specialist_id=${specialistId}`); },
  async availability(specialistId, from, to) { return apiRequest(`/specialist_hours.php?action=availability&specialist_id=${specialistId}&from=${from}&to=${to}`); },
  async saveSchedule(data) { return apiRequest('/specialist_hours.php?action=schedule_save', 'POST', data); },
  async deleteSchedule(id) { return apiRequest(`/specialist_hours.php?action=schedule_delete&id=${id}`, 'DELETE'); },
  async saveException(data) { return apiRequest('/specialist_hours.php?action=exception_save', 'POST', data); },
  async deleteException(id) { return apiRequest(`/specialist_hours.php?action=exception_delete&id=${id}`, 'DELETE'); },
};

// ═══ END API CLIENT ════════════════════════════════════════════

