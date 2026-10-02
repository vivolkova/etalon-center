// Админка: абонементы, лист ожидания, финансы, промокоды, рассылки

// ═══ SUBSCRIPTIONS ════════════════════════════════════════════════════

function renderSubscriptions() {
  const grid = document.getElementById('sub-plans-grid');
  if (grid) {
    const colors = { 'Старт': '#6b7280', 'Базовый': '#00BAB3', 'Продвинутый': '#4e42b5', 'Безлимит': '#c07a10' };
    grid.innerHTML = SUB_PLANS.map(p => '<div class="sub-plan-card" style="border-top:4px solid ' + (colors[p.name] || 'var(--green)') + '">' +
      '<div class="sub-plan-name">' + p.name + '</div>' +
      '<div class="sub-plan-price">' + (p.sessions >= 999 ? 'Безлим.' : p.sessions + ' зан.') + '</div>' +
      '<div style="font-size:22px;font-weight:700;margin-bottom:10px">' + p.price.toLocaleString('ru') + ' ₽</div>' +
      '<div class="sub-plan-features">' + p.features.map(f => '✓ ' + f).join('<br>') + '</div>' +
      '<div style="font-size:11px;color:var(--ink-60);margin-top:6px">Срок действия: ' + p.validity + ' дней</div>' +
      '<div style="display:flex;gap:6px;margin-top:14px">' +
      '<button class="action-btn confirm" style="font-size:11px;padding:4px 10px" onclick="openSubModal(' + p.id + ')">Ред.</button>' +
      '<button class="action-btn cancel" style="font-size:11px;padding:4px 10px" onclick="deleteSubPlan(' + p.id + ')">Уд.</button>' +
      '<button class="action-btn" style="font-size:11px;padding:4px 10px;background:var(--green-light);color:var(--green);border:1.5px solid var(--green)" onclick="sellSubscription(' + p.id + ')">Продать</button>' +
      '</div>' +
      '</div>').join('');
  }
  const tbody = document.getElementById('sub-sales-tbody');
  if (tbody) tbody.innerHTML = SUB_SALES.map(s => '<tr>' +
    '<td><strong>' + s.client + '</strong><br><span style="font-size:11px;color:var(--ink-60)">' + s.email + '</span></td>' +
    '<td>' + s.plan + '</td><td>' + s.bought + '</td><td>' + s.expires + '</td>' +
    '<td style="text-align:center;font-weight:600">' + (s.left >= 999 ? '∞' : s.left) + '</td>' +
    '<td><span class="c-badge ' + (s.active ? 'active' : 'inactive') + '">' + (s.active ? 'Активный' : 'Истёк') + '</span></td>' +
    '</tr>').join('');
}

function openSubModal(id) {
  const p = id ? SUB_PLANS.find(function (x) { return x.id === id; }) : null;
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'sub-tmp-modal';
  el.innerHTML = [
    '<div class="admin-modal" style="max-width:420px">',
    '<div class="admin-modal-title">' + (p ? 'Редактировать абонемент' : 'Новый абонемент') + '</div>',
    '<div class="form-row">',
    '<div class="form-field"><label class="form-label">Название</label><input class="form-input" id="subm-name" value="' + (p ? p.name : '') + '"></div>',
    '<div class="form-field"><label class="form-label">Занятий</label><input class="form-input" id="subm-sessions" type="number" value="' + (p ? p.sessions : 8) + '" min="1"></div>',
    '</div>',
    '<div class="form-row">',
    '<div class="form-field"><label class="form-label">Цена (₽)</label><input class="form-input" id="subm-price" type="number" value="' + (p ? p.price : 7500) + '"></div>',
    '<div class="form-field"><label class="form-label">Срок (дней)</label><input class="form-input" id="subm-validity" type="number" value="' + (p ? p.validity : 30) + '"></div>',
    '</div>',
    '<div class="form-field"><label class="form-label">Описание (по одному на строку)</label>',
    '<textarea class="form-input" id="subm-features" rows="4" style="height:auto;resize:vertical"></textarea></div>',
    '<div class="admin-modal-actions">',
    '<button class="btn-ghost" id="sub-cancel-btn">Отмена</button>',
    '<button class="btn-primary" id="sub-save-btn">Сохранить</button>',
    '</div></div>'
  ].join('');
  document.body.appendChild(el);
  if (p) document.getElementById('subm-features').value = p.features.join('\n');
  document.getElementById('sub-cancel-btn').onclick = function () { el.remove(); };
  document.getElementById('sub-save-btn').onclick = function () { saveSubPlan(p ? p.id : null); };
}

