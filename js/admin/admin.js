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

  // Stats bar — сводные цифры по клиентам видит только администратор системы
  const statsEl = document.getElementById('clients-stats');
  statsEl.style.display = canDo('system') ? '' : 'none';
  const total = CLIENTS.length;
  const vips = CLIENTS.filter(c => c.type === 'vip').length;
  const newOnes = CLIENTS.filter(c => c.type === 'new').length;
  const totalRevenue = CLIENTS.reduce((s, c) => s + getClientStats(c.id).spent, 0);
  statsEl.innerHTML = !canDo('system') ? '' : [
    { val: total, label: 'Всего клиентов', color: 'var(--green)' },
    { val: vips, label: 'VIP', color: '#c07a10' },
    { val: newOnes, label: 'Новых', color: '#0284c7' },
    { val: totalRevenue.toLocaleString('ru') + ' ₽', label: 'Общая выручка', color: 'var(--purple)' },
  ].map(s => `<div class="cs-card"><div class="cs-val" style="color:${s.color}">${s.val}</div><div class="cs-label">${s.label}</div></div>`).join('');

  // Таблица клиентов одна для администратора системы и администратора студии; нажатие на строку открывает окно клиента
  // Table
  const tbody = document.getElementById('clients-tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="3">Клиентов не найдено</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(c => {
    const av = clientAvatarColor(c.name);
    const init = c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `<tr class="u-pointer" onclick="openClientModal(${c.id})">
  <td>
    <div class="client-name-cell">
      <div class="client-avatar" style="background:${av}20;color:${av}">${init}</div>
      <div>
        <div class="u-strong u-text-ui">${c.name}</div>
        <div class="u-muted u-text-caption">${clientMarks(c).join(' · ')}</div>
      </div>
    </div>
  </td>
  <td class="u-text-ui">${c.phone || '—'}</td>
  <td><span class="c-badge ${c.type}">${{ new: 'Новый', regular: 'Постоянный', vip: 'VIP' }[c.type] || c.type}</span></td>
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
    document.getElementById('client-modal-title').textContent = 'Данные клиента';
    document.getElementById('cm-id').value = c.id;
    document.getElementById('cm-first-name').value = c.firstName;
    document.getElementById('cm-last-name').value = c.lastName;
    document.getElementById('cm-phone').value = maskPhone(c.phone || '');   // единый вид +7 (XXX) XXX-XX-XX
    document.getElementById('cm-type').value = c.type;
    document.getElementById('cm-birth').value = c.birth || '';
    document.getElementById('cm-notes').value = c.notes || '';
    document.getElementById('cm-bookings').innerHTML = '';
    document.getElementById('cp-account').innerHTML = '';
    cpAccountLoad(c.id);
  } else {
    document.getElementById('client-modal-title').textContent = 'Добавить клиента';
    document.getElementById('cm-id').value = '';
    ['cm-first-name', 'cm-last-name', 'cm-phone', 'cm-birth', 'cm-notes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cm-type').value = 'new';
    cpAccountId = null;   // у нового клиента вкладки «Записи» и «Личный кабинет» недоступны
    document.getElementById('cm-bookings').innerHTML = '';
    document.getElementById('cp-account').innerHTML = '';
  }
  // Статус меняет администратор системы
  const type = document.getElementById('cm-type');
  type.disabled = !canDo('system');
  type.title = type.disabled ? NEED_TITLE : '';
  // «Записи» и «Личный кабинет» — только у сохранённого клиента; окно всегда открывается на первой вкладке
  modal.querySelectorAll('[data-cm-tab="bookings"], [data-cm-tab="account"]').forEach(function (tab) {
    tab.disabled = !idOrNull;
    tab.title = idOrNull ? '' : 'Сначала сохраните клиента';
  });
  cmSwitchTab('main');
  modal.classList.add('show');
  // Окно не меняет размер при переключении вкладок: остальные вкладки получают высоту первой
  // (длинный список записей прокручивается внутри вкладки)
  const h = modal.querySelector('[data-cm-pane="main"]').offsetHeight;
  modal.querySelectorAll('.tab-pane').forEach(function (p) { p.style.height = h + 'px'; });
}
function closeClientModal() { document.getElementById('client-modal').classList.remove('show'); }
// Вкладки окна клиента: main — данные, bookings — записи на занятия, account — личный кабинет
function cmSwitchTab(tab) {
  document.querySelectorAll('#client-modal [data-cm-tab]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-cm-tab') === tab);
  });
  document.querySelectorAll('#client-modal [data-cm-pane]').forEach(function (p) {
    p.style.display = p.getAttribute('data-cm-pane') === tab ? '' : 'none';
  });
}

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
    <div class="u-text-small u-muted u-mt-2">${c.phone || '—'}</div>
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

  document.getElementById('client-profile-modal').classList.add('show');
}

// ── Личный кабинет клиента (вторая вкладка окна клиента) ──────────
// Пометки клиента для списка клиентов, карточки и журнала записи: чего у него пока нет
function clientMarks(c) {
  const m = [];
  if (!c.hasAccount) m.push('нет кабинета');
  if (!c.phoneVerified) m.push('номер не подтверждён');
  return m;
}
// «05.10.2026 18:40» из даты и времени сервера
function cpDateTime(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? m[3] + '.' + m[2] + '.' + m[1] + ' ' + m[4] + ':' + m[5] : '';
}

// Свежие сведения о кабинете берём с сервера при каждом открытии окна и после каждого действия
let cpAccountId = null;   // чьё окно открыто: ответ на запрос по другому клиенту не показываем
async function cpAccountLoad(id) {
  cpAccountId = id;
  let c;
  try { c = await ClientsAPI.get(id); } catch (e) { return; }
  if (cpAccountId !== id) return;
  cmBookingsRender(c);
  const has = Number(c.has_account) === 1;
  const reset = Number(c.password_reset) === 1;   // пароль сброшен администратором, новый клиент ещё не задал
  const line = function (text, btn) {
    return '<div class="u-flex u-items-center u-gap-10 u-wrap u-text-body u-mb-6"><span>' + text + '</span>' + (btn || '') + '</div>';
  };
  const verified = c.phone_verified_at
    ? 'Номер подтверждён ' + docDate(c.phone_verified_at) + (c.phone_verified_by_name ? ' — администратор ' + escAttr(c.phone_verified_by_name) : '')
    : 'Номер не подтверждён';
  document.getElementById('cp-account').innerHTML = line(has ? 'Создан ' + (docDate(c.account_created_at) || '—') : 'Кабинета нет — клиент записан администратором')
    + line(verified, c.phone_verified_at ? '' : '<button class="btn-ghost btn-sm" onclick="cpVerifyPhone(' + id + ')">Подтвердить номер</button>')
    + (has ? line(c.last_login_at ? 'Последний вход ' + cpDateTime(c.last_login_at) : 'Входов ещё не было') : '')
    + (reset ? line('Пароль сброшен — клиент войдёт, когда задаст новый по ссылке') : '')
    + '<div class="u-mt-10">'
    + (!has ? '<button class="btn-ghost btn-sm" onclick="cpIssueLink(' + id + ')">Ссылка для создания кабинета</button>'
      : reset ? '<button class="btn-ghost btn-sm" onclick="cpResetPassword(' + id + ',true)">Новая ссылка для пароля</button>'
        : '<button class="btn-primary btn-sm" onclick="cpResetPassword(' + id + ')">Сбросить пароль</button>')
    + '</div>';
}

// Ссылка для создания кабинета — клиенту без кабинета
async function cpIssueLink(id) {
  let res;
  try { res = await ClientsAPI.authLink(id); } catch (e) { return; }
  cpLinkWindow(res);
}

// Сбросить пароль клиенту с кабинетом: пароль перестаёт работать сразу, клиент выходит на всех устройствах
// и получает ссылку, по которой задаст новый. again — пароль уже сброшен, нужна только новая ссылка
async function cpResetPassword(id, again) {
  if (!again && !await uiConfirm('Сбросить пароль клиента?', 'Клиент выйдет на всех устройствах и не сможет войти, пока не задаст новый пароль по ссылке.')) return;
  let res;
  try { res = await ClientsAPI.resetPassword(id); } catch (e) { return; }
  cpLinkWindow(res);
  cpAccountLoad(id);
}

// Окно со ссылкой. Каждая выдача отменяет прежнюю ссылку; секрет сервер отдаёт один раз — после закрытия окна
// ссылку уже не посмотреть, только выдать новую
function cpLinkWindow(res) {
  const url = location.origin + location.pathname + '#access=' + res.token;
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay confirm-overlay show';
  el.innerHTML = '<div class="admin-modal u-max-w-460">'
    + '<div class="admin-modal-title u-mb-12">' + (res.purpose === 'activate' ? 'Ссылка для создания кабинета' : 'Ссылка для нового пароля') + '</div>'
    + '<input class="form-input" id="cp-link-url" readonly>'
    + '<div class="u-mt-10"><button class="btn-ghost btn-sm" id="cp-link-copy">Скопировать</button></div>'
    + '<div class="u-text-body u-muted u-mt-16">Отправьте ссылку клиенту только на номер ' + escAttr(res.phone) + '.<br>'
    + 'Действует ' + res.hours + ' ч., сработает один раз. Новая ссылка отменяет прежнюю.</div>'
    + '<div class="admin-modal-actions"><button class="btn-primary" id="cp-link-close">Закрыть</button></div></div>';
  document.body.appendChild(el);
  const input = document.getElementById('cp-link-url');
  input.value = url;
  document.getElementById('cp-link-close').onclick = function () { el.remove(); };
  document.getElementById('cp-link-copy').onclick = async function () {
    try { await navigator.clipboard.writeText(url); }
    catch (e) { input.select(); document.execCommand('copy'); }   // буфер обмена недоступен — копируем выделение
    showToast('Ссылка скопирована', 'success');
  };
}

// Записи клиента на занятия (сервер отдаёт от недели назад и дальше без ограничения, свежие сверху):
// состояние записи, занятие, дата · время · специалист. Отменённые — приглушённые
function cmBookingsRender(c) {
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const ICON = {
    booked: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    cancelled: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  };
  const rows = (c.bookings || []).map(function (b) {
    const d = parseLocalDate(b.slot_date), off = b.status === 'cancelled';
    return '<div class="cp-history-row' + (off ? ' u-muted' : '') + '" title="' + (off ? 'Запись отменена' : 'Запись действует') + '">'
      + '<div class="u-center u-w-40">' + (ICON[b.status] || '') + '</div>'
      + '<div class="u-flex-1"><div class="u-strong u-text-ui"><span class="cat-dot ' + colorClass(b.category, b.type) + '"></span>' + escAttr(b.slot_name) + '</div>'
      + '<div class="u-text-caption u-muted">' + [d.getDate() + ' ' + MONTHS[d.getMonth()], String(b.start_time || '').slice(0, 5), b.specialist_name].filter(Boolean).map(escAttr).join(' · ') + '</div></div></div>';
  }).join('');
  document.getElementById('cm-bookings').innerHTML = '<div class="u-text-body u-muted u-mb-10">Занятия с ' + docDate(c.bookings_from) + ' и позже</div>'
    + (rows || '<div class="u-text-body u-muted">Записей нет</div>');
}

// После действия: блок в окне и пометки в списке клиентов — заново
async function cpAccountChanged(id) {
  cpAccountLoad(id);
  await loadClients();
  renderAdminClients();
}

async function cpVerifyPhone(id) {
  const c = CLIENTS.find(x => x.id === id);
  if (!c) return;
  if (!await uiConfirm('Вы позвонили на ' + c.phone + ' и клиент рядом принял звонок?')) return;
  try { await ClientsAPI.verifyPhone(id); } catch (e) { return; }
  showToast('Номер подтверждён', 'success');
  cpAccountChanged(id);
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

