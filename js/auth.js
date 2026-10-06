// Авторизация, загрузка записей, восстановление сессии

// ═══ AUTH ════════════════════════════════════════════════════════

function openAuth(mode) {
  authMode = mode;
  document.getElementById('auth-modal').classList.add('show');
  switchAuthTab(mode);
}
function closeAuth() {
  document.getElementById('auth-modal').classList.remove('show');
}
function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-title').textContent = mode === 'login' ? 'Вход в аккаунт' : 'Регистрация';
  const f = document.getElementById('auth-fields');
  // Логин — номер телефона (маску и проверку номера ставит js/ui.js по классу phone-input)
  if (mode === 'login') {
    f.innerHTML = `
  <div class="form-field"><label class="form-label">Телефон</label><input class="form-input phone-input" id="a-phone" required autocomplete="username"></div>
  <div class="form-field"><label class="form-label">Пароль</label>${passFieldHtml('a-pass', 'current-password')}</div>
  <a class="u-text-small u-brand" href="#" onclick="forgotPassword();return false">Забыли пароль?</a>`;
  } else {
    f.innerHTML = `
  <div class="form-row">
    <div class="form-field"><label class="form-label">Имя</label><input class="form-input" id="a-first" type="text" required autocomplete="given-name"></div>
    <div class="form-field"><label class="form-label">Фамилия</label><input class="form-input" id="a-last" type="text" required autocomplete="family-name"></div>
  </div>
  <div class="form-field"><label class="form-label">Телефон</label><input class="form-input phone-input" id="a-phone" required autocomplete="username"></div>
  <div class="form-field"><label class="form-label">Пароль</label>${passFieldHtml('a-pass', 'new-password', 8)}<div class="set-hint">Не короче 8 символов</div></div>
  ${consentChecksHtml('a')}`;
  }
}

