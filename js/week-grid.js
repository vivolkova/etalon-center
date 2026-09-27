// Недельная сетка расписания — общее для сайта (site/schedule.js) и админки (admin/schedule.js).
// Стили — css/week-grid.css.

// Диапазон часов сетки: от самого раннего открытия до самого позднего закрытия
// среди активных филиалов (режим работы — Панель → Настройки → Филиалы),
// расширенный так, чтобы были видны все слоты недели. Режим работы не задан и слотов нет — 08–22.
function weekHourRange(weekSlots) {
  let from = Infinity, to = -Infinity;
  LOCATIONS.forEach(function (l) {
    for (let i = 0; i < 7; i++) {
      const h = locDayHours(l.id, i);
      if (h) { from = Math.min(from, h.from); to = Math.max(to, h.to); }
    }
  });
  (weekSlots || []).forEach(function (s) {
    const st = timeToMin(s.time);
    from = Math.min(from, st); to = Math.max(to, st + (parseInt(s.dur) || 0));
  });
  if (from === Infinity) return { start: 8, end: 22 };
  return { start: Math.floor(from / 60), end: Math.min(24, Math.ceil(to / 60)) };
}

// Высота одного часа в px — из CSS-переменной --wg-row-h сетки (единый источник с css/week-grid.css)
function wgRowHeight(grid) {
  return parseFloat(getComputedStyle(grid).getPropertyValue('--wg-row-h')) || 60;
}
