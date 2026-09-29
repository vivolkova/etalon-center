// Админка: специалисты, график работы специалиста
// Специалист не привязан к филиалу: филиал указывается у каждого интервала графика и особых часов.
// Специализация — типы из справочника specialist_type, может быть несколько (тренер и байкфиттер одновременно).

// ═══ TRAINERS ════════════════════════════════════════════════════════

// Панель «Специалисты» — карточки в формате библиотеки; неактивные — серым
function renderSpecialists() {
  const q = (document.getElementById('spec-search') ? document.getElementById('spec-search').value : '').toLowerCase();
  const locSel = document.getElementById('spec-loc-filter');
  let locFilter = null;
  if (locSel) {
    const cur = locSel.value;
    locSel.innerHTML = '<option value="">Все филиалы</option>' +
      LOCATIONS.map(function (l) { return '<option value="' + l.id + '">' + l.name + '</option>'; }).join('');
    locSel.value = cur;
    locFilter = locSel.value ? parseInt(locSel.value) : null;
  }
  const actSel = document.getElementById('spec-active-filter');
  const activeOnly = actSel && actSel.value === 'active';
  const items = SPECIALISTS_ALL.filter(function (t) {
    const okQ = !q || t.full.toLowerCase().includes(q) ||
      t.types.some(function (c) { return specTypeName(c).toLowerCase().includes(q); });
    // Филиал — где специалист работает по графику
    const okLoc = !locFilter || t.location_ids.indexOf(locFilter) >= 0;
    const okAct = !activeOnly || t.active;
    return okQ && okLoc && okAct;
  });
  const grid = document.getElementById('adm-specialists-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div class="lib-empty"><div style="font-size:13px;font-weight:600;margin-bottom:8px">Ничего не найдено</div><button class="btn-primary" style="font-size:12px;padding:8px 16px" onclick="openTrainerModal(null)">Добавить специалиста</button></div>';
    return;
  }
  grid.innerHTML = items.map(function (t) {
    // Плашки типов; цвет — как у связанной категории активности (trainer -> training и т.д.)
    const typesHtml = t.types.map(function (code) {
      const cat = ACTIVITY_CATS.find(function (c) { return c.spec_type === code; });
      return '<div class="lib-card-cat' + (cat ? ' cat-' + cat.code : '') + '">' + escAttr(specTypeName(code)) + '</div>';
    }).join('');
    // Филиалы — где специалист работает по графику и особым часам
    const locTags = t.location_ids.map(function (id) {
      const l = findLocation(id);
      return l ? '<span class="lib-meta-tag">' + escAttr(l.name) + '</span>' : '';
    }).join('');
    const inactive = !t.active;
    const cardStyle = inactive ? ' style="background:#f3f4f6;opacity:.65"' : '';
    const badge = inactive ? '<span class="lib-meta-tag" style="background:#e5e7eb;color:#6b7280">Неактивен</span>' : '';
    const actionsHtml =
      '<button class="action-btn confirm" style="font-size:11px;padding:4px 8px" onclick="openTrainerModal(' + t.id + ')">Ред.</button>';
    return '<div class="lib-card"' + cardStyle + '>' +
      '<div class="lib-card-header"><div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap">' + typesHtml + '</div>' +
      '<div class="lib-card-title">' + t.full + '</div>' +
      '</div></div>' +
      '<div class="lib-card-meta">' + badge + locTags +
      '<span class="lib-meta-tag">Опыт: ' + t.exp + ' лет</span>' +
      '</div>' +
      specHoursCardHtml(t) +
      '<div class="lib-card-footer">' +
      '<div></div>' +
      '<div class="lib-card-actions">' + actionsHtml + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

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
      '<span>' + days + '</span><span style="text-align:right">' + (r.text || 'выходной') + '</span></div>';
  }).join('');
}

