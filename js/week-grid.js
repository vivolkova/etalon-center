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

// Раскладка слотов дня по колонкам: пересекающиеся по времени занятия ставятся рядом, а не друг на друга.
// Группа — цепочка пересекающихся слотов; внутри неё каждый слот получает первую свободную колонку,
// ширина колонки = 100% / число колонок группы. Возвращает Map: id слота -> { lane, lanes }.
function wgLayoutDay(daySlots) {
  const items = daySlots.map(function (s) {
    const start = timeToMin(s.time);
    return { id: s.id, start: start, end: start + (parseInt(s.dur) || 0) };
  }).sort(function (a, b) { return a.start - b.start || a.end - b.end; });

  const layout = new Map();
  let group = [], laneEnds = [], groupEnd = -1;
  function closeGroup() {
    group.forEach(function (it) { layout.set(it.id, { lane: it.lane, lanes: laneEnds.length }); });
    group = []; laneEnds = []; groupEnd = -1;
  }
  items.forEach(function (it) {
    if (group.length && it.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex(function (end) { return end <= it.start; });
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    it.lane = lane;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  });
  closeGroup();
  return layout;
}

// Inline-стиль позиции слота по колонке (пусто — слот один, на всю ширину дня)
// gutter — px справа, которые занятия не занимают (в админке там «+» для добавления ещё одного занятия в этот час)
function wgLaneStyle(pos, gutter) {
  if (!pos || pos.lanes < 2) return '';
  const g = gutter || 0;
  return 'left:calc((100% - ' + g + 'px) * ' + (pos.lane / pos.lanes) + ' + 2px);width:calc((100% - ' + g + 'px) / ' + pos.lanes + ' - 4px);right:auto;';
}

// Высота одного часа в px — из CSS-переменной --wg-row-h сетки (единый источник с css/week-grid.css)
function wgRowHeight(grid) {
  return parseFloat(getComputedStyle(grid).getPropertyValue('--wg-row-h')) || 60;
}
