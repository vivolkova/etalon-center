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
  // Имя — как в остальных таблицах панели, без кружка с инициалами; пометки («нет кабинета»…) — второй строкой
  tbody.innerHTML = rows.map(c => {
    const marks = clientMarks(c).join(' · ');
    return `<tr class="u-pointer" onclick="openClientModal(${c.id})">
  <td><strong>${escAttr(c.name)}</strong>${marks ? '<br><span class="u-muted u-text-caption">' + marks + '</span>' : ''}</td>
  <td class="u-nowrap">${c.phone || '—'}</td>
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
      c.name.toLowerCase().includes(lq) || phoneMatches(c.phone, q)
    );
  }
  renderAdminClients(list);
}

function openClientModal(idOrNull) {
  const modal = document.getElementById('client-modal');
  if (idOrNull) {
    const c = CLIENTS.find(x => x.id === idOrNull);
    if (!c) return;
    document.getElementById('client-modal-title').textContent = 'Данные клиента: ' + c.name;
    document.getElementById('cm-id').value = c.id;
    document.getElementById('cm-first-name').value = c.firstName;
    document.getElementById('cm-last-name').value = c.lastName;
    document.getElementById('cm-phone').value = maskPhone(c.phone || '');   // единый вид +7 (XXX) XXX-XX-XX
    document.getElementById('cm-type').value = c.type;
    document.getElementById('cm-birth').value = c.birth || '';
    document.getElementById('cm-notes').value = c.notes || '';
    document.getElementById('cm-bookings').innerHTML = '';
    document.getElementById('cm-consents').innerHTML = '';
    document.getElementById('cp-account').innerHTML = '';
    cpAccountLoad(c.id);
  } else {
    document.getElementById('client-modal-title').textContent = 'Добавить клиента';
    document.getElementById('cm-id').value = '';
    ['cm-first-name', 'cm-last-name', 'cm-phone', 'cm-birth', 'cm-notes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cm-type').value = 'new';
    cpAccountId = null;   // у нового клиента вкладки «Записи» и «Личный кабинет» недоступны
    document.getElementById('cm-bookings').innerHTML = '';
    document.getElementById('cm-consents').innerHTML = '';
    document.getElementById('cp-account').innerHTML = '';
  }
  // Статус меняет администратор системы
  const type = document.getElementById('cm-type');
  type.disabled = !canDo('system');
  type.title = type.disabled ? NEED_TITLE : '';
  // «Записи», «Согласия» и «Личный кабинет» — только у сохранённого клиента; окно всегда открывается на первой вкладке
  modal.querySelectorAll('[data-cm-tab]:not([data-cm-tab="main"])').forEach(function (tab) {
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
// Вкладки окна клиента: main — данные, bookings — записи на занятия, consents — согласия, account — личный кабинет
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
  // Вкладка «Согласия»: что изменили галочками. Поставили у непринятого документа — отметить согласие;
  // сняли у данного добровольного (фото и видео) — отозвать. У принятых обязательных галочка заблокирована
  if (id) {
    const boxes = Array.from(document.querySelectorAll('#cm-consents input[data-consent]:not(:disabled)'));
    const codes = function (list) { return list.map(function (el) { return el.getAttribute('data-consent'); }); };
    apiData.consents = codes(boxes.filter(function (el) { return el.checked && !el.hasAttribute('data-given'); }));
    apiData.consents_revoke = codes(boxes.filter(function (el) { return !el.checked && el.hasAttribute('data-given'); }));
  }
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

// ── Личный кабинет клиента (вторая вкладка окна клиента) ──────────
// Пометки клиента для списка клиентов, карточки и журнала записи: чего у него пока нет
function clientMarks(c) {
  const m = [];
  if (!c.hasAccount) m.push('нет кабинета');
  if (!c.phoneVerified) m.push('номер не подтверждён');
  if (!c.consentsOk) m.push('согласий нет');   // не приняты действующие редакции обязательных документов
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
  cmConsentsRender(id, c.consents, Number(c.has_account) === 1);
  accountCtx = { who: ACCOUNT_CLIENT, phone: c.phone, changed: cpAccountChanged };
  accountBlockFill('cp-account', c, id);
}

// Блок «Личный кабинет» — один для окна клиента и окна сотрудника (js/admin/staff.js): есть ли кабинет, подтверждён ли
// номер, последний вход; ссылка для создания кабинета, сброс пароля, подтверждение номера.
// accountCtx — чей блок открыт: who — слова для текстов (клиент или сотрудник), phone — его номер,
// changed(id) — что обновить после действия
const ACCOUNT_CLIENT = { nom: 'клиент', gen: 'клиента', dat: 'клиенту', none: 'Кабинета нет — клиент записан администратором' };
const ACCOUNT_STAFF = { nom: 'сотрудник', gen: 'сотрудника', dat: 'сотруднику', none: 'Кабинета нет' };
let accountCtx = { who: ACCOUNT_CLIENT, phone: '', changed: function () { } };
// c — ответ ClientsAPI.get; self — это сам вошедший администратор: свой пароль он меняет в «Профиле»
function accountBlockFill(boxId, c, id) {
  const who = accountCtx.who;
  const self = !!currentUser && Number(currentUser.id) === Number(id);
  const has = Number(c.has_account) === 1;
  const reset = Number(c.password_reset) === 1;   // пароль сброшен администратором, новый ещё не задан
  const line = function (text, btn) {
    return '<div class="u-flex u-items-center u-gap-10 u-wrap u-text-body u-mb-6"><span>' + text + '</span>' + (btn || '') + '</div>';
  };
  const verified = c.phone_verified_at
    ? 'Номер подтверждён ' + docDate(c.phone_verified_at) + (c.phone_verified_by_name ? ' — администратор ' + escAttr(c.phone_verified_by_name) : '')
    : 'Номер не подтверждён';
  document.getElementById(boxId).innerHTML = line(has ? 'Создан ' + (docDate(c.account_created_at) || '—') : who.none)
    + line(verified, c.phone_verified_at ? '' : '<button class="btn-ghost btn-sm" onclick="cpVerifyPhone(' + id + ')">Подтвердить номер</button>')
    + (has ? line(c.last_login_at ? 'Последний вход ' + cpDateTime(c.last_login_at) : 'Входов ещё не было') : '')
    + (reset ? line('Пароль сброшен — ' + who.nom + ' войдёт, когда задаст новый по ссылке') : '')
    + '<div class="u-mt-10">'
    + (!has ? '<button class="btn-ghost btn-sm" onclick="cpIssueLink(' + id + ')">Ссылка для создания кабинета</button>'
      : reset ? '<button class="btn-ghost btn-sm" onclick="cpResetPassword(' + id + ',true)">Новая ссылка для пароля</button>'
        : self ? '<span class="u-text-body u-muted">Свой пароль меняйте в разделе «Профиль»</span>'
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
  const who = accountCtx.who;
  if (!again && !await uiConfirm('Сбросить пароль ' + who.gen + '?', who.nom.charAt(0).toUpperCase() + who.nom.slice(1) + ' выйдет на всех устройствах и не сможет войти, пока не задаст новый пароль по ссылке.')) return;
  let res;
  try { res = await ClientsAPI.resetPassword(id); } catch (e) { return; }
  cpLinkWindow(res);
  accountCtx.changed(id);
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
    + '<div class="u-text-body u-muted u-mt-16">Отправьте ссылку ' + accountCtx.who.dat + ' только на номер ' + escAttr(res.phone) + '.<br>'
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

// ── Согласия клиента (вкладка окна клиента) ───────────────────────
// Клиент с личным кабинетом даёт согласия сам на сайте (при регистрации) и сам отзывает согласие на фото и видео
// в профиле — администратору его согласия только показываются.
// Клиент без кабинета (его завёл администратор) подписывает документы в студии: администратор ставит галочки
// у подписанных документов и нажимает «Сохранить» — согласия записываются вместе с данными клиента, одной
// транзакцией (saveClient). Принятое обязательное согласие не снимается (галочка заблокирована); согласие
// на фото и видео отзывается так же, галочкой: сняли и сохранили
function cmConsentsRender(id, list, hasAccount) {
  list = list || [];
  const link = function (x) { return '<a class="u-brand" href="#doc/' + x.code + '" target="_blank" rel="noopener">' + escAttr(x.name) + '</a>'; };
  const status = function (x) {
    const optional = x.acceptance === 'optional';
    if (!x.accepted_at) return optional ? 'не дано' : 'не принято';
    const stale = !optional && x.accepted_version !== x.version;   // после согласия вышла новая редакция
    return (optional ? 'дано: ' : 'принято: ') + 'редакция ' + x.accepted_version + ', ' + docDate(x.accepted_at)
      + (stale ? ' — вышла редакция ' + x.version + ', её нужно принять' : '');
  };
  const box = document.getElementById('cm-consents');
  if (!list.length) { box.innerHTML = '<div class="u-text-body u-muted">Документов для согласия нет</div>'; return; }
  if (hasAccount) {
    box.innerHTML = '<div class="u-text-body u-muted u-mb-10">Согласия клиент даёт и отзывает сам в личном кабинете.</div>'
      + list.map(function (x) {
        return '<div class="u-text-body u-mb-6">' + link(x) + ' — <span class="u-muted">' + status(x) + '</span></div>';
      }).join('');
    return;
  }
  box.innerHTML = '<div class="u-text-body u-muted">У клиента нет личного кабинета: отметьте документы, которые он подписал в студии, и нажмите «Сохранить».</div>'
    + list.map(function (x) {
      const optional = x.acceptance === 'optional';
      const given = !!x.accepted_at && (optional || x.accepted_version === x.version);
      // data-given — согласие уже записано: по нему saveClient понимает, что изменилось
      return '<label class="check-label check-label--text u-mt-10"><input type="checkbox" data-consent="' + x.code + '"'
        + (given ? ' checked data-given' : '') + (given && !optional ? ' disabled' : '') + '>'
        + '<span>' + link(x) + ' — <span class="u-muted">' + status(x) + '</span></span></label>';
    }).join('');
}
// После действия: блок в окне и пометки в списке клиентов — заново
async function cpAccountChanged(id) {
  cpAccountLoad(id);
  await loadClients();
  renderAdminClients();
}

async function cpVerifyPhone(id) {
  if (!await uiConfirm('Вы позвонили на ' + accountCtx.phone + ' и ' + accountCtx.who.nom + ' рядом принял звонок?')) return;
  try { await ClientsAPI.verifyPhone(id); } catch (e) { return; }
  showToast('Номер подтверждён', 'success');
  accountCtx.changed(id);
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