// Период, действующий сегодня, иначе ближайший будущий
function currentSchedule(schedules) {
  const d = todayStr();
  const list = schedules || [];
  return list.find(function (s) { return s.date_from <= d && (!s.date_to || s.date_to >= d); }) ||
    list.filter(function (s) { return s.date_from > d; })[0] || null;
}

function excText(e) {
  return fmtDateRange(e.date_from, e.date_to) + ' · ' + (e.type === 'custom' ? ivText(e.work_hours) : 'не работает') +
    (e.reason ? ' · ' + escAttr(e.reason) : '');
}

// График на карточке специалиста: текущий период + ближайшие исключения
function specHoursCardHtml(t) {
  const s = currentSchedule(t.schedules);
  let html = '<div style="margin-top:10px;border-top:1px solid var(--line,#eee);padding-top:8px">';
  if (!s) {
    html += '<div style="font-size:12px;color:#ef4444">График работы не задан</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--ink-60);margin-bottom:2px">' +
      (s.date_from <= todayStr() ? 'График' : 'График с ' + fmtDateRu(s.date_from)) +
      ' «' + escAttr(s.name) + '»' + (s.date_to ? ' до ' + fmtDateRu(s.date_to) : '') + '</div>' +
      weekSummaryHtml(s.work_hours);
  }
  const exc = t.exceptions || [];
  exc.slice(0, 2).forEach(function (e) {
    html += '<div style="font-size:12px;line-height:1.7;color:#d97706">' + excText(e) + '</div>';
  });
  if (exc.length > 2) html += '<div style="font-size:12px;color:var(--ink-60)">и ещё ' + (exc.length - 2) + '</div>';
  return html + '</div>';
}

// ── Модалка специалиста: Основное / График работы / Отсутствия / Особые часы работы ─────
let trmHours = { schedules: [], exceptions: [] };

// Специализация — выпадающий список типов из справочника specialist_type (можно несколько).
// Отключённый в справочнике тип показываем, если он уже выбран
function trmTypesHtml(t) {
  const cur = t ? t.types : [];
  let list = SPEC_TYPES.slice();
  cur.forEach(function (code) {
    if (!list.some(function (x) { return x.code === code; })) list.push({ code: code, name: specTypeName(code) + ' (отключён)' });
  });
  return msHtml('trm-types', list.map(function (x) { return { value: x.code, label: x.name }; }), cur, '— Выберите специализацию —');
}