async function saveSubPlan(id) {
  const data = { name: document.getElementById('subm-name').value.trim(), sessions: parseInt(document.getElementById('subm-sessions').value), price: parseInt(document.getElementById('subm-price').value), validity: parseInt(document.getElementById('subm-validity').value), features: document.getElementById('subm-features').value.split('\n').map(s => s.trim()).filter(Boolean) };
  if (!data.name) { showToast('Введите название', 'error'); return; }
  try {
    if (id) {
      await apiRequest('/subscriptions.php?action=update_plan', 'PUT', { id, ...data });
      showToast('Абонемент обновлён', 'success');
    } else {
      await apiRequest('/subscriptions.php?action=create_plan', 'POST', data);
      showToast('Абонемент создан', 'success');
    }
    var stm = document.getElementById('sub-tmp-modal'); if (stm) stm.remove();
    await loadSubPlans();
    renderSubscriptions();
  } catch (e) {
    if (id) { const p = SUB_PLANS.find(x => x.id === id); if (p) Object.assign(p, data); showToast('Абонемент обновлён', 'success'); }
    else { SUB_PLANS.push({ id: Date.now(), ...data }); showToast('Абонемент создан', 'success'); }
    var stm2 = document.getElementById('sub-tmp-modal'); if (stm2) stm2.remove();
    renderSubscriptions();
  }
}
async function deleteSubPlan(id) {
  if (!confirm('Удалить абонемент?')) return;
  try {
    await apiRequest('/subscriptions.php?action=delete_plan&id=' + id, 'DELETE');
    await loadSubPlans();
    renderSubscriptions();
    showToast('Удалён');
  } catch (e) {
    const i = SUB_PLANS.findIndex(x => x.id === id); if (i >= 0) { SUB_PLANS.splice(i, 1); renderSubscriptions(); showToast('Удалён'); }
  }
}
function sellSubscription(planId) { const p = SUB_PLANS.find(x => x.id === planId); if (!p) return; showToast('Форма продажи абонемента «' + p.name + '» — укажите клиента в базе', 'success'); }

// ═══ WAITLIST ════════════════════════════════════════════════════════

function renderWaitlist() {
  const tbody = document.getElementById('waitlist-tbody');
  if (!tbody) return;
  if (!WAITLIST.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--ink-60)">Лист ожидания пуст</td></tr>'; return; }
  tbody.innerHTML = WAITLIST.map(w => '<tr>' +
    '<td><strong>' + w.client + '</strong><br><span style="font-size:11px;color:var(--ink-60)">' + w.email + '</span></td>' +
    '<td>' + w.slot + '</td><td>' + w.date + '</td><td>' + w.added + '</td>' +
    '<td style="display:flex;gap:4px">' +
    '<button class="action-btn confirm" style="font-size:11px;padding:4px 8px" onclick="notifyWaitlist(' + w.id + ')">Уведомить</button>' +
    '<button class="action-btn cancel" style="font-size:11px;padding:4px 8px" onclick="removeWaitlist(' + w.id + ')">Удалить</button>' +
    '</td></tr>').join('');
}
function notifyWaitlist(id) { const w = WAITLIST.find(x => x.id === id); if (w) showToast('Уведомление отправлено: ' + w.client, 'success'); }
function removeWaitlist(id) { const i = WAITLIST.findIndex(x => x.id === id); if (i >= 0) { WAITLIST.splice(i, 1); renderWaitlist(); showToast('Удалён из листа ожидания'); } }

// ═══ FINANCE ═════════════════════════════════════════════════════════

