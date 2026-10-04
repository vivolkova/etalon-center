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
  <div class="form-field"><label class="form-label">Пароль</label><input class="form-input" id="a-pass" type="password" required autocomplete="current-password"></div>`;
  } else {
    f.innerHTML = `
  <div class="form-row">
    <div class="form-field"><label class="form-label">Имя</label><input class="form-input" id="a-first" type="text" required autocomplete="given-name"></div>
    <div class="form-field"><label class="form-label">Фамилия</label><input class="form-input" id="a-last" type="text" required autocomplete="family-name"></div>
  </div>
  <div class="form-field"><label class="form-label">Телефон</label><input class="form-input phone-input" id="a-phone" required autocomplete="username"></div>
  <div class="form-field"><label class="form-label">Пароль</label><input class="form-input" id="a-pass" type="password" required minlength="8" autocomplete="new-password"><div class="set-hint">Не короче 8 символов</div></div>`;
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
      user = await AuthAPI.register({ first_name: first, last_name: last, phone: phone, password: pass });
    }
    loginUser(user);
  } catch (e) {
    // Отказ сервера или нет связи — сообщение уже показано (apiRequest)
  } finally {
    if (btn) { btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться'; btn.disabled = false; }
  }
}

async function loginUser(user) {
  currentUser = user;
  // Сохраняем пользователя для восстановления после обновления страницы
  localStorage.setItem('ec_user', JSON.stringify(user));
  closeAuth();
  document.getElementById('btn-login').style.display = 'none';
  document.getElementById('btn-signup').style.display = 'none';
  document.getElementById('btn-logout').style.display = '';
  document.getElementById('btn-logout').textContent = user.name.split(' ')[0] + ' · Выйти';
  if (user.role !== 'admin') document.getElementById('nav-client').style.display = '';
  if (user.role === 'admin') document.getElementById('nav-admin').style.display = '';
  // Клиентские разделы (запись на тренировки и услуги) администратору не нужны — он работает в панели (журнал записи)
  document.querySelectorAll('.nav-client-only').forEach(function (l) { l.style.display = user.role === 'admin' ? 'none' : ''; });
  showToast('Добро пожаловать, ' + user.name.split(' ')[0] + '!', 'success');
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
async function restoreSession() {
  // Сначала пробуем восстановить через токен
  if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
    try {
      const user = await AuthAPI.me(); // Проверяем токен на сервере
      localStorage.setItem('ec_user', JSON.stringify(user));
      await loginUser(user);
      return;
    } catch (e) {
      // Токен чистим только если сервер его отклонил, а не при обрыве связи
      if (!e.offline) {
        Auth.removeToken();
        localStorage.removeItem('ec_user');
      }
    }
  }
  // Токена нет — показываем как незалогиненного
  // (не восстанавливаем из ec_user без токена — иначе 401 на все запросы)
}

function logout() {
  if (typeof AuthAPI !== 'undefined') AuthAPI.logout();
  localStorage.removeItem('ec_user');
  currentUser = null;
  bookings = [];
  document.getElementById('btn-login').style.display = '';
  document.getElementById('btn-signup').style.display = '';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('nav-client').style.display = 'none';
  document.getElementById('nav-admin').style.display = 'none';
  document.querySelectorAll('.nav-client-only').forEach(function (l) { l.style.display = ''; });
  renderSitePages();
  showPage('home');
  document.querySelectorAll('.nav-link').forEach((l, i) => l.classList.toggle('active', i === 0));
}

