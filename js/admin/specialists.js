// Админка: график работы специалиста — вкладки «График работы», «Отсутствия», «Особые часы работы» в окне
// сотрудника (js/admin/staff.js открывает окно и вызывает trmOpen) и окна периода графика и исключения.
// Кем и где работает специалист — его роли с филиалом; часы работы можно задать только в филиалах ролей.

// ── Форматирование графика ─────────────────────────────────────
// 'YYYY-MM-DD' -> 'ДД.ММ.ГГГГ' (или 'ДД.ММ' без года)
function fmtDateRu(s, withYear) {
  const p = String(s).split('-');
  return p[2] + '.' + p[1] + (withYear === false ? '' : '.' + p[0]);
}
function fmtDateRange(from, to, withYear) {
  return to && to !== from ? fmtDateRu(from, withYear) + ' – ' + fmtDateRu(to, withYear) : fmtDateRu(from, withYear);
}
// Филиалов больше одного — у интервалов показываем филиал
function multiLocations() { return LOCATIONS.length > 1; }
function ivText(list) {
  return (list || []).map(function (i) {
    const l = multiLocations() ? findLocation(i.location_id) : null;
    return i.from + '–' + i.to + (l ? ' (' + escAttr(l.name) + ')' : '');
  }).join(', ');
}
function todayStr() { return fmtLocalDate(new Date()); }

// Сводка недели: подряд идущие дни с одинаковыми часами — одной строкой («Пн–Чт 07:00–11:00, 17:00–21:00»)
function weekSummaryHtml(week) {
  const rows = [];
  LOC_DAYS.forEach(function (d) {
    const w = (week || []).find(function (x) { return x.day === d; });
    const text = w && w.intervals && w.intervals.length ? ivText(w.intervals) : '';
    const last = rows[rows.length - 1];
    if (last && last.text === text) last.to = d; else rows.push({ from: d, to: d, text: text });
  });
  return rows.map(function (r) {
    const days = LOC_DAYS_SHORT[r.from] + (r.to !== r.from ? '–' + LOC_DAYS_SHORT[r.to] : '');
    return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:1.7;color:' + (r.text ? '#00BAB3' : '#9ca3af') + '">' +
      '<span>' + days + '</span><span class="u-right">' + (r.text || 'выходной') + '</span></div>';
  }).join('');
}

// ── Вкладки графика в окне сотрудника ─────────────────────────────
let trmHours = { schedules: [], exceptions: [] };

// Филиалы открытого в окне специалиста (филиалы его ролей): часы работы можно задать только в них
let trmSpecLocs = [];
// Из них — доступные этому администратору: только в этих филиалах он добавляет и меняет часы
function trmLocs() {
  return admLocs().filter(function (l) { return trmSpecLocs.indexOf(Number(l.id)) >= 0; });
}
const TRM_NO_LOCS = 'У специалиста нет филиалов, в которых вы можете задать часы. Филиалы специалисту назначает главный управляющий';