function renderFinance() {
  const kpi = document.getElementById('finance-kpi');
  if (!kpi) return;
  const paid = bookings.filter(b => b.paymentStatus === 'paid');
  const revenue = paid.reduce((s, b) => s + b.price, 0);
  const pending = bookings.filter(b => b.paymentStatus !== 'paid' && b.status !== 'cancelled').reduce((s, b) => s + b.price, 0);
  kpi.innerHTML = [
    { val: revenue.toLocaleString('ru') + ' ₽', label: 'Получено', color: 'var(--green)' },
    { val: pending.toLocaleString('ru') + ' ₽', label: 'Ожидает оплаты', color: '#c07a10' },
    { val: paid.length, label: 'Транзакций', color: '#4e42b5' },
    { val: paid.length ? Math.round(revenue / paid.length).toLocaleString('ru') + ' ₽' : '—', label: 'Средний чек', color: '#059669' },
  ].map(k => '<div class="adm-kpi"><div class="adm-kpi-val" style="color:' + k.color + '">' + k.val + '</div><div class="adm-kpi-label">' + k.label + '</div></div>').join('');

  const tx = document.getElementById('finance-transactions');
  if (tx) {
    const allB = [...bookings].filter(b => b.paymentStatus === 'paid').reverse().slice(0, 8);
    tx.innerHTML = allB.length ? allB.map(b => '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">' +
      '<div><div style="font-weight:600">' + b.name + '</div><div style="color:var(--ink-60)">' + b.service + '</div></div>' +
      '<div style="font-weight:700;color:var(--green)">' + b.price.toLocaleString('ru') + ' ₽</div></div>').join('')
      : '<div style="color:var(--ink-60);font-size:13px;padding:10px 0">Нет оплаченных записей</div>';
  }
  const cr = document.getElementById('finance-clients-report');
  if (cr) {
    const byClient = {};
    bookings.filter(b => b.paymentStatus === 'paid').forEach(b => { byClient[b.name] = (byClient[b.name] || 0) + b.price; });
    const sorted = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 6);
    cr.innerHTML = sorted.length ? sorted.map(([name, sum]) => '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">' +
      '<span style="font-weight:600">' + name + '</span><span style="color:var(--green);font-weight:700">' + sum.toLocaleString('ru') + ' ₽</span></div>').join('')
      : '<div style="color:var(--ink-60);font-size:13px;padding:10px 0">Нет данных</div>';
  }
}

// ═══ PROMOS ══════════════════════════════════════════════════════════

function renderPromos() {
  const grid = document.getElementById('promos-grid');
  if (!grid) return;
  grid.innerHTML = PROMOS.map(p => '<div class="promo-card">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
    '<div class="promo-code">' + p.code + '</div>' +
    '<span class="c-badge ' + (p.active ? 'active' : 'inactive') + '">' + (p.active ? 'Активен' : 'Отключён') + '</span>' +
    '</div>' +
    '<div style="font-size:18px;font-weight:700;margin:6px 0;color:var(--green)">' + (p.type === 'percent' ? p.value + '%' : p.value.toLocaleString('ru') + ' ₽') + ' скидка</div>' +
    '<div class="promo-info">' + p.desc + '</div>' +
    '<div class="promo-info" style="margin-top:6px">Использован: ' + p.uses + '/' + p.maxUses + ' · Истекает: ' + p.expires + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:12px">' +
    '<button class="action-btn confirm" style="font-size:11px;padding:4px 8px" onclick="openPromoModal(' + p.id + ')">Ред.</button>' +
    '<button class="action-btn cancel" style="font-size:11px;padding:4px 8px" onclick="deletePromo(' + p.id + ')">Уд.</button>' +
    '<button class="action-btn ' + (p.active ? 'cancel' : 'confirm') + '" style="font-size:11px;padding:4px 8px" onclick="togglePromo(' + p.id + ')">' + (p.active ? 'Отключить' : 'Включить') + '</button>' +
    '</div>' +
    '</div>').join('');
}

function openPromoModal(id) {
  var p = id ? PROMOS.find(function (x) { return x.id === id; }) : null;
  var el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'promo-tmp-modal';
  var expiresVal = p ? p.expires.split('.').reverse().join('-') : '';
  el.innerHTML =
    '<div class="admin-modal" style="max-width:420px">' +
    '<div class="admin-modal-title">' + (p ? 'Редактировать промокод' : 'Новый промокод') + '</div>' +
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">Код</label><input class="form-input" id="prm-code" value="' + (p ? p.code : '') + '" style="text-transform:uppercase"></div>' +
    '<div class="form-field"><label class="form-label">Тип</label><select class="form-input" id="prm-type"><option value="percent">Процент %</option><option value="fixed">Фикс. сумма</option></select></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">Значение</label><input class="form-input" id="prm-value" type="number" value="' + (p ? p.value : 10) + '"></div>' +
    '<div class="form-field"><label class="form-label">Макс. использований</label><input class="form-input" id="prm-max" type="number" value="' + (p ? p.maxUses : 50) + '"></div>' +
    '</div>' +
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">Истекает</label><input class="form-input" id="prm-expires" type="date" value="' + expiresVal + '"></div>' +
    '<div class="form-field"><label class="form-label">Описание</label><input class="form-input" id="prm-desc" value="' + (p ? p.desc : '') + '"></div>' +
    '</div>' +
    '<div class="admin-modal-actions"><button class="btn-ghost" id="prm-cancel">Отмена</button>' +
    '<button class="btn-primary" id="prm-save">Сохранить</button></div>' +
    '</div>';
  document.body.appendChild(el);
  if (p) document.getElementById('prm-type').value = p.type;
  document.getElementById('prm-cancel').onclick = function () { el.remove(); };
  document.getElementById('prm-save').onclick = function () { savePromo(p ? p.id : null); };
}