function openTrainerModal(id, tab) {
  var t = id ? SPECIALISTS_ALL.find(function (x) { return x.id === id; }) : null;
  var old = document.getElementById('trainer-tmp-modal'); if (old) old.remove();
  var el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'trainer-tmp-modal';
  // График и отсутствия — только у сохранённого специалиста
  var tabOff = t ? '' : ' disabled title="Сначала сохраните специалиста" style="opacity:.5;cursor:not-allowed"';
  el.innerHTML =
    '<div class="admin-modal" style="max-width:560px">' +
    '<div class="admin-modal-title">' + (t ? 'Редактировать специалиста' : 'Добавить специалиста') + '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">' +
    '<button type="button" class="chip" data-trm-tab="main">Основное</button>' +
    '<button type="button" class="chip" data-trm-tab="hours"' + tabOff + '>График работы</button>' +
    '<button type="button" class="chip" data-trm-tab="off"' + tabOff + '>Отсутствия</button>' +
    '<button type="button" class="chip" data-trm-tab="custom"' + tabOff + '>Особые часы работы</button>' +
    '</div>' +
    // ── Основное
    '<div data-trm-pane="main">' +
    '<div class="form-field"><label class="form-label">Полное имя</label><input class="form-input" id="trm-name" value="' + (t ? t.full : '') + '" placeholder="Имя Фамилия"></div>' +
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">Специализация</label>' + trmTypesHtml(t) + '</div>' +
    '<div class="form-field"><label class="form-label">Опыт (лет)</label><input class="form-input" id="trm-exp" value="' + (t ? t.exp : '') + '" type="number" min="0"></div>' +
    '</div>' +
    '<div class="form-field"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">' +
    '<input type="checkbox" id="trm-active"' + (!t || t.active ? ' checked' : '') + '> Активен</label></div>' +
    '<div class="admin-modal-actions">' +
    '<button class="btn-ghost" id="trm-cancel">Отмена</button>' +
    '<button class="btn-primary" id="trm-save">Сохранить</button>' +
    '</div></div>' +
    // ── График работы: периоды с недельным шаблоном
    '<div data-trm-pane="hours" style="display:none">' +
    '<div style="font-size:12px;color:var(--ink-60);margin-bottom:10px">Недельный график на период (например, по месяцам). ' +
    'Вне периодов специалист не работает. У каждого интервала — филиал; часы — в пределах режима работы этого филиала.</div>' +
    '<div id="trm-sched-list"></div>' +
    '<button type="button" class="btn-primary" id="trm-sched-add" style="font-size:12px;padding:8px 16px">+ Добавить период</button>' +
    '</div>' +
    // ── Исключения: отсутствия (off) и особые часы работы (custom) — отдельные вкладки
    trmExcPaneHtml('off', 'Даты, когда специалист не работает: сборы, соревнования, отпуск, больничный.', '+ Добавить отсутствие') +
    trmExcPaneHtml('custom', 'Даты, когда специалист работает по другим часам. Особые часы полностью заменяют график в эти дни.', '+ Добавить особые часы') +
    '<div class="admin-modal-actions" id="trm-close-actions" style="display:none"><button class="btn-ghost" id="trm-close">Закрыть</button></div>' +
    '</div>';
  document.body.appendChild(el);
  document.getElementById('trm-cancel').onclick = function () { el.remove(); };
  document.getElementById('trm-close').onclick = function () { el.remove(); };
  document.getElementById('trm-save').onclick = function () { saveTrainer(t ? t.id : null); };

  el.querySelectorAll('[data-trm-tab]').forEach(function (b) {
    b.onclick = function () { if (!b.disabled) trmSwitchTab(b.getAttribute('data-trm-tab')); };
  });
  trmSwitchTab(t ? (tab || 'main') : 'main');
  if (!t) return;

  document.getElementById('trm-sched-add').onclick = function () { openScheduleModal(t.id, null); };
  ['off', 'custom'].forEach(function (type) {
    document.getElementById('trm-exc-add-' + type).onclick = function () { openExceptionModal(t.id, null, type); };
    document.getElementById('trm-exc-past-' + type).onchange = trmRenderExceptions;
  });
  // Ред./удалить в списках периодов и исключений
  el.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sched-edit],[data-sched-del],[data-exc-edit],[data-exc-del]');
    if (!b) return;
    if (b.hasAttribute('data-sched-edit')) openScheduleModal(t.id, trmHours.schedules.find(function (s) { return s.id === +b.getAttribute('data-sched-edit'); }));
    if (b.hasAttribute('data-sched-del')) deleteSchedule(t.id, +b.getAttribute('data-sched-del'));
    if (b.hasAttribute('data-exc-edit')) {
      var exc = trmHours.exceptions.find(function (x) { return x.id === +b.getAttribute('data-exc-edit'); });
      if (exc) openExceptionModal(t.id, exc, exc.type);
    }
    if (b.hasAttribute('data-exc-del')) deleteException(t.id, +b.getAttribute('data-exc-del'));
  });
  trmHours = { schedules: [], exceptions: [] };
  trmReloadHours(t.id);
}

function trmSwitchTab(tab) {
  document.querySelectorAll('#trainer-tmp-modal [data-trm-tab]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-trm-tab') === tab);
  });
  document.querySelectorAll('#trainer-tmp-modal [data-trm-pane]').forEach(function (p) {
    p.style.display = p.getAttribute('data-trm-pane') === tab ? '' : 'none';
  });
  // У «Основного» свои кнопки Отмена/Сохранить; на остальных вкладках изменения сохраняются сразу
  document.getElementById('trm-close-actions').style.display = tab === 'main' ? 'none' : '';
}