// Заполнить вкладки графика в окне сотрудника (#staff-modal) и загрузить данные специалиста.
// specId — специалист, locs — филиалы его ролей (часы работы можно задать только в них)
function trmOpen(specId, locs) {
  trmSpecLocs = (locs || []).slice();
  document.getElementById('st-hours-body').innerHTML =
    // «Только активные» (по умолчанию) — без завершённых периодов; та же раскладка, что у «Прошедшие» на вкладках исключений
    '<div class="u-flex u-justify-between u-items-start u-gap-12 u-mb-10">' +
    '<div class="u-text-small u-muted">Недельный график на период (например, по месяцам). ' +
    'Вне периодов специалист не работает. У каждого интервала — филиал; часы — в пределах режима работы этого филиала.</div>' +
    '<label class="u-flex u-items-center u-gap-6 u-text-small u-nowrap u-pointer"><input type="checkbox" id="trm-sched-active" checked> Только активные</label>' +
    '</div>' +
    '<div id="trm-sched-list"></div>' +
    '<button type="button" class="btn-primary" id="trm-sched-add">+ Добавить период</button>';
  document.getElementById('st-off-body').innerHTML = trmExcPaneHtml('off', 'Даты, когда специалист не работает: сборы, соревнования, отпуск, больничный.', '+ Добавить отсутствие');
  document.getElementById('st-custom-body').innerHTML = trmExcPaneHtml('custom', 'Даты, когда специалист работает по другим часам. Особые часы полностью заменяют график в эти дни.', '+ Добавить особые часы');

  document.getElementById('trm-sched-add').onclick = function () { openScheduleModal(specId, null); };
  document.getElementById('trm-sched-active').onchange = trmRenderSchedules;
  ['off', 'custom'].forEach(function (type) {
    document.getElementById('trm-exc-add-' + type).onclick = function () { openExceptionModal(specId, null, type); };
    document.getElementById('trm-exc-past-' + type).onchange = trmRenderExceptions;
  });
  // Ред./удалить в списках периодов и исключений (окно одно на всех — обработчик заменяется, а не добавляется)
  document.getElementById('staff-modal').onclick = function (e) {
    var b = e.target.closest('[data-sched-edit],[data-sched-del],[data-exc-edit],[data-exc-del]');
    if (!b) return;
    if (b.hasAttribute('data-sched-edit')) openScheduleModal(specId, trmHours.schedules.find(function (s) { return s.id === +b.getAttribute('data-sched-edit'); }));
    if (b.hasAttribute('data-sched-del')) deleteSchedule(specId, +b.getAttribute('data-sched-del'));
    if (b.hasAttribute('data-exc-edit')) {
      var exc = trmHours.exceptions.find(function (x) { return x.id === +b.getAttribute('data-exc-edit'); });
      if (exc) openExceptionModal(specId, exc, exc.type);
    }
    if (b.hasAttribute('data-exc-del')) deleteException(specId, +b.getAttribute('data-exc-del'));
  };
  trmHours = { schedules: [], exceptions: [] };
  trmReloadHours(specId);
}

// ── Периоды и исключения в модалке ─────────────────────────────
async function trmReloadHours(specId) {
  try { trmHours = await SpecialistHoursAPI.list(specId); } catch (e) { return; }
  trmRenderSchedules();
  trmRenderExceptions();
}

// После изменения графика: обновить списки на вкладках
async function trmHoursChanged(specId) {
  await trmReloadHours(specId);
}

function trmItemButtons(attr, id) {
  return '<div class="u-flex u-gap-4 u-shrink-0">' +
    '<button type="button" class="action-btn confirm btn-sm" data-' + attr + '-edit="' + id + '" title="Изменить" aria-label="Изменить">' + ICO_EDIT + '</button>' +
    '<button type="button" class="action-btn cancel btn-sm" data-' + attr + '-del="' + id + '" title="Удалить" aria-label="Удалить">✕</button></div>';
}

function trmRenderSchedules() {
  const el = document.getElementById('trm-sched-list');
  if (!el) return;
  const list = trmHours.schedules || [];
  if (!list.length) {
    el.innerHTML = '<div class="u-text-ui u-danger u-mb-12">Периодов нет — специалист не будет доступен в расписании.</div>';
    return;
  }
  const d = todayStr();
  // «Только активные»: действующие и будущие периоды; завершённые (дата окончания прошла) скрыты
  const onlyActive = document.getElementById('trm-sched-active').checked;
  const shown = onlyActive ? list.filter(function (s) { return !(s.date_to && s.date_to < d); }) : list;
  if (!shown.length) {
    el.innerHTML = '<div class="u-text-ui u-danger u-mb-12">Действующих и будущих периодов нет — специалист не будет доступен в расписании. '
      + 'Завершённые периоды видны, если снять «Только активные».</div>';
    return;
  }
  el.innerHTML = shown.map(function (s) {
    const past = s.date_to && s.date_to < d;
    const now = s.date_from <= d && !past;
    return '<div class="lib-card" style="margin-bottom:8px;padding:12px' + (past ? ';opacity:.55' : '') + '">' +
      '<div class="u-flex u-justify-between u-items-start u-gap-8 u-mb-6">' +
      // название и плашка статуса — одной строкой по центру, чтобы плашка не наезжала на даты
      '<div><div class="u-flex u-items-center u-wrap u-gap-6 u-strong u-text-ui u-lh-tight">' +
      '<span>' + escAttr(s.name) + '</span>' +
      (now ? '<span class="lib-meta-tag u-m-0 u-brand-dark u-bg-brand-light">действует</span>' : '') +
      (past ? '<span class="lib-meta-tag tag-muted u-m-0">завершён</span>' : '') + '</div>' +
      '<div class="u-text-small u-muted u-mt-6">' + fmtDateRu(s.date_from) + ' – ' + (s.date_to ? fmtDateRu(s.date_to) : 'бессрочно') + '</div></div>' +
      trmItemButtons('sched', s.id) + '</div>' +
      weekSummaryHtml(s.work_hours) + '</div>';
  }).join('');
}

