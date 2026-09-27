// Сайт: календарь на главной (не используется — разметки нет, к удалению)

// ═══ HERO CALENDAR ════════════════════════════════════════════════

let heroSelectedDate = today.getDate();
let heroSelectedMonth = today.getMonth();
let heroSelectedYear = today.getFullYear();
let heroViewMonth = today.getMonth();
let heroViewYear = today.getFullYear();

function renderHeroCalendar() {
  const container = document.getElementById('hero-calendar');
  if (!container) return;
  const firstDay = (new Date(heroViewYear, heroViewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(heroViewYear, heroViewMonth + 1, 0).getDate();
  const eventDays = new Set(
    SLOTS.filter(s => s.date.getMonth() === heroViewMonth && s.date.getFullYear() === heroViewYear)
      .map(s => s.date.getDate())
  );
  const MONTHS_LONG = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell other-month"></div>`;
  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = i === today.getDate() && heroViewMonth === today.getMonth() && heroViewYear === today.getFullYear();
    const isSelected = i === heroSelectedDate && heroViewMonth === heroSelectedMonth && heroViewYear === heroSelectedYear;
    const hasEv = eventDays.has(i);
    cells += `<div class="cal-cell${isToday && !isSelected ? ' today' : ''}${isSelected ? ' selected' : ''}${hasEv ? ' has-event' : ''}" onclick="heroSelectDate(${i},${heroViewMonth},${heroViewYear})">${i}</div>`;
  }

  container.innerHTML = `
<div class="mini-calendar">
  <div class="mini-cal-head">
    <span>${MONTHS_LONG[heroViewMonth]} ${heroViewYear}</span>
    <div class="mini-cal-nav">
      <button onclick="heroChangeMonth(-1)">‹</button>
      <button onclick="heroChangeMonth(1)">›</button>
    </div>
  </div>
  <div class="cal-days-row">${DAYS_RU.map(d => `<div class="cal-day-name">${d}</div>`).join('')}</div>
  <div class="cal-cells">${cells}</div>
  <div id="hero-events"></div>
</div>`;

  renderHeroEvents();
}

function heroSelectDate(day, month, year) {
  heroSelectedDate = day;
  heroSelectedMonth = month;
  heroSelectedYear = year;
  renderHeroCalendar();
}

function heroChangeMonth(dir) {
  heroViewMonth += dir;
  if (heroViewMonth > 11) { heroViewMonth = 0; heroViewYear++; }
  if (heroViewMonth < 0) { heroViewMonth = 11; heroViewYear--; }
  renderHeroCalendar();
}

function renderHeroEvents() {
  const el = document.getElementById('hero-events');
  if (!el) return;

  const MONTHS_FULL2 = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const selDate = new Date(heroSelectedYear, heroSelectedMonth, heroSelectedDate);
  const isToday = heroSelectedDate === today.getDate() && heroSelectedMonth === today.getMonth() && heroSelectedYear === today.getFullYear();
  const isPast = selDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const label = isToday ? 'Сегодня' : `${heroSelectedDate} ${MONTHS_FULL2[heroSelectedMonth]}`;

  // Точный поиск по дате (сравниваем год/месяц/день)
  const daySlots = SLOTS.filter(s => {
    const sd = s.date;
    return sd.getFullYear() === heroSelectedYear
      && sd.getMonth() === heroSelectedMonth
      && sd.getDate() === heroSelectedDate;
  }).sort((a, b) => a.time.localeCompare(b.time));

  if (isPast) {
    el.innerHTML = `<div style="margin-top:1rem;padding:12px;background:var(--surface);border-radius:10px;text-align:center;color:var(--ink-60);font-size:12px">Прошедшая дата</div>`;
    return;
  }

  if (!daySlots.length) {
    // Дата в будущем, но вне 14-дневного диапазона или просто нет занятий
    const daysAhead = Math.round((selDate - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    const msg = daysAhead > 14
      ? `Запись на ${label.toLowerCase()} откроется позже`
      : `Нет занятий ${label.toLowerCase()}`;
    el.innerHTML = `<div style="margin-top:1rem;padding:12px;background:var(--surface);border-radius:10px;text-align:center;color:var(--ink-60);font-size:12px">${msg}</div>`;
    return;
  }

  const shown = daySlots.slice(0, 3);
  el.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin:1rem 0 .5rem">
  <span style="font-size:12px;font-weight:700;color:var(--ink-60);text-transform:uppercase;letter-spacing:.5px">${label}</span>
  <span style="font-size:11px;color:var(--green);font-weight:600;cursor:pointer" onclick="showPage('schedule')">${daySlots.length > 3 ? `+${daySlots.length - 3} ещё →` : 'Расписание →'}</span>
</div>
${shown.map(s => {
    const col = { training: '#00BAB3', bikefit: '#c07a10', workshop: '#4e42b5' }[s.cat];
    const left = s.max - s.taken;
    return `<div class="mini-event" style="cursor:pointer" onclick="openBookingModal(${s.id})">
    <div class="mini-event-dot" style="background:${col}"></div>
    <div class="mini-event-info">
      <div class="mini-event-name">${s.name}</div>
      <div class="mini-event-time">${s.time} · ${s.specialist}</div>
    </div>
    <span class="mini-event-spots" style="background:${col}20;color:${col}">${left > 0 ? left + ' мест' : 'Занято'}</span>
  </div>`;
  }).join('')}`;
}