async function submitAuth() {
  const phone = document.getElementById('a-phone')?.value.trim();
  const pass = document.getElementById('a-pass')?.value;
  if (!phone || !pass) { showToast('Заполните все поля', 'error'); return; }

  // Показываем индикатор загрузки
  const btn = document.querySelector('.modal-actions .btn-primary');
  if (btn) { btn.textContent = 'Подождите...'; btn.disabled = true; }

  try {
    let user;
    if (authMode === 'login') {
      user = await AuthAPI.login(phone, pass);
    } else {
      const first = document.getElementById('a-first')?.value.trim();
      const last = document.getElementById('a-last')?.value.trim();
      if (!first || !last) { showToast('Укажите имя и фамилию', 'error'); return; }
      const agree = consentChecksRead('a');
      if (!agree.agree_offer || !agree.agree_pd) { showToast('Отметьте согласие с офертой, правилами студии и обработкой персональных данных', 'error'); return; }
      user = await AuthAPI.register(Object.assign({ first_name: first, last_name: last, phone: phone, password: pass }, agree));
    }
    loginUser(user);
  } catch (e) {
    // Отказ сервера или нет связи — сообщение уже показано (apiRequest)
  } finally {
    if (btn) { btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться'; btn.disabled = false; }
  }
}

// Три галочки согласий (регистрация, создание кабинета по ссылке). Первые две обязательны, третья — добровольная.
// Ссылки открывают документ в новой вкладке — форма не теряется. prefix — приставка id полей
function consentChecksHtml(prefix) {
  const doc = function (code, text) { return '<a href="#doc/' + code + '" target="_blank" rel="noopener">' + text + '</a>'; };
  const row = function (id, required, html) {
    return '<label class="check-label check-label--text u-mt-10"><input type="checkbox" id="' + prefix + '-' + id + '"' + (required ? ' required' : '') + '><span>' + html + '</span></label>';
  };
  return row('agree-offer', true, 'Я ознакомлен(а) и согласен(а) с условиями ' + doc('offer', 'Публичной оферты') + ' и ' + doc('rules', 'Правилами студии'))
    + row('agree-pd', true, 'Я даю ' + doc('pd_consent', 'согласие на обработку персональных данных') + ' в соответствии с ' + doc('privacy', 'Политикой обработки персональных данных'))
    + row('agree-photo', false, 'Я ' + doc('photo_consent', 'согласен(а) на использование фото- и видеоматериалов') + ' с моим изображением в социальных сетях и рекламных материалах ETALON CENTER');
}
function consentChecksRead(prefix) {
  const on = function (id) { const el = document.getElementById(prefix + '-' + id); return !!(el && el.checked); };
  return { agree_offer: on('agree-offer'), agree_pd: on('agree-pd'), agree_photo: on('agree-photo') };
}

// «Забыли пароль?» — пока восстановление только через администратора: он присылает ссылку для смены пароля
function forgotPassword() {
  const loc = (typeof LOCATIONS !== 'undefined' && LOCATIONS[0]) || null;
  uiInfo('Забыли пароль?', 'Чтобы сменить пароль, обратитесь к администратору студии' + (loc && loc.phone ? ': ' + loc.phone : '') + '. Он пришлёт ссылку для смены пароля.');
}

// Вышла новая редакция обязательного документа (или клиент ещё не принимал документы): окно со списком и галочкой.
// Пока не принято, клиент может смотреть сайт и свои записи, но новые записи сервер не создаёт. Закрыть окно нельзя —
// только «Принять» или «Выйти»
function showPendingDocs() {
  const docs = (currentUser && currentUser.pending_docs) || [];
  const old = document.getElementById('docs-modal'); if (old) old.remove();
  if (!docs.length) return;
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'docs-modal';
  el.innerHTML = '<div class="admin-modal u-max-w-460">'
    + '<div class="admin-modal-title u-mb-8">Мы обновили документы</div>'
    + '<div class="u-text-body u-muted u-mb-12">Чтобы записываться на занятия, ознакомьтесь с документами и примите их.</div>'
    + docs.map(function (d) {
      return '<div class="u-text-body u-mb-6">• <a class="u-brand" href="#doc/' + d.code + '" target="_blank" rel="noopener">' + escAttr(d.name) + '</a> — редакция ' + d.version + '</div>';
    }).join('')
    + '<label class="check-label check-label--text u-mt-12"><input type="checkbox" id="docs-agree" required><span>Я ознакомлен(а) и согласен(а)</span></label>'
    + '<div class="admin-modal-actions"><button class="btn-ghost" id="docs-exit">Выйти</button>'
    + '<button class="btn-primary" id="docs-accept">Принять</button></div></div>';
  document.body.appendChild(el);
  document.getElementById('docs-exit').onclick = function () { el.remove(); logout(); };
  document.getElementById('docs-accept').onclick = async function () {
    if (!document.getElementById('docs-agree').checked) { showToast('Отметьте согласие', 'error'); return; }
    let res;
    try { res = await DocumentsAPI.accept(docs.map(function (d) { return d.code; })); } catch (e) { return; }
    currentUser.pending_docs = res.pending_docs || [];
    el.remove();
    showToast('Документы приняты', 'success');
  };
}

// Кнопка с именем вошедшего: «Имя · Выйти». Филиал администратора — рядом, в переключателе #adm-branch
function renderUserButton() {
  if (!currentUser) return;
  document.getElementById('btn-logout').textContent = currentUser.name.split(' ')[0] + ' · Выйти';
}

// quiet — без приветствия (сессия восстановлена после обновления страницы)
async function loginUser(user, quiet) {
  currentUser = user;
  closeAuth();
  document.getElementById('btn-login').style.display = 'none';
  document.getElementById('btn-signup').style.display = 'none';
  document.getElementById('btn-logout').style.display = '';
  renderUserButton();
  if (user.role !== 'admin') document.getElementById('nav-client').style.display = '';
  admMenuApply();   // администратору — группы панели в шапке и разделы по правам
  admBranchInit();
  showPendingDocs();
  // Сайт (главная, запись на тренировки и услуги) администратору не нужен — он работает в панели и сразу попадает в неё
  document.querySelectorAll('.nav-client-only').forEach(function (l) { l.style.display = user.role === 'admin' ? 'none' : ''; });
  if (user.role === 'admin') admGroup('work');
  admBootMark(user.role === 'admin');
  if (!quiet) showToast('Добро пожаловать, ' + user.name.split(' ')[0] + '!', 'success');
  // Загружаем записи с сервера; слоты — заново (свежие счётчики мест)
  await Promise.allSettled([loadMyBookings(), loadSlots()]);
  renderSitePages();
}

// ── Загрузка записей ─────────────────────────────────────────
async function loadMyBookings() {
  if (!currentUser) return;
  try {
    const data = await BookingsAPI.my();
    // Нормализуем формат для совместимости с текущим кодом
    bookings = data.map(function (b) {
      return {
        id: b.id,
        slotId: b.slot_id,
        name: currentUser.name,
        service: b.slot_name,
        cat: b.category,
        type: b.type || null,
        date: b.slot_date,
        time: b.start_time ? b.start_time.slice(0, 5) : '',
        dur: Number(b.duration),
        specialist: b.specialist_name || '',
        // для переноса записи клиентом (js/client/panel.js cpMoveBooking)
        individual: Number(b.auto_created) === 1,
        libraryId: b.library_id != null ? Number(b.library_id) : null,
        specialistId: b.specialist_id != null ? Number(b.specialist_id) : null,
        stationId: b.station_id != null ? Number(b.station_id) : null,
        station: b.station_label || '',
        stationIcon: b.station_icon || '',   // значок типа станка — для карточки записи (js/site/trainings.js)
        location_id: b.location_id != null ? Number(b.location_id) : null,
        price: Number(b.price),
        status: b.status,
        paymentStatus: b.payment_status,
        clientId: currentUser.id,
      };
    });
  } catch (e) {
    // Сервер недоступен — без локального кэша; записи появятся после восстановления связи
  }
}

// Загрузка слотов с сервера
function parseLocalDate(str) {
  // Парсим YYYY-MM-DD как локальное время (не UTC)
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtLocalDate(d) {
  // Форматируем в YYYY-MM-DD по локальному времени: toISOString сдвигает дату на день назад
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function loadSlots(fromDate, toDate) {
  try {
    const fmt = fmtLocalDate;
    const from = fromDate || new Date();
    const to = toDate || (function () { const d = new Date(); d.setDate(d.getDate() + 60); return d; })();
    const data = await SlotsAPI.list(fmt(from), fmt(to));
    // Удаляем из локального массива слоты этого диапазона (они перезагрузятся актуальными)
    const fromTime = from.getTime(), toTime = to.getTime();
    for (let i = SLOTS.length - 1; i >= 0; i--) {
      const t = SLOTS[i].date ? SLOTS[i].date.getTime() : 0;
      if (t >= fromTime && t <= toTime) SLOTS.splice(i, 1);
    }
    data.forEach(function (s) {
      const slotDate = parseLocalDate(s.slot_date);
      SLOTS.push({
        id: s.id,
        date: slotDate,
        dayOfWeek: (slotDate.getDay() + 6) % 7,
        time: s.start_time ? s.start_time.slice(0, 5) : s.start_time,
        dur: parseInt(s.duration),
        name: s.name,
        cat: s.category,
        type: s.type || null,   // slot_type записи библиотеки: group / personal / free; у услуг null
        specialist: s.specialist_name || '',
        specialist_id: s.specialist_id || null,
        price: Number(s.price),
        max: parseInt(s.max_people),
        taken: parseInt(s.taken),
        blocked: parseInt(s.blocked) || 0,   // заблокированные на занятие станки
        location_id: s.location_id || null,
        description: s.summary || '',
        features: s.details || null,
        library_id: s.library_id || null,
      });
    });
    const sm = data.find(s => s.max_people != null);
    if (sm) HALL_CAP = parseInt(sm.max_people);
  } catch (e) {
    // Используем существующие слоты
  }
}

// ── Восстановление сессии при загрузке страницы ──────────────
// Сессия живёт в cookie: спрашиваем сервер, кто вошёл. Не вошёл — остаёмся в виде «не вошёл»
async function restoreSession() {
  let user;
  try { user = await AuthAPI.me(); } catch (e) { admBootMark(false); return; }
  await loginUser(user, true);
}

// Чтобы при обновлении страницы у администратора не мелькала главная страница сайта: в браузере запоминается
// только отметка «здесь работал администратор». По ней скрипт в начале index.html прячет страницу (класс adm-boot,
// css/admin.css), пока сервер не ответит, кто вошёл. Прав отметка не даёт: их проверяет сервер
const ADM_BOOT_KEY = 'etalon.admin';
function admBootMark(isAdmin) {
  try {
    if (isAdmin) localStorage.setItem(ADM_BOOT_KEY, '1');
    else localStorage.removeItem(ADM_BOOT_KEY);
  } catch (e) { /* хранилище недоступно — главная мелькнёт, как раньше */ }
  document.documentElement.classList.remove('adm-boot');
}

// Выход: завершаем сессию на сервере и возвращаем страницу к виду «не вошёл»
async function logout() {
  await AuthAPI.logout();
  logoutLocal();
}

// Вид «не вошёл» (выход или сессия закончилась)
function logoutLocal() {
  currentUser = null;
  admBootMark(false);
  admBranchInit();
  showPendingDocs();   // окно «Мы обновили документы» закрывается вместе с сессией
  bookings = [];
  document.getElementById('btn-login').style.display = '';
  document.getElementById('btn-signup').style.display = '';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('nav-client').style.display = 'none';
  admMenuApply();
  document.querySelectorAll('.nav-client-only').forEach(function (l) { l.style.display = ''; });
  renderSitePages();
  showPage('home');
  document.querySelectorAll('.nav-link').forEach((l, i) => l.classList.toggle('active', i === 0));
}