// Содержимое вкладки исключений одного типа: off — «Отсутствия», custom — «Особые часы работы»
function trmExcPaneHtml(type, hint, addLabel) {
  return '<div class="u-flex u-justify-between u-items-start u-gap-12 u-mb-10">' +
    '<div class="u-text-small u-muted">' + hint + '</div>' +
    '<label class="u-flex u-items-center u-gap-6 u-text-small u-nowrap u-pointer"><input type="checkbox" id="trm-exc-past-' + type + '"> Прошедшие</label>' +
    '</div>' +
    '<div id="trm-exc-list-' + type + '"></div>' +
    '<button type="button" class="btn-primary" id="trm-exc-add-' + type + '">' + addLabel + '</button>';
}

function trmRenderExceptions() {
  ['off', 'custom'].forEach(trmRenderExceptionsOfType);
}

function trmRenderExceptionsOfType(type) {
  const el = document.getElementById('trm-exc-list-' + type);
  if (!el) return;
  const showPast = document.getElementById('trm-exc-past-' + type).checked;
  const d = todayStr();
  const off = type === 'off';
  const list = (trmHours.exceptions || []).filter(function (e) { return e.type === type && (showPast || e.date_to >= d); });
  if (!list.length) {
    const what = off ? 'отсутствий' : 'особых часов';
    el.innerHTML = '<div class="u-text-ui u-muted u-mb-12">' + (showPast ? 'Нет ' + what : 'Предстоящих ' + what + ' нет') + '</div>';
    return;
  }
  el.innerHTML = list.map(function (e) {
    const past = e.date_to < d;
    // Отсутствие — причина; особые часы — интервалы и причина. Причины нет — не выводим
    const details = off
      ? (e.reason ? escAttr(e.reason) : '')
      : ivText(e.work_hours) + (e.reason ? '<span class="u-muted"> · ' + escAttr(e.reason) + '</span>' : '');
    return '<div class="lib-card" style="margin-bottom:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px' + (past ? ';opacity:.55' : '') + '">' +
      '<div class="u-min-w-0"><div class="u-strong u-text-ui">' + fmtDateRange(e.date_from, e.date_to) + '</div>' +
      (details ? '<div style="font-size:12px;color:' + (off ? '#d97706' : '#00BAB3') + '">' + details + '</div>' : '') + '</div>' +
      trmItemButtons('exc', e.id) + '</div>';
  }).join('');
}

async function deleteSchedule(specId, id) {
  const s = trmHours.schedules.find(function (x) { return x.id === id; });
  if (!await uiConfirm('Удалить период графика' + (s ? ' «' + s.name + '»' : '') + '?')) return;
  try { await SpecialistHoursAPI.deleteSchedule(id); } catch (e) { return; }
  showToast('Период графика удалён', 'success');
  await trmHoursChanged(specId);
}

async function deleteException(specId, id) {
  const exc = trmHours.exceptions.find(function (x) { return x.id === id; });
  const custom = exc && exc.type === 'custom';
  if (!await uiConfirm(custom ? 'Удалить особые часы работы?' : 'Удалить отсутствие?')) return;
  try { await SpecialistHoursAPI.deleteException(id); } catch (e) { return; }
  showToast(custom ? 'Особые часы удалены' : 'Отсутствие удалено', 'success');
  await trmHoursChanged(specId);
}

// ── Редактор интервалов (несколько интервалов в день, у каждого — филиал) ──
// Контекст списка интервалов (ctx): { day: 0…6 } — день недели в периоде графика;
// { from, to } — диапазон дат особых часов. Время строки — только в часах работы её филиала в этом контексте.

