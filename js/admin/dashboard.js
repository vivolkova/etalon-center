// Админка: дашборд и аналитика

// ═══ DASHBOARD ═══════════════════════════════════════════════════════

function renderDashboard() {
  const dateEl = document.getElementById('adm-dash-date');
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const total = bookings.length;
  const confirmed = bookings.filter(b => b.status === 'booked').length;
  const revenue = bookings.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + b.price, 0);
  const todayB = bookings.filter(b => {
    const d = new Date(b.date); return d.toDateString() === today.toDateString();
  });
  const kpiEl = document.getElementById('adm-kpi-grid');
  if (kpiEl) kpiEl.innerHTML = [
    { val: total, label: 'Всего записей', delta: '+12%', up: true, color: 'var(--green)' },
    { val: confirmed, label: 'Записей', delta: '+8%', up: true, color: '#4e42b5' },
    { val: CLIENTS.length, label: 'Клиентов', delta: '+3', up: true, color: '#c07a10' },
    { val: revenue.toLocaleString('ru') + ' ₽', label: 'Выручка', delta: '+15%', up: true, color: 'var(--green)' },
  ].map(k => '<div class="adm-kpi"><div class="adm-kpi-val" style="color:' + k.color + '">' + k.val + '</div><div class="adm-kpi-label">' + k.label + '</div><div class="adm-kpi-delta ' + (k.up ? 'up' : 'down') + '">' + k.delta + ' к прошлой неделе</div></div>').join('');

  // Записи сегодня
  const tbEl = document.getElementById('adm-today-bookings');
  if (tbEl) {
    if (!todayB.length) { tbEl.innerHTML = '<div style="color:var(--ink-60);font-size:13px;padding:10px 0">Нет записей на сегодня</div>'; }
    else tbEl.innerHTML = todayB.slice(0, 5).map(b => '<div class="activity-item"><div class="activity-dot" style="background:var(--green)"></div><div><div style="font-weight:600">' + b.name + '</div><div style="color:var(--ink-60)">' + b.service + ' · ' + b.time + '</div></div></div>').join('');
  }
  // Популярные тренировки
  const ptEl = document.getElementById('adm-popular-trainings');
  if (ptEl) {
    const counts = {};
    bookings.forEach(b => { counts[b.service] = (counts[b.service] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!sorted.length) { ptEl.innerHTML = '<div style="color:var(--ink-60);font-size:13px;padding:10px 0">Нет данных</div>'; }
    else ptEl.innerHTML = sorted.map(([name, cnt]) => '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><span>' + name + '</span><strong>' + cnt + ' зап.</strong></div>').join('');
  }
  // Лента активности
  const afEl = document.getElementById('adm-activity-feed');
  if (afEl) {
    afEl.innerHTML = notifications.slice(0, 8).map(n => '<div class="activity-item"><div class="activity-dot" style="background:var(--green)"></div><div>' + n.title + ' — ' + n.text.slice(0, 50) + '</div><div class="activity-time">' + n.time + '</div></div>').join('') || '<div style="color:var(--ink-60);font-size:13px;padding:10px 0">Нет событий</div>';
  }
  updateAdminBadges();
}

function updateAdminBadges() {
  const unreadNotif = notifications.filter(n => !n.read).length;
  const nb = document.getElementById('adm-badge-notif');
  if (nb) { nb.textContent = unreadNotif; nb.style.display = unreadNotif ? '' : 'none'; }
  const unreadChat = Object.values(chatMessages).filter(msgs => msgs.length && msgs[msgs.length - 1].from === 'client').length;
  const cb = document.getElementById('adm-badge-chat');
  if (cb) { cb.textContent = unreadChat; cb.style.display = unreadChat ? '' : 'none'; }
  const pendingB = bookings.filter(b => b.status === 'pending').length;
  const bb = document.getElementById('adm-badge-bookings');
  if (bb) { bb.textContent = pendingB; bb.style.display = pendingB ? '' : 'none'; }
}

// ═══ ANALYTICS ═══════════════════════════════════════════════════════

function renderAnalytics() {
  const kpi = document.getElementById('analytics-kpi');
  if (!kpi) return;
  const revenue = bookings.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + b.price, 0);
  const avgCheck = bookings.length ? Math.round(revenue / bookings.length) : 0;
  const convRate = bookings.length ? Math.round(bookings.filter(b => b.status === 'booked').length / bookings.length * 100) : 0;
  kpi.innerHTML = [
    { val: bookings.length, label: 'Всего записей', color: 'var(--green)' },
    { val: revenue.toLocaleString('ru') + ' ₽', label: 'Выручка', color: '#4e42b5' },
    { val: avgCheck.toLocaleString('ru') + ' ₽', label: 'Средний чек', color: '#c07a10' },
    { val: convRate + '%', label: 'Конверсия', color: '#059669' },
  ].map(k => '<div class="adm-kpi"><div class="adm-kpi-val" style="color:' + k.color + '">' + k.val + '</div><div class="adm-kpi-label">' + k.label + '</div></div>').join('');

  renderBarChart('chart-attendance', [12, 18, 8, 22, 15, 28, 10], ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], '#00BAB3');
  renderBarChart('chart-revenue', [42000, 65000, 31000, 78000, 55000, 92000, 38000], ['Н-1', 'Н-2', 'Н-3', 'Н-4', 'Н-5', 'Н-6', 'Н-7'], '#4e42b5', true);
  const counts = {}; bookings.forEach(b => { counts[b.service] = (counts[b.service] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  renderBarChart('chart-trainings', top.map(x => x[1]), top.map(x => x[0].slice(0, 8)), '#c07a10');
  renderBarChart('chart-clients', [2, 5, 3, 8, 4, 6, 3], ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], '#059669');
}

function renderBarChart(id, values, labels, color, formatK) {
  const el = document.getElementById(id);
  if (!el) return;
  const max = Math.max(...values, 1);
  el.innerHTML = '<div class="bar-chart">' +
    values.map((v, i) => {
      const h = Math.round((v / max) * 140);
      const label = formatK && v >= 1000 ? Math.round(v / 1000) + 'к' : v;
      return '<div style="display:flex;flex-direction:column;align-items:center;flex:1">' +
        '<div class="bar-chart-bar" style="height:' + h + 'px;background:' + color + ';opacity:0.85">' +
        '<span class="bar-chart-val">' + label + '</span></div>' +
        '<div class="bar-chart-label">' + labels[i] + '</div></div>';
    }).join('') + '</div>';
}

