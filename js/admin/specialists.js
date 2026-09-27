// Админка: специалисты

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
    const okQ = !q || t.full.toLowerCase().includes(q) || (t.spec || '').toLowerCase().includes(q);
    const okLoc = !locFilter || t.location_id === locFilter;
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
    // Цвет плашки типа — как у связанной категории активности (trainer -> training и т.д.)
    const cat = ACTIVITY_CATS.find(function (c) { return c.spec_type === t.category; });
    const locObj = LOCATIONS_ALL.concat(LOCATIONS).find(function (x) { return x.id === t.location_id; });
    const locName = locObj ? locObj.name : '';
    const inactive = !t.active;
    const cardStyle = inactive ? ' style="background:#f3f4f6;opacity:.65"' : '';
    const badge = inactive ? '<span class="lib-meta-tag" style="background:#e5e7eb;color:#6b7280">Неактивен</span>' : '';
    const actionsHtml =
      '<button class="action-btn confirm" style="font-size:11px;padding:4px 8px" onclick="openTrainerModal(' + t.id + ')">Ред.</button>';
    return '<div class="lib-card"' + cardStyle + '>' +
      '<div class="lib-card-header"><div>' +
      '<div class="lib-card-cat ' + (cat ? cat.code : '') + '">' + (SPEC_TYPE_LABEL[t.category] || t.category) + '</div>' +
      '<div class="lib-card-title">' + t.full + '</div>' +
      '</div></div>' +
      '<div class="lib-card-desc">' + (t.spec || '') + '</div>' +
      '<div class="lib-card-meta">' + badge +
      (locName ? '<span class="lib-meta-tag">' + locName + '</span>' : '') +
      '<span class="lib-meta-tag">Опыт: ' + t.exp + ' лет</span>' +
      '</div>' +
      '<div class="lib-card-footer">' +
      '<div></div>' +
      '<div class="lib-card-actions">' + actionsHtml + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

function openTrainerModal(id) {
  var t = id ? SPECIALISTS_ALL.find(function (x) { return x.id === id; }) : null;
  var locOpts = (LOCATIONS.length === 1 ? '' : '<option value="">— Выберите филиал —</option>') +
    LOCATIONS.map(function (l) { return '<option value="' + l.id + '">' + l.name + '</option>'; }).join('');
  var el = document.createElement('div');
  el.className = 'admin-modal-overlay show';
  el.id = 'trainer-tmp-modal';
  el.addEventListener('click', function (e) { if (e.target === el) el.remove(); });
  el.innerHTML =
    '<div class="admin-modal" style="max-width:420px">' +
    '<div class="admin-modal-title">' + (t ? 'Редактировать специалиста' : 'Добавить специалиста') + '</div>' +
    '<div class="form-field"><label class="form-label">Филиал</label><select class="form-input" id="trm-location">' + locOpts + '</select></div>' +
    '<div class="form-field"><label class="form-label">Категория</label><select class="form-input" id="trm-cat">' +
    ['trainer','bikefitter','mechanic'].map(function(c){return '<option value="'+c+'"'+((t?t.category:'trainer')===c?' selected':'')+'>'+SPEC_TYPE_LABEL[c]+'</option>';}).join('') +
    '</select></div>' +
    '<div class="form-field"><label class="form-label">Полное имя</label><input class="form-input" id="trm-name" value="' + (t ? t.full : '') + '" placeholder="Имя Фамилия"></div>' +
    '<div class="form-row">' +
    '<div class="form-field"><label class="form-label">Специализация</label><input class="form-input" id="trm-spec" value="' + (t ? t.spec : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">Опыт (лет)</label><input class="form-input" id="trm-exp" value="' + (t ? t.exp : '') + '" type="number" min="0"></div>' +
    '</div>' +
    '<div class="form-field"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">' +
    '<input type="checkbox" id="trm-active"' + (!t || t.active ? ' checked' : '') + '> Активен</label></div>' +
    '<div class="admin-modal-actions">' +
    '<button class="btn-ghost" id="trm-cancel">Отмена</button>' +
    '<button class="btn-primary" id="trm-save">Сохранить</button>' +
    '</div></div>';
  document.body.appendChild(el);
  document.getElementById('trm-cancel').onclick = function () { el.remove(); };
  document.getElementById('trm-save').onclick = function () { saveTrainer(t ? t.id : null); };
  var locSel = document.getElementById('trm-location');
  if (t && t.location_id) locSel.value = t.location_id;
  else if (LOCATIONS.length === 1) locSel.value = LOCATIONS[0].id;
}

async function saveTrainer(id) {
  const fullName = document.getElementById('trm-name').value.trim();
  if (!fullName) { showToast('Введите имя', 'error'); return; }
  const shortName = fullName.split(' ').map((w, i) => i === 0 ? w : w[0] + '.').join(' ');
  const location_id = parseInt(document.getElementById('trm-location').value) || null;
  if (!location_id) { showToast('Выберите филиал', 'error'); return; }
  const apiData = {
    location_id,
    active: document.getElementById('trm-active').checked ? 1 : 0,
    full_name: fullName,
    name: shortName,
    category: document.getElementById('trm-cat').value,
    speciality: document.getElementById('trm-spec').value,
    experience: parseInt(document.getElementById('trm-exp').value) || 0,
  };
  try {
    if (id) {
      await SpecialistsAPI.update({ id, ...apiData });
      showToast('Специалист обновлён', 'success');
    } else {
      await SpecialistsAPI.create(apiData);
      showToast('Специалист добавлен', 'success');
    }
    var ttm = document.getElementById('trainer-tmp-modal'); if (ttm) ttm.remove();
    await Promise.allSettled([loadSpecialists(), loadSpecialistsAll()]);
    renderSpecialists();
  } catch (e) {
    showToast('Ошибка сохранения специалиста', 'error');
  }
}