// Часы филиала в контексте: { range } (range null — режим филиала не задан, весь день) | { closed } | { empty }
function ivCtxHours(ctx, locId) {
  if (ctx.day !== undefined) {
    const h = locDayHours(locId, ctx.day);   // undefined — режим не задан, null — филиал не работает
    return h === null ? { closed: true } : { range: h || null };
  }
  return excBranchRange(locId, ctx.from, ctx.to);
}

// Филиалы, работающие в этом контексте
// all — среди всех филиалов (для показа чужого интервала), иначе — среди доступных этому администратору
function ivOpenLocations(ctx, all) {
  return (all ? LOCATIONS : trmLocs()).filter(function (l) { const h = ivCtxHours(ctx, l.id); return !h.closed && !h.empty; });
}
// Интервал в филиале, которого у этого администратора нет: показываем, но менять нельзя
function ivForeign(iv) {
  return !!(iv && iv.location_id) && !admLocs().some(function (l) { return Number(l.id) === Number(iv.location_id); });
}

// Время — только в часах работы филиала: range = {from, to} в минутах; null — весь день.
function ivTimeOptions(range, selected, isEnd) {
  const from = range ? range.from : 0;
  const to = range ? range.to : 24 * 60 - 15;
  // начало — не позже чем за 15 минут до закрытия, окончание — не раньше чем через 15 минут после открытия
  const first = isEnd ? from + 15 : from;
  const last = isEnd ? to : to - 15;
  let o = '<option value=""></option>';
  let found = !selected;
  for (let m = first; m <= last; m += 15) {
    const t = minToTime(m);
    if (t === selected) found = true;
    o += '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + t + '</option>';
  }
  // Сохранённое время вне часов филиала (режим филиала изменили) — показываем, чтобы не потерять; сохранить не даст сервер
  if (!found) o += '<option value="' + selected + '" selected>' + selected + ' (вне режима филиала)</option>';
  return o;
}

function ivCtx(list) {
  try { return JSON.parse(list.getAttribute('data-ctx')); } catch (e) { return { day: 0 }; }
}

// Строка интервала: филиал (выбор скрыт, если филиал один) + время с–по в часах этого филиала
function ivRowHtml(iv, ctx) {
  iv = iv || {};
  const foreign = ivForeign(iv);
  const lock = foreign ? ' disabled title="Часы работы в другом филиале — их меняет администратор этого филиала или системы"' : '';
  const open = ivOpenLocations(ctx, foreign);
  let locId = iv.location_id ? Number(iv.location_id) : (open[0] ? open[0].id : (trmLocs()[0] ? trmLocs()[0].id : 0));
  let locOpts = locOptionsHtml({ list: open }).replace('value="' + locId + '"', 'value="' + locId + '" selected');
  // Сохранённый филиал в этот день не работает (или стал недействующим) — показываем, чтобы не потерять
  if (!open.some(function (l) { return l.id === locId; })) {
    const l = findLocation(locId);
    locOpts += '<option value="' + locId + '" selected>' + escAttr(l ? l.name : 'Филиал ' + locId) + ' (не работает)</option>';
  }
  const h = ivCtxHours(ctx, locId);
  const range = h.range || null;
  const locSelect = '<select class="form-input iv-loc"' + lock + ' style="width:auto;max-width:170px;padding:4px 8px' + (multiLocations() ? '' : ';display:none') + '">' + locOpts + '</select>';
  return '<div class="iv-row u-flex u-items-center u-gap-4 u-mb-4">' +
    locSelect +
    '<select class="form-input iv-from u-w-auto u-p-4-8"' + lock + '>' + ivTimeOptions(range, iv.from || '', false) + '</select>' +
    '<span>–</span>' +
    '<select class="form-input iv-to u-w-auto u-p-4-8"' + lock + '>' + ivTimeOptions(range, iv.to || '', true) + '</select>' +
    (foreign ? '' : '<button type="button" class="action-btn cancel btn-sm" data-iv-del title="Удалить интервал">✕</button>') +
    '</div>';
}

// Список интервалов + кнопка «+ интервал»; пустой список показывается как «выходной» (css .iv-list:empty).
// Контекст хранится в data-ctx списка — по нему строятся новые строки и пересчитывается время при смене филиала.
function ivListHtml(list, ctx) {
  return '<div class="iv-list" data-ctx=\'' + JSON.stringify(ctx) + '\'>' +
    (list || []).map(function (iv) { return ivRowHtml(iv, ctx); }).join('') + '</div>' +
    '<button type="button" class="btn-ghost btn-sm" data-iv-add>+ интервал</button>';
}

