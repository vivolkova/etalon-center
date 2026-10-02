// Админка → Настройки → Справочники: общие значения; у прикладных групп — в каких филиалах доступно
// (явным списком). Редактируются только прикладные группы (editable с сервера); системные — только просмотр.

const DICT_GROUP_LABEL = {
  activity_category: 'Тренировки — категория занятий в зале (новые виды добавляйте в «Услуги»)',
  service_category: 'Услуги — разделы страницы «Услуги» на сайте',
  specialist_type: 'Типы специалистов',
  slot_type: 'Типы занятий — задаются в библиотеке (системный)',
  user_role: 'Роли пользователей (системный)',
};
const DICT_GROUP_ORDER = ['specialist_type', 'service_category', 'activity_category', 'slot_type', 'user_role'];
// Группы с категориями занятий: у значения есть тип специалиста, который его ведёт (ref_id)
const DICT_CATEGORY_GROUPS = ['activity_category', 'service_category'];

let DICTS = [];   // значения справочников (с location_ids)

// Филиалы значения — названия
function dictLocationsText(d) {
  const names = d.location_ids.map(function (id) { const l = findLocation(id); return l ? l.name : '#' + id; });
  return names.length ? escAttr(names.join(', ')) : '<span class="set-hint">—</span>';
}

async function renderDictsTab() {
  const box = document.getElementById('dict-groups');
  if (!box) return;
  try { DICTS = (await DictionariesAPI.list()) || []; } catch (e) { return; }

  const groups = DICT_GROUP_ORDER.concat(
    [...new Set(DICTS.map(function (d) { return d.group_code; }))].filter(function (g) { return DICT_GROUP_ORDER.indexOf(g) === -1; })
  );
  box.innerHTML = groups.map(function (g) {
    const rows = DICTS.filter(function (d) { return d.group_code === g; });
    if (!rows.length) return '';
    const editable = rows[0].editable;
    const withRef = DICT_CATEGORY_GROUPS.indexOf(g) >= 0;
    const head = '<tr><th>Код</th><th>Название</th>' + (withRef ? '<th>Кто ведёт</th>' : '') +
      // «Активно» / «Филиалы» — только у редактируемых групп; у системных значения не меняются
      (editable ? '<th>Активно</th><th>Филиалы</th><th></th>' : '') + '</tr>';
    const body = rows.map(function (d) {
      return '<tr' + (!d.active ? ' class="row-muted"' : '') + '>' +
        '<td class="dict-code">' + escAttr(d.code) + '</td>' +
        '<td>' + escAttr(d.name) + '</td>' +
        (withRef ? '<td>' + (d.ref_name ? escAttr(d.ref_name) : '<span class="set-hint">—</span>') + '</td>' : '') +
        (editable
          ? '<td>' + (d.active ? 'да' : '<span class="set-hint">нет</span>') + '</td>' +
            '<td>' + dictLocationsText(d) + '</td>' +
            '<td><button class="action-btn confirm btn-sm" onclick="openDictModal(' + d.id + ')">Ред.</button></td>'
          : '') +
        '</tr>';
    }).join('');
    return '<div class="dict-group">' +
      '<div class="dict-group-head"><div class="adm-card-title u-m-0">' + escAttr(DICT_GROUP_LABEL[g] || g) + '</div>' +
      // Категория тренировок одна (training) — новые значения добавляются только в услуги и типы специалистов
      (editable && g !== 'activity_category' ? '<button class="btn-ghost u-text-small" onclick="openDictModal(null,\'' + g + '\')">+ Значение</button>' : '') +
      '</div>' +
      '<table class="dict-table">' + head + body + '</table></div>';
  }).join('');
}

// После изменений справочника — обновить данные, которыми пользуются формы
async function dictReloadCaches() {
  await Promise.allSettled([loadActivityCats(), loadDictValues(), loadDictAvailability()]);
}

function openDictModal(id, group) {
  const d = id ? DICTS.find(function (v) { return v.id === id; }) : null;
  const g = d ? d.group_code : group;
  const specTypes = DICTS.filter(function (v) { return v.group_code === 'specialist_type'; });
  const locOptions = (LOCATIONS_ALL.length ? LOCATIONS_ALL : LOCATIONS).map(function (l) { return { value: l.id, label: l.name }; });
  const body =
    '<div class="set-hint u-mb-10">' + escAttr(DICT_GROUP_LABEL[g] || g) + '</div>' +
    '<div class="form-field"><label class="form-label">Название</label>' +
    '<input class="form-input" id="dm-name" required value="' + escAttr(d ? d.name : '') + '"></div>' +
    '<div class="form-field"><label class="form-label">Код</label>' +
    (d ? '<div class="form-input form-view">' + escAttr(d.code) + '</div>'
       : '<input class="form-input" id="dm-code" required>') +
    '<div class="set-hint">Латиница, цифры и _. После создания не меняется — на код опирается приложение.</div></div>' +
    (DICT_CATEGORY_GROUPS.indexOf(g) >= 0
      ? '<div class="form-field"><label class="form-label">Кто ведёт (тип специалиста)</label><select class="form-input" id="dm-ref">' +
        '<option value="">— не задано —</option>' +
        specTypes.map(function (t) { return '<option value="' + t.id + '"' + (d && d.ref_id === t.id ? ' selected' : '') + '>' + escAttr(t.name) + '</option>'; }).join('') +
        '</select></div>'
      : '') +
    // Филиалы — явным списком (новый филиал автоматически не добавляется)
    '<div class="form-field"><label class="form-label">Филиалы</label>' +
    msHtml('dm-locs', locOptions, d ? d.location_ids : [], '— Выберите филиалы —', true, true) + '</div>' +
    '<div class="form-field"><label class="check-label">' +
    '<input type="checkbox" id="dm-active"' + (!d || d.active ? ' checked' : '') + '> Активно</label></div>' +
    (g === 'service_category' && !d
      ? '<div class="set-hint">Клиент сможет записаться на услугу, когда у неё указан тип специалиста, есть записи в библиотеке и специалист с графиком в филиале. Цвет новой услуги — нейтральный серый, пока для неё не заданы цвета в css/base.css.</div>'
      : '');

  openFormModal('dict-modal', d ? 'Изменить значение' : 'Новое значение', body, async function () {
    const name = document.getElementById('dm-name').value.trim();
    if (!name) { showToast('Введите название', 'error'); return false; }
    const locationIds = msValues('dm-locs').map(Number);
    if (!locationIds.length) { showToast('Выберите хотя бы один филиал', 'error'); return false; }
    const refEl = document.getElementById('dm-ref');
    const data = {
      name: name,
      active: document.getElementById('dm-active').checked ? 1 : 0,
      ref_id: refEl && refEl.value ? parseInt(refEl.value) : null,
      location_ids: locationIds,
    };
    if (d) await DictionariesAPI.update(Object.assign({ id: d.id }, data));
    else await DictionariesAPI.create(Object.assign({ group_code: g, code: document.getElementById('dm-code').value.trim() }, data));
    showToast('Справочник сохранён', 'success');
    await dictReloadCaches();
    renderDictsTab();
    return true;
  });
}