async function saveTrainer(id) {
  const fullName = document.getElementById('trm-name').value.trim();
  if (!fullName) { showToast('Введите имя', 'error'); return; }
  const types = msValues('trm-types');
  if (!types.length) { showToast('Выберите специализацию', 'error'); return; }
  const shortName = fullName.split(' ').map((w, i) => i === 0 ? w : w[0] + '.').join(' ');
  const apiData = {
    active: document.getElementById('trm-active').checked ? 1 : 0,
    full_name: fullName,
    name: shortName,
    types: types,
    experience: parseInt(document.getElementById('trm-exp').value) || 0,
  };
  let newId = null;
  try {
    if (id) {
      await SpecialistsAPI.update({ id, ...apiData });
      showToast('Специалист обновлён', 'success');
    } else {
      const res = await SpecialistsAPI.create(apiData);
      newId = res && res.id ? parseInt(res.id) : null;
      showToast('Специалист добавлен. Задайте график работы', 'success');
    }
    var ttm = document.getElementById('trainer-tmp-modal'); if (ttm) ttm.remove();
    await Promise.allSettled([loadSpecialists(), loadSpecialistsAll()]);
    renderSpecialists();
    // Новый специалист — сразу на вкладку графика
    if (newId) openTrainerModal(newId, 'hours');
  } catch (e) {
    // сообщение сервера уже показано (apiRequest), форма остаётся открытой
  }
}

// ── Периоды и исключения в модалке ─────────────────────────────
async function trmReloadHours(specId) {
  try { trmHours = await SpecialistHoursAPI.list(specId); } catch (e) { return; }
  trmRenderSchedules();
  trmRenderExceptions();
}

// После изменения графика: обновить списки в модалке и карточки специалистов
async function trmHoursChanged(specId) {
  await trmReloadHours(specId);
  await loadSpecialistsAll();
  renderSpecialists();
}

function trmItemButtons(attr, id) {
  return '<div style="display:flex;gap:4px;flex-shrink:0">' +
    '<button type="button" class="action-btn confirm" style="font-size:11px;padding:4px 8px" data-' + attr + '-edit="' + id + '">Ред.</button>' +
    '<button type="button" class="action-btn cancel" style="font-size:11px;padding:4px 8px" data-' + attr + '-del="' + id + '">✕</button></div>';
}

