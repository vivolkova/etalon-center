// Кабинет клиента: профиль

// ── PROFILE ───────────────────────────────────────────────────────
function renderProfileForm() {
  if (!currentUser) return;
  const av = clientAvatarColor(currentUser.name);
  const init = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarEl = document.getElementById('profile-avatar-big');
  avatarEl.style.background = av + '20'; avatarEl.style.color = av; avatarEl.textContent = init;
  document.getElementById('profile-display-name').textContent = currentUser.name;
  document.getElementById('profile-display-phone').textContent = currentUser.phone || '';
  const myB = bookings.filter(b => b.clientId === currentUser.id && b.status !== 'cancelled');
  const spent = myB.reduce((s, b) => s + b.price, 0);
  document.getElementById('profile-stats-line').textContent = myB.length + ' записей · ' + spent.toLocaleString('ru') + ' ₽ потрачено';
  document.getElementById('pf-first-name').value = currentUser.first_name || '';
  document.getElementById('pf-last-name').value = currentUser.last_name || '';
  document.getElementById('pf-phone').value = currentUser.phone || '';   // телефон — логин: меняет только администратор
  document.getElementById('pf-birth').value = currentUser.birth_date || '';
  document.getElementById('pf-notes').value = currentUser.notes || '';
  document.getElementById('profile-saved-msg').style.display = 'none';
  // поля пароля — пустые при каждом открытии профиля
  passCardFill('pf-pass-card', 'pf');
  renderProfileConsents();
}

// ── СОГЛАСИЯ ──────────────────────────────────────────────────────
// Обязательные документы — что принято и когда; добровольное согласие (фото и видео) — галочка: дать или отозвать
async function renderProfileConsents(list) {
  const box = document.getElementById('pf-consents');
  if (!box) return;
  if (!list) { try { list = await DocumentsAPI.my(); } catch (e) { return; } }
  box.innerHTML = list.map(function (c) {
    const link = '<a class="u-brand" href="#doc/' + c.code + '" target="_blank" rel="noopener">' + escAttr(c.name) + '</a>';
    const when = c.accepted_at ? 'редакция ' + c.accepted_version + ', ' + docDate(c.accepted_at) + (c.source === 'admin' ? ' (на бумаге)' : '') : 'нет';
    if (c.acceptance === 'optional') {
      return '<label class="check-label check-label--text u-mt-12"><input type="checkbox" data-consent="' + c.code + '"' + (c.accepted_at ? ' checked' : '') +
        ' onchange="toggleConsent(this)"><span>' + link + (c.accepted_at ? ' — дано: ' + when : ' — не дано') + '</span></label>';
    }
    return '<div class="u-text-body u-mb-6">' + link + ' — <span class="u-muted">' + (c.accepted_at ? 'принято: ' + when : 'не принято') + '</span></div>';
  }).join('');
}

async function toggleConsent(input) {
  const code = input.getAttribute('data-consent');
  let res;
  try { res = input.checked ? await DocumentsAPI.accept([code]) : await DocumentsAPI.revoke(code); }
  catch (e) { input.checked = !input.checked; return; }   // отказ сервера — сообщение уже показано, возвращаем галочку
  showToast(input.checked ? 'Согласие дано' : 'Согласие отозвано', 'success');
  renderProfileConsents(res.consents);
}

// ── ПАРОЛЬ И СЕССИИ ───────────────────────────────────────────────
// Блок «Пароль» — один для кабинета клиента и панели администратора; prefix различает поля на странице
function passCardFill(boxId, prefix) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.innerHTML = '<div class="cp-section-title">Пароль</div>'
    + '<div class="form-field"><label class="form-label">Текущий пароль</label>' + passFieldHtml(prefix + '-pass-cur', 'current-password') + '</div>'
    + '<div class="form-field"><label class="form-label">Новый пароль</label>' + passFieldHtml(prefix + '-pass-new', 'new-password', 8)
    + '<div class="set-hint">Не короче 8 символов. После смены пароля на других устройствах нужно будет войти заново</div></div>'
    + '<div class="u-mt-16 u-flex u-gap-10 u-wrap">'
    + '<button class="btn-primary" onclick="changePassword(\'' + boxId + '\',\'' + prefix + '\')">Сменить пароль</button>'
    + '<button class="btn-ghost" onclick="logoutEverywhere()">Выйти на всех устройствах</button></div>';
}

// Профиль администратора (раздел «Профиль» панели): поля пароля — пустые при каждом открытии
function renderAdmProfile() {
  passCardFill('adm-pass-card', 'ap');
}

async function changePassword(boxId, prefix) {
  const cur = document.getElementById(prefix + '-pass-cur').value;
  const next = document.getElementById(prefix + '-pass-new').value;
  if (!cur || !next) { showToast('Введите текущий и новый пароль', 'error'); return; }
  try { await AuthAPI.password(cur, next); } catch (e) { return; }
  showToast('Пароль изменён', 'success');
  passCardFill(boxId, prefix);
}

async function logoutEverywhere() {
  if (!await uiConfirm('Выйти на всех устройствах?', 'Вход понадобится заново на каждом устройстве, включая это.')) return;
  try { await AuthAPI.logoutAll(); } catch (e) { return; }
  logoutLocal();
}

async function saveProfile() {
  const first = document.getElementById('pf-first-name').value.trim();
  const last = document.getElementById('pf-last-name').value.trim();
  if (!first || !last) { showToast('Введите имя и фамилию', 'error'); return; }

  let user;
  try {
    user = await AuthAPI.update({
      first_name: first, last_name: last,
      birth_date: document.getElementById('pf-birth').value || null,
      notes: document.getElementById('pf-notes').value.trim(),
    });
  } catch (e) {
    return;  // отказ сервера или нет связи — сообщение уже показано (apiRequest)
  }

  // Профиль — в том виде, в каком его сохранил сервер
  currentUser = user;
  renderUserButton();
  renderClientPanel();
  renderProfileForm();
  const msg = document.getElementById('profile-saved-msg');
  if (msg) { msg.style.display = ''; setTimeout(() => msg.style.display = 'none', 3000); }
  showToast('Профиль обновлён', 'success');
}
