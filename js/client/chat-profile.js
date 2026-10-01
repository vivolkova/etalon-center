// Кабинет клиента: чат и профиль

// ── CLIENT CHAT ───────────────────────────────────────────────────
function renderClientChat() {
  const email = currentUser?.email;
  if (!email) return;
  if (!chatMessages[email]) chatMessages[email] = [];
  const msgs = chatMessages[email];
  const area = document.getElementById('client-chat-msgs');
  area.innerHTML = msgs.length
    ? msgs.map(m => `<div class="chat-msg ${m.from === 'admin' ? 'client' : 'admin'}">
    <div>${m.text}</div>
    <div class="chat-msg-meta">${m.from === 'admin' ? 'Администратор · ' : 'Вы · '}${m.time}</div>
  </div>`).join('')
    : `<div style="text-align:center;padding:40px;color:var(--ink-60);font-size:13px">Напишите нам — ответим в течение дня </div>`;
  area.scrollTop = area.scrollHeight;
  // Clear badge
  document.getElementById('client-chat-badge').style.display = 'none';
}

function clientSendMsg() {
  const input = document.getElementById('client-chat-input');
  const text = input.value.trim();
  if (!text || !currentUser) return;
  const email = currentUser.email;
  if (!chatMessages[email]) chatMessages[email] = [];
  const now = new Date();
  const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  chatMessages[email].push({ from: 'client', text, time });
  input.value = '';
  renderClientChat();
  // Auto-reply simulation
  setTimeout(() => {
    chatMessages[email].push({ from: 'admin', text: 'Спасибо за сообщение! Мы ответим в ближайшее время. Если вопрос срочный — звоните: +7 495 000-00-00', time: (new Date().getHours()) + ':' + String(new Date().getMinutes()).padStart(2, '0') });
    if (currentUser) renderClientChat();
    // Also update admin chat
    if (typeof renderChat === 'function') renderChat();
  }, 1500);
}

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