function trmRenderSchedules() {
  const el = document.getElementById('trm-sched-list');
  if (!el) return;
  const list = trmHours.schedules || [];
  if (!list.length) {
    el.innerHTML = '<div style="font-size:13px;color:#ef4444;margin-bottom:12px">Периодов нет — специалист не будет доступен в расписании.</div>';
    return;
  }
  const d = todayStr();
  el.innerHTML = list.map(function (s) {
    const past = s.date_to && s.date_to < d;
    const now = s.date_from <= d && !past;
    return '<div class="lib-card" style="margin-bottom:8px;padding:12px' + (past ? ';opacity:.55' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">' +
      // название и плашка статуса — одной строкой по центру, чтобы плашка не наезжала на даты
      '<div><div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-weight:600;font-size:13px;line-height:1.4">' +
      '<span>' + escAttr(s.name) + '</span>' +
      (now ? '<span class="lib-meta-tag" style="margin:0;background:var(--green-light);color:var(--green-dark)">действует</span>' : '') +
      (past ? '<span class="lib-meta-tag" style="margin:0;background:#e5e7eb;color:#6b7280">завершён</span>' : '') + '</div>' +
      '<div style="font-size:12px;color:var(--ink-60);margin-top:6px">' + fmtDateRu(s.date_from) + ' – ' + (s.date_to ? fmtDateRu(s.date_to) : 'бессрочно') + '</div></div>' +
      trmItemButtons('sched', s.id) + '</div>' +
      weekSummaryHtml(s.work_hours) + '</div>';
  }).join('');
}

// Вкладка исключений одного типа: off — «Отсутствия», custom — «Особые часы работы»
function trmExcPaneHtml(type, hint, addLabel) {
  return '<div data-trm-pane="' + type + '" style="display:none">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">' +
    '<div style="font-size:12px;color:var(--ink-60)">' + hint + '</div>' +
    '<label style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;cursor:pointer"><input type="checkbox" id="trm-exc-past-' + type + '"> Прошедшие</label>' +
    '</div>' +
    '<div id="trm-exc-list-' + type + '"></div>' +
    '<button type="button" class="btn-primary" id="trm-exc-add-' + type + '" style="font-size:12px;padding:8px 16px">' + addLabel + '</button>' +
    '</div>';
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
    el.innerHTML = '<div style="font-size:13px;color:var(--ink-60);margin-bottom:12px">' + (showPast ? 'Нет ' + what : 'Предстоящих ' + what + ' нет') + '</div>';
    return;
  }
  el.innerHTML = list.map(function (e) {
    const past = e.date_to < d;
    // Отсутствие — причина; особые часы — интервалы и причина. Причины нет — не выводим
    const details = off
      ? (e.reason ? escAttr(e.reason) : '')
      : ivText(e.work_hours) + (e.reason ? '<span style="color:var(--ink-60)"> · ' + escAttr(e.reason) + '</span>' : '');
    return '<div class="lib-card" style="margin-bottom:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px' + (past ? ';opacity:.55' : '') + '">' +
      '<div style="min-width:0"><div style="font-weight:600;font-size:13px">' + fmtDateRange(e.date_from, e.date_to) + '</div>' +
      (details ? '<div style="font-size:12px;color:' + (off ? '#d97706' : '#00BAB3') + '">' + details + '</div>' : '') + '</div>' +
      trmItemButtons('exc', e.id) + '</div>';
  }).join('');
}

async function deleteSchedule(specId, id) {
  const s = trmHours.schedules.find(function (x) { return x.id === id; });
  if (!confirm('Удалить период графика' + (s ? ' «' + s.name + '»' : '') + '?')) return;
  try { await SpecialistHoursAPI.deleteSchedule(id); } catch (e) { return; }
  showToast('Период графика удалён', 'success');
  await trmHoursChanged(specId);
}

