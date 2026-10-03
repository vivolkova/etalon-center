// Кабинет клиента: профиль

// ── PROFILE ───────────────────────────────────────────────────────
function renderProfileForm() {
  if (!currentUser) return;
  const cData = CLIENTS.find(c => c.email === currentUser.email) || {};
  const av = clientAvatarColor(currentUser.name);
  const init = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarEl = document.getElementById('profile-avatar-big');
  avatarEl.style.background = av + '20'; avatarEl.style.color = av; avatarEl.textContent = init;
  document.getElementById('profile-display-name').textContent = currentUser.name;
  document.getElementById('profile-display-email').textContent = currentUser.email;
  const myB = bookings.filter(b => b.clientId === currentUser.email && b.status !== 'cancelled');
  const spent = myB.reduce((s, b) => s + b.price, 0);
  document.getElementById('profile-stats-line').textContent = myB.length + ' записей · ' + spent.toLocaleString('ru') + ' ₽ потрачено';
  document.getElementById('pf-name').value = currentUser.name;
  document.getElementById('pf-phone').value = maskPhone(currentUser.phone || cData.phone || '');   // единый вид +7 (XXX) XXX-XX-XX
  document.getElementById('pf-email').value = currentUser.email;
  document.getElementById('pf-birth').value = cData.birth || '';
  document.getElementById('pf-bike').value = cData.bike || '';
  document.getElementById('pf-notes').value = cData.notes || '';
  document.getElementById('profile-saved-msg').style.display = 'none';
}

async function saveProfile() {
  const name = document.getElementById('pf-name').value.trim();
  const phone = document.getElementById('pf-phone').value.trim();
  if (!name) { showToast('Введите имя', 'error'); return; }

  try {
    await AuthAPI.update({
      name, phone,
      birth_date: document.getElementById('pf-birth').value || null,
      bike: document.getElementById('pf-bike').value,
      notes: document.getElementById('pf-notes').value.trim(),
    });
  } catch (e) {
    if (!e.offline) return;  // сервер отклонил обновление — локально тоже не меняем
  }

  // Обновляем локальные данные в любом случае
  currentUser.name = name; currentUser.phone = phone;
  const u = USERS.find(x => x.email === currentUser.email);
  if (u) { u.name = name; u.phone = phone; }
  const c = CLIENTS.find(x => x.email === currentUser.email);
  if (c) {
    c.name = name; c.phone = phone;
    c.birth = document.getElementById('pf-birth').value;
    c.bike = document.getElementById('pf-bike').value;
    c.notes = document.getElementById('pf-notes').value.trim();
  }
  document.getElementById('btn-logout').textContent = name.split(' ')[0] + ' · Выйти';
  renderClientPanel();
  renderProfileForm();
  const msg = document.getElementById('profile-saved-msg');
  if (msg) { msg.style.display = ''; setTimeout(() => msg.style.display = 'none', 3000); }
  showToast('Профиль обновлён', 'success');
}



