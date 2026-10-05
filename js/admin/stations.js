// Админка → Настройки: станки и схема зала филиала, типы станков (общие)

let STATION_TYPES = [];        // типы станков (station_type), включая выключенные
let SETTINGS_STATIONS = [];    // станки выбранного филиала, включая неактивные

async function loadStationTypes() {
  try { STATION_TYPES = (await StationsAPI.types()) || []; } catch (e) { /* сервер недоступен */ }
}

// ── Станки и схема зала ───────────────────────────────────────────
async function renderStationsTab() {
  const locId = fillSettingsLocSelect();
  const hall = document.getElementById('st-hall');
  const hint = document.getElementById('st-hint');
  const outside = document.getElementById('st-outside');
  if (!hall) return;
  if (!locId) { hall.innerHTML = ''; outside.innerHTML = ''; hint.textContent = admLocs().length ? ADM_PICK_BRANCH : 'Сначала добавьте филиал'; return; }

  await Promise.allSettled([
    loadStationTypes(),
    StationsAPI.listAll(locId).then(function (res) {
      SETTINGS_STATIONS = (res || []).map(function (s) {
        return Object.assign({}, s, { id: Number(s.id), type_id: Number(s.type_id), pos_x: Number(s.pos_x), pos_y: Number(s.pos_y), active: Number(s.active) });
      });
    }),
  ]);
  const loc = findLocation(locId) || {};
  const cols = parseInt(loc.hall_cols) || 6, rows = parseInt(loc.hall_rows) || 2;
  const byPos = {};
  SETTINGS_STATIONS.forEach(function (s) { byPos[s.pos_x + ',' + s.pos_y] = s; });

  // Лимит: активных станков не больше вместимости филиала (проверяет и сервер)
  const active = SETTINGS_STATIONS.filter(function (s) { return Number(s.active); }).length;
  const cap = parseInt(loc.max_people) || 0;
  hint.innerHTML = 'Зал ' + cols + '×' + rows + ' · активных станков: <b' + (active >= cap ? ' style="color:#c0392b"' : '') + '>' + active + ' из ' + cap + '</b>' +
    ' (вместимость филиала)' + (SETTINGS_STATIONS.length > active ? ' · выключенных: ' + (SETTINGS_STATIONS.length - active) : '');

  // Менять зал (добавлять, переставлять, открывать станок) может только тот, у кого есть право hall;
  // остальные администраторы видят расстановку без изменения
  const canEdit = canDo('hall');
  hall.classList.toggle('hall-edit', canEdit);
  const editHint = document.getElementById('st-edit-hint');
  if (editHint) editHint.style.display = canEdit ? '' : 'none';
  hall.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  let html = '';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const s = byPos[x + ',' + y];
      if (!s) {
        html += canEdit
          ? '<div class="cell-empty" data-x="' + x + '" data-y="' + y + '" onclick="openStationModal(null,' + x + ',' + y + ')" title="Добавить станок"></div>'
          : '<div class="cell-empty"></div>';
        continue;
      }
      html += stationHtml(s, 'free' + (Number(s.active) ? '' : ' inactive'),
        (canEdit ? 'draggable="true" data-station-id="' + s.id + '" data-x="' + x + '" data-y="' + y + '" onclick="openStationModal(' + s.id + ')"' : 'disabled') +
        ' title="' + escAttr(s.label + ' · ' + s.type_name + (Number(s.active) ? '' : ' · выключен')) + '"');
    }
  }
  hall.innerHTML = html;
  if (canEdit) stBindDrag(hall);

  // Станки за пределами схемы (зал уменьшили) — показать, чтобы их можно было вернуть
  const out = SETTINGS_STATIONS.filter(function (s) { return s.pos_x >= cols || s.pos_y >= rows; });
  outside.innerHTML = out.length
    ? '<div class="set-warn">Вне схемы зала (' + out.length + '): ' + out.map(function (s) {
      return canEdit ? '<a href="#" onclick="event.preventDefault();openStationModal(' + s.id + ')">' + escAttr(s.label) + '</a>' : escAttr(s.label);
    }).join(', ') + (canEdit ? '. Откройте станок, чтобы поставить его на свободную клетку.' : '') + '</div>'
    : '';
}

