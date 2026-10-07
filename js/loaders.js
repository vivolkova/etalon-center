// Загрузка данных с сервера (специалисты, клиенты, записи)

// ── Загрузка тренеров с сервера ───────────────────────────────
async function loadSpecialists() {
  try {
    const res = await apiRequest('/specialists.php?action=list');
    SPECIALISTS_DATA = (res || []).map(function (t) {
      return {
        id: t.id, name: t.name, full: t.full_name,
        exp: parseInt(t.experience) || 0, sessions: parseInt(t.sessions_count) || 0,
        types: t.types || [],          // коды типов: trainer, bikefitter, mechanic (может быть несколько)
        location_ids: (t.location_ids || []).map(Number),   // филиалы специалиста (справочник «специалист — филиал»)
        active: parseInt(t.active) ? 1 : 0
      };
    });
    fillSpecialistSelects();
  } catch (e) { /* сервер недоступен */ }
}

// Все специалисты, включая неактивных — только для панели «Специалисты» (admin).
// SPECIALISTS_DATA остаётся списком активных для выпадающих списков.
async function loadSpecialistsAll() {
  try {
    const res = await apiRequest('/specialists.php?action=list&all=1');
    SPECIALISTS_ALL = (res || []).map(function (t) {
      return {
        id: t.id, name: t.name, full: t.full_name,
        firstName: t.first_name || '', lastName: t.last_name || '', phone: t.phone || '',
        exp: parseInt(t.experience) || 0, sessions: parseInt(t.sessions_count) || 0,
        types: t.types || [],
        location_ids: (t.location_ids || []).map(Number),   // филиалы специалиста (справочник «специалист — филиал»)
        // актуальные (с сегодняшнего дня) периоды графика и исключения — для карточек
        schedules: t.schedules || [],
        exceptions: t.exceptions || [],
        active: parseInt(t.active) ? 1 : 0
      };
    });
  } catch (e) { /* сервер недоступен */ }
}

// Перезаполнить выпадающие списки специалистов после загрузки данных из БД
function fillSpecialistSelects() {
  var cat = document.getElementById('sm-cat');
  smApplySpecialistFilter(cat ? cat.value : '');
  var libItem = ltsLibId ? [...LIBRARY.trainings, ...LIBRARY.services].find(function (x) { return x.id === ltsLibId; }) : null;
  applySpecialistFilter('lts-specialist', 'lts-specialist-label', libItem ? libItem.cat : '', libItem ? libItem.location_id : null);
}

// Список специалистов по категории активности (значение пункта — id специалиста): тип специалиста берётся из справочника
// (activity_category.ref_id -> specialist_type: training -> trainer, bikefit -> bikefitter,
// workshop -> mechanic). Подпись поля — название типа («Тренер», «Байкфиттер», «Мастер»).
// Если у категории связи нет — поле «Специалист» и все специалисты.
// locId — филиал занятия: только специалисты, работающие в нём по графику, и только если их специализация
// доступна в филиале (Настройки → Справочники). Никого нет — список пустой с пояснением.
function applySpecialistFilter(selectId, labelId, cat, locId) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  var c = ACTIVITY_CATS.find(function (x) { return x.code === cat; });
  var specType = c && c.spec_type;
  var title = specType ? c.spec_name : 'Специалист';
  var list = specType
    ? SPECIALISTS_DATA.filter(function (t) { return t.types.indexOf(specType) >= 0; })
    : SPECIALISTS_DATA;
  if (locId) {
    var typeDict = specType ? SPEC_TYPES.find(function (x) { return x.code === specType; }) : null;
    var typeHere = !typeDict || dictAvailableAt(typeDict.id, locId);
    list = typeHere ? list.filter(function (t) { return t.location_ids.indexOf(Number(locId)) >= 0; }) : [];
  }
  var label = document.getElementById(labelId);
  if (label) label.textContent = title;
  var cur = sel.value;
  sel.innerHTML = '<option value="">' + (list.length ? '— ' + title + ' —' : '— В филиале нет подходящих специалистов —') + '</option>' +
    list.map(function (t) { return '<option value="' + t.id + '">' + t.full + '</option>'; }).join('');
  sel.value = cur;
  if (sel.value !== cur) sel.value = '';
}

// Форма слота в расписании — специалисты филиала слота
function smApplySpecialistFilter(cat) {
  var loc = document.getElementById('sm-location');
  applySpecialistFilter('sm-specialist', 'sm-specialist-label', cat, loc ? parseInt(loc.value) || null : null);
}

// ── Загрузка клиентов с сервера ───────────────────────────────
async function loadClients() {
  try {
    const res = await apiRequest('/clients.php?action=list');
    if (res) {
      CLIENTS = res.map(function (c) {
        return {
          id: parseInt(c.id) || 0, firstName: c.first_name || '', lastName: c.last_name || '', name: c.name, phone: c.phone || '',
          hasAccount: c.has_account == null || Number(c.has_account) === 1,   // false — заведён админом по телефону, входа на сайт нет
          phoneVerified: !!c.phone_verified_at,   // номер подтверждён (администратором, позже — через бота)
          type: c.type || 'new',
          birth: c.birth_date || '', notes: c.notes || '',
          regDate: c.created_at ? c.created_at.slice(0, 10) : '',
          totalBookings: parseInt(c.total_bookings) || 0,
          totalSpent: parseInt(c.total_spent) || 0,
          lastVisit: c.last_visit || ''
        };
      });
    }
  } catch (e) { /* сервер недоступен — список остаётся прежним */ }
}

// ── Загрузка всех записей для администратора ─────────────────
// opts — фильтры раздела «Записи» (период, филиал); без них — окно −7…+30 дней по всем филиалам
async function loadAdminBookings(opts) {
  try {
    const data = await BookingsAPI.all(opts);
    bookings = data.map(function (b) {
      return {
        id: b.id, slotId: b.slot_id, name: b.user_name, phone: b.user_phone || '',
        service: b.slot_name, cat: b.category, type: b.type || null, location_id: b.location_id != null ? Number(b.location_id) : null,
        date: b.slot_date, time: b.start_time ? b.start_time.slice(0, 5) : '',
        specialist: b.specialist_name || '', specialistFull: b.specialist_full || b.specialist_name || '',
        station: b.station_label || '', stationType: b.station_type_name || '',
        price: Number(b.price),
        status: b.status, paymentStatus: b.payment_status,
        clientId: Number(b.user_id)
      };
    });
  } catch (e) {
    // Сервер недоступен — без локального кэша
  }
}