function readIntervals(container) {
  return Array.from(container.querySelectorAll('.iv-row')).map(function (r) {
    return {
      from: r.querySelector('.iv-from').value,
      to: r.querySelector('.iv-to').value,
      location_id: parseInt(r.querySelector('.iv-loc').value) || null,
    };
  }).filter(function (iv) { return iv.from || iv.to; });
}

// Недельный шаблон: у каждого дня — интервалы в часах работы филиалов в этот день недели
function weekEditorHtml(week) {
  return LOC_DAYS.map(function (d, i) {
    const w = (week || []).find(function (x) { return x.day === d; });
    const intervals = w ? w.intervals : [];
    const ctx = { day: i };
    const closed = !ivOpenLocations(ctx).length;   // в этот день не работает ни один филиал
    let cell;
    if (closed && !intervals.length) {
      cell = '<div class="u-text-small u-faint u-py-6">' + (multiLocations() ? 'филиалы не работают' : 'филиал не работает') + '</div>';
    } else {
      // Интервалы, сохранённые до изменения режима филиала, — показываем, чтобы их можно было исправить или удалить
      cell = (closed ? '<div class="u-text-small u-danger u-py-6">филиал не работает — удалите интервалы</div>' : '') +
        ivListHtml(intervals, ctx);
    }
    return '<div class="iv-day u-flex u-gap-8 u-items-start u-py-6 u-border-bottom" data-day="' + d + '">' +
      '<div style="width:100px;flex-shrink:0;font-size:13px;padding-top:6px;color:' + (closed ? '#9ca3af' : '#00BAB3') + '">' + d + '</div>' +
      '<div class="u-flex-1">' + cell + '</div></div>';
  }).join('');
}

function readWeekEditor(root) {
  return Array.from(root.querySelectorAll('.iv-day')).map(function (d) {
    return { day: d.getAttribute('data-day'), intervals: readIntervals(d) };
  });
}

// Заполнить день интервалами; интервал в филиале, который в этот день не работает, пропускаем
function setDayIntervals(root, day, intervals) {
  const list = root.querySelector('.iv-day[data-day="' + day + '"] .iv-list');
  if (!list) return;
  const ctx = ivCtx(list);
  list.innerHTML = intervals.filter(function (iv) { return !ivCtxHours(ctx, iv.location_id).closed; })
    .map(function (iv) { return ivRowHtml(iv, ctx); }).join('');
}

// «+ интервал», «✕» и смена филиала строки (время пересчитывается под режим нового филиала) внутри root
function bindIntervalEditor(root) {
  root.addEventListener('click', function (e) {
    const add = e.target.closest('[data-iv-add]');
    if (add) {
      if (!trmLocs().length) { showToast(TRM_NO_LOCS, 'error'); return; }
      const list = add.previousElementSibling;
      list.insertAdjacentHTML('beforeend', ivRowHtml(null, ivCtx(list)));
      return;
    }
    const del = e.target.closest('[data-iv-del]');
    if (del) del.closest('.iv-row').remove();
  });
  root.addEventListener('change', function (e) {
    if (!e.target.classList.contains('iv-loc')) return;
    const row = e.target.closest('.iv-row');
    // выбранное время сохраняем; вне режима нового филиала оно будет помечено
    const iv = { from: row.querySelector('.iv-from').value, to: row.querySelector('.iv-to').value, location_id: parseInt(e.target.value) };
    row.outerHTML = ivRowHtml(iv, ivCtx(row.closest('.iv-list')));
  });
}

// Часы филиала, общие для всех его рабочих дней в диапазоне дат (для особых часов):
// { range } — range null, если режим филиала не задан; { closed: true } — в эти даты филиал не работает;
// { empty: true } — общих часов нет
function excBranchRange(locId, from, to) {
  let range = null, open = 0, limited = false;
  const d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00');
  for (let n = 0; d <= end && n <= 366; d.setDate(d.getDate() + 1), n++) {
    const h = locDayHours(locId, (d.getDay() + 6) % 7);
    if (h === null) continue;
    open++;
    if (h === undefined) continue;
    limited = true;
    range = range ? { from: Math.max(range.from, h.from), to: Math.min(range.to, h.to) } : { from: h.from, to: h.to };
  }
  if (!open) return { closed: true };
  if (limited && range.to - range.from < 15) return { empty: true };
  return { range: limited ? range : null };
}

