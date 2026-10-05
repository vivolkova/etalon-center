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
