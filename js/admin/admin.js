// Админка: клиенты

// ═══ ADMIN ════════════════════════════════════════════════════════

// ── CLIENTS ──────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#00BAB3', '#4e42b5', '#c07a10', '#059669', '#dc2626', '#7c3aed', '#0284c7'];

function clientAvatarColor(name) {
  let h = 0; for (let c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getClientStats(id) {
  const cb = bookings.filter(b => b.clientId === id && b.status !== 'cancelled');
  const total = cb.length;
  const spent = cb.reduce((s, b) => s + b.price, 0);
  const last = cb.length ? new Date(Math.max(...cb.map(b => new Date(b.date)))) : null;
  return { total, spent, last };
}

function renderAdminClients(list) {
  const rows = list || CLIENTS;

  // Stats bar
  const statsEl = document.getElementById('clients-stats');
  const total = CLIENTS.length;
  const vips = CLIENTS.filter(c => c.type === 'vip').length;
  const newOnes = CLIENTS.filter(c => c.type === 'new').length;
  const totalRevenue = CLIENTS.reduce((s, c) => s + getClientStats(c.id).spent, 0);
  statsEl.innerHTML = [
    { val: total, label: 'Всего клиентов', color: 'var(--green)' },
    { val: vips, label: 'VIP', color: '#c07a10' },
    { val: newOnes, label: 'Новых', color: '#0284c7' },
    { val: totalRevenue.toLocaleString('ru') + ' ₽', label: 'Общая выручка', color: 'var(--purple)' },
  ].map(s => `<div class="cs-card"><div class="cs-val" style="color:${s.color}">${s.val}</div><div class="cs-label">${s.label}</div></div>`).join('');

  // Table
  const tbody = document.getElementById('clients-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="7">Клиентов не найдено</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(c => {
    const av = clientAvatarColor(c.name);
    const init = c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const stats = getClientStats(c.id);
    const lastStr = stats.last
      ? stats.last.getDate() + ' ' + ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][stats.last.getMonth()]
      : '—';
    const regD = c.regDate ? new Date(c.regDate) : null;
    const regStr = regD ? regD.getDate() + ' ' + ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][regD.getMonth()] + ' ' + regD.getFullYear() : '—';
    return `<tr>
  <td>
    <div class="client-name-cell">
      <div class="client-avatar" style="background:${av}20;color:${av}">${init}</div>
      <div>
        <div class="u-strong u-text-ui">${c.name}</div>
        <div class="u-muted u-text-caption">${c.hasAccount ? '' : 'без личного кабинета'}</div>
      </div>
    </div>
  </td>
  <td class="u-text-ui">${c.phone || '—'}</td>
  <td class="u-strong u-center">${stats.total}</td>
  <td class="u-strong u-brand">${stats.spent ? stats.spent.toLocaleString('ru') + ' ₽' : '—'}</td>
  <td class="u-text-small u-muted">${lastStr}<br><span class="u-text-caption">рег. ${regStr}</span></td>
  <td><span class="c-badge ${c.type}">${{ new: 'Новый', regular: 'Постоянный', vip: 'VIP' }[c.type] || c.type}</span></td>
  <td>
    <div class="u-flex u-gap-4 u-wrap">
      <button class="action-btn confirm btn-sm" onclick="openClientProfile(${c.id})">Просмотр</button>
      <button class="action-btn confirm btn-sm" onclick="openClientModal(${c.id})">Ред.</button>
      <button class="action-btn cancel btn-sm"${needAttr('system')} onclick="deleteClient(${c.id})">Уд.</button>
    </div>
  </td>
</tr>`;
  }).join('');
}

function filterClients(q) {
  const filter = document.getElementById('clients-filter')?.value || 'all';
  let list = CLIENTS;
  if (filter !== 'all') list = list.filter(c => c.type === filter);
  if (q) {
    const lq = q.toLowerCase();
    list = list.filter(c =>
      c.name.toLowerCase().includes(lq) ||
      (c.phone || '').includes(lq)
    );
  }
  renderAdminClients(list);
}

function openClientModal(idOrNull) {
  const modal = document.getElementById('client-modal');
  if (idOrNull) {
    const c = CLIENTS.find(x => x.id === idOrNull);
    if (!c) return;
    document.getElementById('client-modal-title').textContent = 'Редактировать клиента';
    document.getElementById('cm-id').value = c.id;
    document.getElementById('cm-first-name').value = c.firstName;
    document.getElementById('cm-last-name').value = c.lastName;
    document.getElementById('cm-phone').value = maskPhone(c.phone || '');   // единый вид +7 (XXX) XXX-XX-XX
    document.getElementById('cm-type').value = c.type;
    document.getElementById('cm-birth').value = c.birth || '';
    document.getElementById('cm-notes').value = c.notes || '';
  } else {
    document.getElementById('client-modal-title').textContent = 'Добавить клиента';
    document.getElementById('cm-id').value = '';
    ['cm-first-name', 'cm-last-name', 'cm-phone', 'cm-birth', 'cm-notes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cm-type').value = 'new';
  }
  modal.classList.add('show');
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('show'); }