async function savePromo(id) {
  const code = document.getElementById('prm-code').value.trim().toUpperCase();
  if (!code) { showToast('Введите код', 'error'); return; }
  const expiresDate = document.getElementById('prm-expires').value;
  const apiData = {
    code,
    type: document.getElementById('prm-type').value,
    value: parseInt(document.getElementById('prm-value').value),
    max_uses: parseInt(document.getElementById('prm-max').value),
    expires_at: expiresDate || null,
    description: document.getElementById('prm-desc').value,
  };
  try {
    if (id) {
      await apiRequest('/promos.php?action=update', 'PUT', { id, ...apiData });
      showToast('Промокод обновлён', 'success');
    } else {
      await apiRequest('/promos.php?action=create', 'POST', apiData);
      showToast('Промокод создан', 'success');
    }
    document.getElementById('promo-tmp-modal').remove();
    await loadPromos();
    renderPromos();
  } catch (e) {
    const expires = expiresDate ? expiresDate.split('-').reverse().join('.') : '31.12.2026';
    const fallback = { code, type: apiData.type, value: apiData.value, maxUses: apiData.max_uses, expires, desc: apiData.description, uses: 0, active: true };
    if (id) { const p = PROMOS.find(x => x.id === id); if (p) Object.assign(p, fallback); showToast('Промокод обновлён', 'success'); }
    else { PROMOS.push({ id: Date.now(), ...fallback }); showToast('Промокод создан', 'success'); }
    document.getElementById('promo-tmp-modal').remove();
    renderPromos();
  }
}
async function deletePromo(id) {
  if (!confirm('Удалить промокод?')) return;
  try { await apiRequest('/promos.php?action=delete&id=' + id, 'DELETE'); } catch (e) { }
  const i = PROMOS.findIndex(x => x.id === id); if (i >= 0) { PROMOS.splice(i, 1); renderPromos(); showToast('Удалён'); }
}
async function togglePromo(id) {
  try { await apiRequest('/promos.php?action=toggle', 'PUT', { id }); } catch (e) { }
  const p = PROMOS.find(x => x.id === id);
  if (p) { p.active = !p.active; renderPromos(); showToast(p.active ? 'Промокод активирован' : 'Промокод отключён'); }
}

// ═══ MAILING ═════════════════════════════════════════════════════════

function renderMailing() {
  const hist = document.getElementById('mailing-history');
  if (!hist) return;
  hist.innerHTML = MAILING_HISTORY.map(m => '<div class="mail-hist-item">' +
    '<div class="mail-hist-subject">' + m.subject + '</div>' +
    '<div class="mail-hist-meta">' + m.audience + ' · ' + m.count + ' получателей · ' + m.sent + '</div>' +
    '</div>').join('') || '<div style="color:var(--ink-60);font-size:13px">История пуста</div>';
}

function previewMailing() {
  const subj = document.getElementById('mail-subject').value;
  const body = document.getElementById('mail-body').value;
  const aud = document.getElementById('mail-audience');
  const audText = aud.options[aud.selectedIndex].text;
  if (!subj || !body) { showToast('Заполните тему и текст', 'error'); return; }
  const count = aud.value === 'all' ? CLIENTS.length : CLIENTS.filter(c => c.type === aud.value).length;
  showToast('Предпросмотр: «' + subj + '» · ' + count + ' получателей (' + audText + ')', 'success');
}

function sendMailing() {
  const subj = document.getElementById('mail-subject').value.trim();
  const body = document.getElementById('mail-body').value.trim();
  const aud = document.getElementById('mail-audience');
  if (!subj || !body) { showToast('Заполните тему и текст', 'error'); return; }
  const count = CLIENTS.length;
  MAILING_HISTORY.unshift({ subject: subj, audience: aud.options[aud.selectedIndex].text, sent: new Date().toLocaleDateString('ru-RU'), count });
  document.getElementById('mail-subject').value = '';
  document.getElementById('mail-body').value = '';
  renderMailing();
  showToast('Рассылка отправлена ' + count + ' клиентам', 'success');
}

