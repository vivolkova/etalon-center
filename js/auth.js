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
  if (mode === 'login') {
    f.innerHTML = `
  <div class="form-field"><label class="form-label">Email</label><input class="form-input" id="a-email" type="email" placeholder="ivan@mail.ru"></div>
  <div class="form-field"><label class="form-label">Пароль</label><input class="form-input" id="a-pass" type="password" placeholder="••••••••"></div>`;
  } else {
    f.innerHTML = `
  <div class="form-row">
    <div class="form-field"><label class="form-label">Имя</label><input class="form-input" id="a-name" type="text" placeholder="Иван Петров"></div>
    <div class="form-field"><label class="form-label">Телефон</label><input class="form-input" id="a-phone" type="tel" placeholder="+7 (___) ___-__-__"></div>
  </div>
  <div class="form-field"><label class="form-label">Email</label><input class="form-input" id="a-email" type="email" placeholder="ivan@mail.ru"></div>
  <div class="form-field"><label class="form-label">Пароль</label><input class="form-input" id="a-pass" type="password" placeholder="Минимум 6 символов"></div>`;
  }
}

async function submitAuth() {
  const email = document.getElementById('a-email')?.value.trim();
  const pass = document.getElementById('a-pass')?.value;
  if (!email || !pass) { showToast('Заполните все поля', 'error'); return; }

  // Показываем индикатор загрузки
  const btn = document.querySelector('.modal-actions .btn-primary');
  if (btn) { btn.textContent = 'Подождите...'; btn.disabled = true; }

  try {
    let user;
    if (authMode === 'login') {
      user = await AuthAPI.login(email, pass);
    } else {
      const name = document.getElementById('a-name')?.value.trim();
      const phone = document.getElementById('a-phone')?.value.trim() || '';
      if (!name) { showToast('Введите ваше имя', 'error'); return; }
      user = await AuthAPI.register(email, pass, name, phone);
    }
    loginUser(user);
  } catch (e) {
    // Сервер ответил отказом (неверный пароль, занятый email) — сообщение уже показано
    if (!e.offline) return;
    // Fallback на localStorage если API недоступен
    if (authMode === 'login') {
      const user = USERS.find(u => u.email === email && u.password === pass);
      if (!user) { showToast('Неверный email или пароль', 'error'); return; }
      loginUser(user);
    } else {
      const name = document.getElementById('a-name')?.value.trim();
      const phone = document.getElementById('a-phone')?.value.trim() || '';
      if (!name) { showToast('Введите ваше имя', 'error'); return; }
      if (USERS.find(u => u.email === email)) { showToast('Этот email уже зарегистрирован', 'error'); return; }
      const newUser = { email, password: pass, name, phone, role: 'client' };
      USERS.push(newUser);
      if (!CLIENTS.find(c => c.email === email)) {
        CLIENTS.push({ email, name, phone, status: 'new', bike: '', birth: '', notes: '', regDate: new Date().toISOString().slice(0, 10) });
      }
      loginUser(newUser);
    }
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
  showToast('Добро пожаловать, ' + user.name.split(' ')[0] + '!', 'success');
  // Загружаем записи с сервера
  await loadMyBookings();
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
        email: currentUser.email,
        service: b.slot_name,
        cat: b.category,
        date: b.slot_date,
        time: b.start_time ? b.start_time.slice(0, 5) : '',
        specialist: b.specialist_name || '',
        price: Number(b.price),
        status: b.status,
        paymentStatus: b.payment_status,
        clientId: currentUser.email,
      };
    });
  } catch (e) {
    // Сервер недоступен — без локального кэша; записи появятся после восстановления связи
  }
}

// Загрузка всех записей для администратора
async function loadAllBookings() {
  try {
    const data = await BookingsAPI.all();
    bookings = data.map(function (b) {
      return {
        id: b.id,
        slotId: b.slot_id,
        name: b.user_name,
        email: b.user_email,
        service: b.slot_name,
        cat: b.category,
        date: b.slot_date,
        time: b.start_time ? b.start_time.slice(0, 5) : '',
        specialist: b.specialist_name || '',
        price: Number(b.price),
        status: b.status,
        paymentStatus: b.payment_status,
        clientId: b.user_email,
      };
    });
  } catch (e) {
    // Сервер недоступен — без локального кэша
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
  showPage('home');
  document.querySelectorAll('.nav-link').forEach((l, i) => l.classList.toggle('active', i === 0));
}