// Перетаскивание станка на другую клетку (на занятую — поменяются местами, это делает API)
function stBindDrag(hall) {
  if (hall._dragBound) return;
  hall._dragBound = true;
  let dragId = null;
  hall.addEventListener('dragstart', function (e) {
    const b = e.target.closest('[data-station-id]');
    if (!b) return;
    dragId = parseInt(b.getAttribute('data-station-id'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  hall.addEventListener('dragover', function (e) {
    const t = e.target.closest('[data-x]');
    if (!t || !dragId) return;
    e.preventDefault();
    hall.querySelectorAll('.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    t.classList.add('drag-over');
  });
  hall.addEventListener('drop', async function (e) {
    const t = e.target.closest('[data-x]');
    if (!t || !dragId) return;
    e.preventDefault();
    const id = dragId; dragId = null;
    const x = parseInt(t.getAttribute('data-x')), y = parseInt(t.getAttribute('data-y'));
    if (parseInt(t.getAttribute('data-station-id')) === id) { renderStationsTab(); return; }
    try { await StationsAPI.move(id, x, y); } catch (err) { /* ошибка показана в apiRequest */ }
    renderStationsTab();
  });
  hall.addEventListener('dragend', function () {
    dragId = null;
    hall.querySelectorAll('.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
  });
}

// Первая свободная клетка схемы (для станка вне схемы)
function stFirstFreeCell(locId, exceptId) {
  const loc = findLocation(locId) || {};
  const cols = parseInt(loc.hall_cols) || 6, rows = parseInt(loc.hall_rows) || 2;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!SETTINGS_STATIONS.some(function (s) { return s.id !== exceptId && s.pos_x === x && s.pos_y === y; })) return { x: x, y: y };
  }
  return null;
}

function openStationModal(id, x, y) {
  const s = id ? SETTINGS_STATIONS.find(function (v) { return v.id === id; }) : null;
  const locId = settingsLocId;
  const loc = findLocation(locId) || {};
  const cols = parseInt(loc.hall_cols) || 6, rows = parseInt(loc.hall_rows) || 2;
  const isOutside = s && (s.pos_x >= cols || s.pos_y >= rows);
  // Лимит вместимости: включить станок можно, только если активных меньше max_people (сам станок не считаем)
  const cap = parseInt(loc.max_people) || 0;
  const activeOthers = SETTINGS_STATIONS.filter(function (v) { return Number(v.active) && (!s || v.id !== s.id); }).length;
  const canActivate = activeOthers < cap;
  const isOn = s ? !!Number(s.active) : canActivate;
  const types = STATION_TYPES.filter(function (t) { return Number(t.active) || (s && Number(t.id) === s.type_id); });
  const body =
    '<div class="form-field"><label class="form-label">Название (номер на схеме)</label>' +
    '<input class="form-input" id="stm-label" required value="' + escAttr(s ? s.label : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">Тип станка</label><select class="form-input" id="stm-type" required>' +
    types.map(function (t) { return '<option value="' + t.id + '"' + (s && Number(t.id) === s.type_id ? ' selected' : '') + '>' + escAttr(t.name) + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="set-hint u-mb-10">Место: ряд ' + ((s ? s.pos_y : y) + 1) + ', колонка ' + ((s ? s.pos_x : x) + 1) +
    (isOutside ? ' — вне схемы зала; при сохранении станок встанет на первую свободную клетку' : '') + '</div>' +
    '<div class="form-field"><label class="check-label">' +
    '<input type="checkbox" id="stm-active"' + (isOn ? ' checked' : '') + (!canActivate && !isOn ? ' disabled' : '') + '> Активен (доступен для записи)</label>' +
    (!canActivate && !isOn
      ? '<div class="set-hint u-mt-4">Активных станков уже ' + activeOthers + ' — это вместимость филиала (' + cap + '). Станок можно добавить только выключенным (в запас); чтобы включить — выключите другой или увеличьте вместимость.</div>'
      : '') +
    '</div>';
  const delBtn = s ? '<button class="btn-ghost btn-danger u-mr-auto" data-act="delete">Удалить</button>' : '';

  const modal = openFormModal('station-modal', s ? 'Станок' : 'Новый станок', body, async function () {
    const label = document.getElementById('stm-label').value.trim();
    if (!label) { showToast('Введите название станка', 'error'); return false; }
    const type_id = parseInt(document.getElementById('stm-type').value);
    if (!type_id) { showToast('Сначала добавьте тип станка', 'error'); return false; }
    const active = document.getElementById('stm-active').checked ? 1 : 0;
    if (s) {
      const data = { id: s.id, label: label, type_id: type_id, active: active };
      if (isOutside) {
        const cell = stFirstFreeCell(locId, s.id);
        if (!cell) { showToast('На схеме нет свободных клеток — увеличьте зал в настройках филиала', 'error'); return false; }
        data.pos_x = cell.x; data.pos_y = cell.y;
      }
      await StationsAPI.update(data);
      showToast('Станок сохранён', 'success');
    } else {
      await StationsAPI.create({ location_id: locId, label: label, type_id: type_id, active: active, pos_x: x, pos_y: y, sort_order: y * cols + x + 1 });
      showToast('Станок добавлен', 'success');
    }
    renderStationsTab();
    return true;
  }, delBtn);

  if (s) modal.querySelector('[data-act="delete"]').onclick = async function () {
    if (!await uiConfirm('Удалить станок «' + s.label + '»?', 'Если на него есть записи, он будет только выключен.')) return;
    try { await StationsAPI.delete(s.id); } catch (e) { return; }
    modal.remove();
    renderStationsTab();
  };
}

// ── Типы станков (общие) ──────────────────────────────────────────
async function renderStationTypesTab() {
  const grid = document.getElementById('st-types');
  if (!grid) return;
  await loadStationTypes();
  if (!STATION_TYPES.length) { grid.innerHTML = '<div class="set-hint">Типов пока нет</div>'; return; }
  grid.innerHTML = STATION_TYPES.map(function (t) {
    const inactive = !Number(t.active);
    return '<div class="lib-card' + (inactive ? ' card-inactive' : '') + '">' +
      '<div class="u-flex u-gap-12 u-items-center">' +
      '<div class="st-type-ico">' + (t.icon || '') + '</div>' +
      '<div class="u-min-w-0"><div class="lib-card-title">' + escAttr(t.name) + '</div></div></div>' +
      '<div class="lib-card-meta">' + (inactive ? '<span class="lib-meta-tag tag-muted">Выключен</span>' : '') +
      '<span class="lib-meta-tag">Станков: ' + (parseInt(t.stations_count) || 0) + '</span></div>' +
      '<div class="lib-card-footer"><div></div><div class="lib-card-actions">' +
      '<button class="action-btn confirm btn-sm"' + needAttr('system') + ' onclick="openStationTypeModal(' + t.id + ')">Ред.</button>' +
      '<button class="action-btn cancel btn-sm"' + needAttr('system') + ' onclick="deleteStationType(' + t.id + ')">Уд.</button>' +
      '</div></div></div>';
  }).join('');
}

function openStationTypeModal(id) {
  const t = id ? STATION_TYPES.find(function (v) { return Number(v.id) === id; }) : null;
  const body =
    '<div class="form-field"><label class="form-label">Название</label>' +
    '<input class="form-input" id="stt-name" required value="' + escAttr(t ? t.name : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">Иконка (SVG)</label>' +
    '<textarea class="form-input" id="stt-icon" rows="4" style="height:auto;font-family:monospace;font-size:11px">' + escAttr(t && t.icon ? t.icon : '') + '</textarea>' +
    '<div class="st-type-ico u-mt-6" id="stt-preview">' + (t && t.icon ? t.icon : '') + '</div></div>' +
    '<div class="form-field"><label class="check-label">' +
    '<input type="checkbox" id="stt-active"' + (!t || Number(t.active) ? ' checked' : '') + '> Активен</label></div>';
  openFormModal('station-type-modal', t ? 'Тип станка' : 'Новый тип станка', body, async function () {
    const name = document.getElementById('stt-name').value.trim();
    if (!name) { showToast('Введите название', 'error'); return false; }
    const icon = document.getElementById('stt-icon').value.trim();
    if (icon && !/^<svg[\s>]/i.test(icon)) { showToast('Иконка — код SVG, начинается с <svg', 'error'); return false; }
    const active = document.getElementById('stt-active').checked ? 1 : 0;
    if (t) await StationsAPI.typeUpdate({ id: t.id, name: name, icon: icon || null, active: active });
    else await StationsAPI.typeCreate({ name: name, icon: icon || null, active: active });
    showToast('Тип станка сохранён', 'success');
    renderStationTypesTab();
    return true;
  });

  // Предпросмотр иконки
  document.getElementById('stt-icon').addEventListener('input', function () {
    const v = this.value.trim();
    document.getElementById('stt-preview').innerHTML = /^<svg[\s>]/i.test(v) ? v : '';
  });
}

// Удаление типа (кнопка «Уд.» на карточке); если есть станки этого типа — сервер только выключит его
async function deleteStationType(id) {
  const t = STATION_TYPES.find(function (v) { return Number(v.id) === id; });
  if (!t) return;
  if (!await uiConfirm('Удалить тип «' + t.name + '»?', 'Если есть станки этого типа, он будет только выключен.')) return;
  try { await StationsAPI.typeDelete(t.id); } catch (e) { return; }
  await renderStationTypesTab();
  const kept = STATION_TYPES.some(function (v) { return Number(v.id) === id; });
  showToast(kept ? 'Есть станки этого типа — тип выключен вместо удаления' : 'Тип станка удалён', 'success');
}