async function saveClient() {
  const first = document.getElementById('cm-first-name').value.trim();
  const phone = document.getElementById('cm-phone').value.trim();
  const last = document.getElementById('cm-last-name').value.trim();
  if (!first || !last || !phone) { showToast('Имя, фамилия и телефон обязательны', 'error'); return; }
  const id = Number(document.getElementById('cm-id').value) || 0;
  const apiData = {
    first_name: first,
    last_name: last,
    phone: phone,
    type: document.getElementById('cm-type').value,
    birth_date: document.getElementById('cm-birth').value,
    notes: document.getElementById('cm-notes').value.trim(),
  };
  try {
    if (id) {
      await ClientsAPI.update({ id: id, ...apiData });
      showToast('Клиент обновлён', 'success');
    } else {
      await ClientsAPI.create(apiData);
      showToast('Клиент добавлен', 'success');
    }
    closeClientModal();
    await loadClients();
    renderAdminClients();
  } catch (e) {
    // Отказ сервера (занятый телефон, не указано имя) или нет связи — сообщение уже показано (apiRequest)
  }
}

async function deleteClient(id) {
  if (!await uiConfirm('Удалить клиента?', 'Его записи сохранятся.')) return;
  try {
    await ClientsAPI.delete(id);
    await loadClients();
    renderAdminClients();
    showToast('Клиент удалён');
  } catch (e) {
    // Отказ сервера или нет связи — сообщение уже показано (apiRequest)
  }
}

function openClientProfile(id) {
  const c = CLIENTS.find(x => x.id === id);
  if (!c) return;
  const av = clientAvatarColor(c.name);
  const init = c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const stats = getClientStats(id);
  const MONTHS_FULL3 = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  document.getElementById('cp-header').innerHTML = `
<div class="u-flex u-items-center u-gap-14">
  <div class="client-avatar" style="width:52px;height:52px;font-size:20px;background:${av}20;color:${av}">${init}</div>
  <div>
    <div class="u-bold u-text-lead">${c.name}</div>
    <div class="u-text-small u-muted u-mt-2">${c.phone || '—'}${c.hasAccount ? '' : ' · без личного кабинета'}</div>
    <div class="u-text-small u-muted u-mt-2">${c.birth ? 'ДР: ' + c.birth : ''}</div>
    ${c.notes ? `<div class="u-text-small u-muted u-mt-4 u-max-w-380 u-lh-tight"><svg class="ico-inline" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> ${c.notes}</div>` : ''}
  </div>
</div>`;

  const lastStr = stats.last ? stats.last.getDate() + ' ' + MONTHS_FULL3[stats.last.getMonth()] + ' ' + stats.last.getFullYear() : '—';
  document.getElementById('cp-stats').innerHTML = [
    { val: stats.total, label: 'Записей', color: 'var(--green)' },
    { val: stats.spent ? stats.spent.toLocaleString('ru') + ' ₽' : '0 ₽', label: 'Потрачено', color: 'var(--purple)' },
    { val: lastStr, label: 'Последний визит', color: 'var(--ink)' },
  ].map(s => `<div class="cp-stat-card"><div class="cp-stat-val" style="color:${s.color}">${s.val}</div><div class="cp-stat-label">${s.label}</div></div>`).join('');

  const history = bookings.filter(b => b.clientId === id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const histEl = document.getElementById('cp-history');
  if (!history.length) {
    histEl.innerHTML = `<div class="u-text-ui empty-state">Записей нет</div>`;
  } else {
    histEl.innerHTML = history.map(b => {
      const d = new Date(b.date);
      const sMap = { confirmed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>', pending: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14M5 21h14M6 3v4l6 5-6 5v4M18 3v4l-6 5 6 5v4"/></svg>', cancelled: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>' };
      return `<div class="cp-history-row">
    <div class="u-center u-w-40 u-text-title">${sMap[b.status] || sMap.confirmed || '•'}</div>
    <div class="u-flex-1">
      <div class="u-strong u-text-ui">${b.service}</div>
      <div class="u-text-caption u-muted">${d.getDate()} ${MONTHS_FULL3[d.getMonth()]} · ${b.time} · ${b.specialist}</div>
    </div>
    <div class="u-bold u-text-ui cat-text ${colorClass(b.cat, b.type)}">${b.price.toLocaleString('ru')} ₽</div>
  </div>`;
    }).join('');
  }

  document.getElementById('cp-edit-btn').onclick = () => {
    document.getElementById('client-profile-modal').classList.remove('show');
    openClientModal(id);
  };

  document.getElementById('client-profile-modal').classList.add('show');
}

async function adminCancel(id) {
  if (!await uiConfirm('Отменить запись?')) return;
  try {
    await BookingsAPI.setStatus(id, 'cancelled');   // пишем в БД
    await loadBookingsPanel();                        // перечитываем из API с фильтрами раздела
    renderAdminBookings();                            // перерисовываем список
    showToast('Запись отменена');
  } catch (e) {
    showToast('Не удалось отменить запись', 'error');
  }
}