// ── Период графика ─────────────────────────────────────────────
function openScheduleModal(specId, s) {
  const small = 'font-size:11px;padding:4px 8px';
  // «Заполнить по филиалу»: филиал (если их несколько) и дни недели — отмечены дни, когда филиал работает.
  // Заполняются только отмеченные дни, остальные не меняются
  const fillLoc = '<select class="form-input" id="sch-fill-loc" style="width:auto;max-width:170px;padding:4px 8px;font-size:12px' + (multiLocations() ? '' : ';display:none') + '">' +
    locOptionsHtml({ list: trmLocs() }) + '</select>';
  const fillDays = '<span class="u-flex u-gap-4 u-wrap" id="sch-fill-days">' +
    LOC_DAYS.map(function (d, i) {
      return '<label class="sch-fill-day u-flex u-items-center u-text-small u-pointer u-gap-4">' +
        '<input type="checkbox" data-i="' + i + '">' + LOC_DAYS_SHORT[d] + '</label>';
    }).join('') + '</span>';
  const body =
    '<div class="form-field"><label class="form-label">Название</label>' +
    '<input class="form-input" id="sch-name" required value="' + escAttr(s ? s.name : '') + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">С</label><input type="date" class="form-input" id="sch-from" required value="' + (s ? s.date_from : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">По</label>' +
    '<input type="date" class="form-input" id="sch-to" value="' + (s && s.date_to ? s.date_to : '') + '"></div>' +
    '</div>' +
    '<div class="u-flex u-gap-8 u-wrap u-items-center u-my-4">' +
    fillLoc + fillDays +
    '<button type="button" class="btn-ghost" style="' + small + '" data-sch-fill="loc">Заполнить по филиалу</button>' +
    '</div>' +
    '<div class="u-mb-6"><button type="button" class="btn-ghost" style="' + small + '" data-sch-fill="weekdays">Пн → на все будни</button></div>' +
    // Нет ни одного филиала специалиста, доступного этому администратору, — часы задать негде
    (trmLocs().length ? '' : '<div class="set-warn u-mb-10">' + TRM_NO_LOCS + '</div>') +
    '<div id="sch-week">' + weekEditorHtml(s ? s.work_hours : null) + '</div>';
  const el = openFormModal('sched-modal', s ? 'Период графика' : 'Новый период графика', body, async function () {
    const name = document.getElementById('sch-name').value.trim();
    if (!name) { showToast('Укажите название периода', 'error'); return false; }
    const from = document.getElementById('sch-from').value;
    if (!from) { showToast('Укажите дату начала периода', 'error'); return false; }
    await SpecialistHoursAPI.saveSchedule({
      id: s ? s.id : undefined,
      specialist_id: specId,
      name: name,
      date_from: from,
      date_to: document.getElementById('sch-to').value || null,
      work_hours: readWeekEditor(el),
    });
    showToast('Период графика сохранён', 'success');
    await trmHoursChanged(specId);
    return true;
  }, null, 'u-max-w-560');
  el.querySelector('.admin-modal').style.maxWidth = '600px';
  bindIntervalEditor(el);
  // Дни для заполнения: по умолчанию отмечены дни, когда выбранный филиал работает; в выходные филиала — недоступны
  const syncFillDays = function () {
    const locId = parseInt(document.getElementById('sch-fill-loc').value);
    el.querySelectorAll('#sch-fill-days input').forEach(function (c) {
      const open = locDayHours(locId, +c.getAttribute('data-i')) !== null;
      c.disabled = !open;
      c.checked = open;
      c.parentElement.style.opacity = open ? '' : '.4';
    });
  };
  document.getElementById('sch-fill-loc').onchange = syncFillDays;
  syncFillDays();
  // Отмеченные дни — часы выбранного филиала одним интервалом на весь день; остальные дни не меняются
  el.querySelector('[data-sch-fill="loc"]').onclick = function () {
    const locId = parseInt(document.getElementById('sch-fill-loc').value);
    const days = Array.from(el.querySelectorAll('#sch-fill-days input:checked')).map(function (c) { return +c.getAttribute('data-i'); });
    if (!days.length) { showToast('Отметьте дни', 'error'); return; }
    days.forEach(function (i) {
      const h = locDayHours(locId, i);   // undefined — режим филиала не задан (весь день)
      const iv = h ? { from: minToTime(h.from), to: minToTime(h.to), location_id: locId } : { from: '', to: '', location_id: locId };
      setDayIntervals(el, LOC_DAYS[i], [iv]);
    });
  };
  // Интервалы понедельника — на вторник…пятницу
  el.querySelector('[data-sch-fill="weekdays"]').onclick = function () {
    const mon = readIntervals(el.querySelector('.iv-day[data-day="Понедельник"]'));
    LOC_DAYS.slice(1, 5).forEach(function (d) { setDayIntervals(el, d, mon); });
  };
}