async function deleteException(specId, id) {
  const exc = trmHours.exceptions.find(function (x) { return x.id === id; });
  const custom = exc && exc.type === 'custom';
  if (!confirm(custom ? 'Удалить особые часы работы?' : 'Удалить отсутствие?')) return;
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
function ivOpenLocations(ctx) {
  return LOCATIONS.filter(function (l) { const h = ivCtxHours(ctx, l.id); return !h.closed && !h.empty; });
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
  const open = ivOpenLocations(ctx);
  let locId = iv.location_id ? Number(iv.location_id) : (open[0] ? open[0].id : (LOCATIONS[0] ? LOCATIONS[0].id : 0));
  let locOpts = open.map(function (l) {
    return '<option value="' + l.id + '"' + (l.id === locId ? ' selected' : '') + '>' + escAttr(l.name) + '</option>';
  }).join('');
  // Сохранённый филиал в этот день не работает (или стал недействующим) — показываем, чтобы не потерять
  if (!open.some(function (l) { return l.id === locId; })) {
    const l = findLocation(locId);
    locOpts += '<option value="' + locId + '" selected>' + escAttr(l ? l.name : 'Филиал ' + locId) + ' (не работает)</option>';
  }
  const h = ivCtxHours(ctx, locId);
  const range = h.range || null;
  const locSelect = '<select class="form-input iv-loc" style="width:auto;max-width:170px;padding:4px 8px' + (multiLocations() ? '' : ';display:none') + '">' + locOpts + '</select>';
  return '<div class="iv-row" style="display:flex;align-items:center;gap:4px;margin-bottom:4px">' +
    locSelect +
    '<select class="form-input iv-from" style="width:auto;padding:4px 8px">' + ivTimeOptions(range, iv.from || '', false) + '</select>' +
    '<span>–</span>' +
    '<select class="form-input iv-to" style="width:auto;padding:4px 8px">' + ivTimeOptions(range, iv.to || '', true) + '</select>' +
    '<button type="button" class="action-btn cancel" style="font-size:11px;padding:4px 8px" data-iv-del title="Удалить интервал">✕</button>' +
    '</div>';
}

// Список интервалов + кнопка «+ интервал»; пустой список показывается как «выходной» (css .iv-list:empty).
// Контекст хранится в data-ctx списка — по нему строятся новые строки и пересчитывается время при смене филиала.
function ivListHtml(list, ctx) {
  return '<div class="iv-list" data-ctx=\'' + JSON.stringify(ctx) + '\'>' +
    (list || []).map(function (iv) { return ivRowHtml(iv, ctx); }).join('') + '</div>' +
    '<button type="button" class="btn-ghost" style="font-size:11px;padding:3px 8px" data-iv-add>+ интервал</button>';
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
      cell = '<div style="font-size:12px;color:#9ca3af;padding:6px 0">' + (multiLocations() ? 'филиалы не работают' : 'филиал не работает') + '</div>';
    } else {
      // Интервалы, сохранённые до изменения режима филиала, — показываем, чтобы их можно было исправить или удалить
      cell = (closed ? '<div style="font-size:12px;color:#ef4444;padding:6px 0">филиал не работает — удалите интервалы</div>' : '') +
        ivListHtml(intervals, ctx);
    }
    return '<div class="iv-day" data-day="' + d + '" style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line,#eee)">' +
      '<div style="width:100px;flex-shrink:0;font-size:13px;padding-top:6px;color:' + (closed ? '#9ca3af' : '#00BAB3') + '">' + d + '</div>' +
      '<div style="flex:1">' + cell + '</div></div>';
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
    LOCATIONS.map(function (l) { return '<option value="' + l.id + '">' + escAttr(l.name) + '</option>'; }).join('') + '</select>';
  const fillDays = '<span id="sch-fill-days" style="display:flex;gap:4px;flex-wrap:wrap">' +
    LOC_DAYS.map(function (d, i) {
      return '<label class="sch-fill-day" style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer">' +
        '<input type="checkbox" data-i="' + i + '">' + LOC_DAYS_SHORT[d] + '</label>';
    }).join('') + '</span>';
  const body =
    '<div class="form-field"><label class="form-label">Название</label>' +
    '<input class="form-input" id="sch-name" value="' + escAttr(s ? s.name : '') + '"></div>' +
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">С</label><input type="date" class="form-input" id="sch-from" value="' + (s ? s.date_from : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">По</label>' +
    '<input type="date" class="form-input" id="sch-to" value="' + (s && s.date_to ? s.date_to : '') + '"></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 4px">' +
    fillLoc + fillDays +
    '<button type="button" class="btn-ghost" style="' + small + '" data-sch-fill="loc">Заполнить по филиалу</button>' +
    '</div>' +
    '<div style="margin:0 0 6px"><button type="button" class="btn-ghost" style="' + small + '" data-sch-fill="weekdays">Пн → на все будни</button></div>' +
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
  });
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
    '<div class="form-field"><label class="form-label">С</label><input type="date" class="form-input" id="exc-from" value="' + (e ? e.date_from : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">По</label>' +
    '<input type="date" class="form-input" id="exc-to" value="' + (e ? e.date_to : '') + '"></div>' +
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
  });
  if (!custom) return;
  el.querySelector('.admin-modal').style.maxWidth = '560px';
  bindIntervalEditor(el);

  // Интервалы — в часах своего филиала, общих для выбранных дат; пересобираем при смене дат, сохраняя введённое
  const ivBody = document.getElementById('exc-iv-body');
  const hint = function (text) { return '<div style="font-size:12px;color:var(--ink-60);padding:4px 0">' + text + '</div>'; };
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
