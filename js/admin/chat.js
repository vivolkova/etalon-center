// Админка: чат

// ── CHAT ────────────────────────────────────────────────────────────

function renderChat() {
  const list = document.getElementById('chat-list');
  const clients = Object.keys(chatMessages);
  if (!clients.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-60);font-size:12px">Нет сообщений</div>`;
    return;
  }
  list.innerHTML = clients.map(email => {
    const msgs = chatMessages[email];
    const last = msgs[msgs.length - 1];
    const hasNew = last && last.from === 'client';
    const name = email.split('@')[0].replace('.', ' ');
    return `<div class="chat-item${currentChatClient === email ? ' active' : ''}" onclick="selectChat('${email}')">
  ${hasNew ? `<span class="chat-item-badge">new</span>` : ''}
  <div class="chat-item-name">${name}</div>
  <div class="chat-item-preview">${last ? (last.from === 'admin' ? 'Вы: ' : '') + last.text : ''}</div>
</div>`;
  }).join('');

  if (currentChatClient) renderChatMessages(currentChatClient);
}

function selectChat(email) {
  currentChatClient = email;
  renderChat();
  renderChatMessages(email);
  document.getElementById('chat-input-row').style.display = 'flex';
}

function renderChatMessages(email) {
  const msgs = chatMessages[email] || [];
  const name = email.split('@')[0].replace('.', ' ');
  document.getElementById('chat-header').innerHTML = `
<div style="display:flex;align-items:center;gap:10px">
  <div style="width:32px;height:32px;background:var(--green-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--green);font-size:13px">${name[0].toUpperCase()}</div>
  <div><div style="font-weight:700">${name}</div><div style="font-size:11px;color:var(--ink-60)">${email}</div></div>
</div>`;
  const area = document.getElementById('chat-messages');
  area.innerHTML = msgs.map(m => `
<div class="chat-msg ${m.from}">
  <div>${m.text}</div>
  <div class="chat-msg-meta">${m.time}</div>
</div>`).join('');
  area.scrollTop = area.scrollHeight;
}

function sendChatMsg() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentChatClient) return;
  if (!chatMessages[currentChatClient]) chatMessages[currentChatClient] = [];
  const now = new Date();
  chatMessages[currentChatClient].push({ from: 'admin', text, time: now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') });
  input.value = '';
  renderChatMessages(currentChatClient);
  renderChat();
}

function filterChats(q) {
  document.querySelectorAll('.chat-item').forEach(el => {
    const nameEl = el.querySelector('.chat-item-name');
    const name = nameEl ? nameEl.textContent.toLowerCase() : '';
    el.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
  });
}

function openChatWith(email, name) {
  if (!email) { showToast('Email клиента не указан', 'error'); return; }
  if (!chatMessages[email]) chatMessages[email] = [];
  currentChatClient = email;
  // Switch to chat tab
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.atab-panel').forEach(p => p.classList.remove('active'));
  const chatTab = document.querySelector('.atab[onclick*="chat"]');
  if (chatTab) chatTab.classList.add('active');
  const chatPanel = document.getElementById('atab-chat');
  if (chatPanel) chatPanel.classList.add('active');
  renderChat();
  const chatInputRow = document.getElementById('chat-input-row');
  if (chatInputRow) chatInputRow.style.display = 'flex';
}