// ── Исключение: отсутствие (off) или особые часы работы (custom) ──
function openExceptionModal(specId, e, type) {
  const custom = type === 'custom';
  const body =
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">С</label><input type="date" class="form-input" id="exc-from" required value="' + (e ? e.date_from : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">По</label>' +
    '<input type="date" class="form-input" id="exc-to" required value="' + (e ? e.date_to : '') + '"></div>' +
    '</div>' +
    (custom
      ? '<div class="form-field" id="exc-iv-wrap"><label class="form-label">Часы работы в эти даты</label><div id="exc-iv-body"></div></div>'
      : '') +
    '<div class="form-field"><label class="form-label">Причина</label>' +
    '<input class="form-input" id="exc-reason" value="' + escAttr((e && e.reason) || '') + '"></div>';
  const title = custom ? (e ? 'Особые часы работы' : 'Новые особые часы работы') : (e ? 'Отсутствие' : 'Новое отсутствие');
  const el = openFormModal('exc-modal', title, body, async function () {
    // Обе даты обязательны, даже для одного дня
    const from = document.getElementById('exc-from').value;
    const to = document.getElementById('exc-to').value;
    if (!from) { showToast('Укажите дату «С»', 'error'); return false; }
    if (!to) { showToast('Укажите дату «По»', 'error'); return false; }
    if (to < from) { showToast('Дата «По» раньше даты «С»', 'error'); return false; }
    await SpecialistHoursAPI.saveException({
      id: e ? e.id : undefined,
      specialist_id: specId,
      date_from: from,
      date_to: to,
      type: type,
      work_hours: custom ? readIntervals(document.getElementById('exc-iv-wrap')) : null,
      reason: document.getElementById('exc-reason').value.trim(),
    });
    showToast(custom ? 'Особые часы сохранены' : 'Отсутствие сохранено', 'success');
    await trmHoursChanged(specId);
    return true;
  }, null, 'u-max-w-560');
  if (!custom) return;
  el.querySelector('.admin-modal').style.maxWidth = '560px';
  bindIntervalEditor(el);

  // Интервалы — в часах своего филиала, общих для выбранных дат; пересобираем при смене дат, сохраняя введённое
  const ivBody = document.getElementById('exc-iv-body');
  const hint = function (text) { return '<div class="u-text-small u-muted u-py-4">' + text + '</div>'; };
  let saved = e && e.work_hours && e.work_hours.length ? e.work_hours : [];
  const renderIntervals = function () {
    if (ivBody.querySelector('.iv-list')) saved = readIntervals(ivBody);
    const from = document.getElementById('exc-from').value;
    const to = document.getElementById('exc-to').value;
    if (!from || !to) { ivBody.innerHTML = hint('Сначала выберите даты «С» и «По»'); return; }
    if (to < from) { ivBody.innerHTML = hint('Дата «По» раньше даты «С»'); return; }
    const ctx = { from: from, to: to };
    if (!ivOpenLocations(ctx).length && !saved.length) {
      ivBody.innerHTML = hint('В эти даты филиалы не работают или у них нет общих часов — измените даты');
      return;
    }
    ivBody.innerHTML = ivListHtml(saved.length ? saved : [null], ctx);
  };
  document.getElementById('exc-from').addEventListener('change', renderIntervals);
  document.getElementById('exc-to').addEventListener('change', renderIntervals);
  renderIntervals();
}
