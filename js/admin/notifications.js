// Админка: уведомления

// ── NOTIFICATIONS ────────────────────────────────────────────────────

function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!notifications.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--ink-60)">Уведомлений нет</div>`;
    return;
  }
  const typeClass = { booking: 'unread', cancel: 'unread', announce: 'announce', info: '', promo: 'announce' };
  list.innerHTML = notifications.map(n => `
<div class="notif-card ${n.read ? '' : typeClass[n.type] || 'unread'}">
  <div class="notif-icon" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--surface);border-radius:8px;flex-shrink:0">${n.icon}</div>
  <div class="notif-body">
    <div class="notif-title">${n.title}</div>
    <div class="notif-text">${n.text}</div>
    <div class="notif-time">${n.time}</div>
    <div class="notif-actions">
      ${!n.read ? `<button class="action-btn confirm" style="font-size:11px;padding:4px 10px" onclick="markRead(${n.id})">Прочитано</button>` : ''}
      <button class="action-btn cancel" style="font-size:11px;padding:4px 10px" onclick="deleteNotif(${n.id})">Уд.</button>
    </div>
  </div>
</div>`).join('');
}

async function markRead(id) {
  try { await apiRequest('/notifications.php?action=read', 'PUT', { id }); } catch (e) { }
  const n = notifications.find(x => x.id === id);
  if (n) { n.read = true; renderNotifications(); renderAdmin(); }
}
async function deleteNotif(id) {
  try { await apiRequest('/notifications.php?action=delete&id=' + id, 'DELETE'); } catch (e) { }
  notifications = notifications.filter(x => x.id !== id);
  renderNotifications(); renderAdmin();
}

function openAnnounceModal() { document.getElementById('announce-modal').classList.add('show'); }

async function publishAnnounce() {
  const title = document.getElementById('ann-title').value.trim();
  const text = document.getElementById('ann-text').value.trim();
  if (!title || !text) { showToast('Заполните заголовок и текст', 'error'); return; }
  const t = document.getElementById('ann-type').value;
  try {
    await apiRequest('/notifications.php?action=create', 'POST', { type: t, title, message: text });
    await loadNotifications();
  } catch (e) {
    const typeMap = { announce: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>`, info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`, promo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>` };
    notifications.unshift({ id: Date.now(), type: t, icon: typeMap[t] || '', title, text, time: 'только что', read: false });
  }
  document.getElementById('announce-modal').classList.remove('show');
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-text').value = '';
  showToast('Анонс опубликован', 'success');
  renderNotifications(); renderAdmin();
}

