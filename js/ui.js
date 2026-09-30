// Интерфейс: toast, модалки не закрываются по клику на фон

// ═══ TOAST ════════════════════════════════════════════════════════

// Ошибки висят дольше (их нужно успеть прочитать); любое сообщение закрывается кликом
const TOAST_MS = { error: 8000, default: 3500 };

function showToast(msg, type = '') {
  const container = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast${type ? ' ' + type : ''}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  t.style.cursor = 'pointer';
  t.title = 'Закрыть';
  const hide = () => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); };
  t.addEventListener('click', hide);
  container.appendChild(t);
  setTimeout(hide, TOAST_MS[type] || TOAST_MS.default);
}

// ═══ MODALS: NO CLOSE ON OVERLAY CLICK ═══════════════════════════

// Во всём проекте модальные окна закрываются только кнопками (×, «Отмена», «Закрыть»),
// клик мимо окна — по подложке *-modal-overlay — ничего не делает. Перехватываем такой клик
// на фазе захвата, до обработчиков самой модалки, — правило действует и для новых модалок.
document.addEventListener('click', e => {
  const t = e.target;
  if (t instanceof Element && Array.from(t.classList).some(c => c.endsWith('modal-overlay'))) e.stopPropagation();
}, true);



// ═══ MULTI-SELECT: выпадающий список с выбором нескольких значений ═══

// msHtml(id, options [{value, label}], selected [value…], placeholder, selectAll) — разметка;
// selectAll — первым пунктом «Выбрать все». msValues(id) — выбранные значения (строки).
function msHtml(id, options, selected, placeholder, selectAll) {
  const sel = (selected || []).map(String);
  const allChecked = options.length && options.every(o => sel.includes(String(o.value)));
  return '<div class="ms" id="' + id + '" data-placeholder="' + escAttr(placeholder || '— Выберите —') + '">' +
    '<button type="button" class="form-input ms-btn">' + msLabel(options.filter(o => sel.includes(String(o.value))).map(o => o.label), placeholder) + '</button>' +
    '<div class="ms-panel">' +
    (selectAll ? '<label class="ms-opt ms-all"><input type="checkbox" data-ms-all' + (allChecked ? ' checked' : '') + '> Выбрать все</label>' : '') +
    options.map(o =>
      '<label class="ms-opt"><input type="checkbox" value="' + escAttr(String(o.value)) + '"' + (sel.includes(String(o.value)) ? ' checked' : '') + '> ' + escAttr(o.label) + '</label>'
    ).join('') + '</div></div>';
}

function msLabel(labels, placeholder) {
  return labels.length ? escAttr(labels.join(', ')) : '<span class="ms-ph">' + escAttr(placeholder || '— Выберите —') + '</span>';
}

function msValues(id) {
  const ms = document.getElementById(id);
  return ms ? Array.from(ms.querySelectorAll('.ms-panel input:checked:not([data-ms-all])')).map(c => c.value) : [];
}

// Открыть/закрыть список; при выборе обновить подпись кнопки. Клик мимо — закрыть (mousedown: клик по фону модалки перехвачен выше)
document.addEventListener('click', e => {
  const btn = e.target instanceof Element && e.target.closest('.ms-btn');
  if (btn) {
    const ms = btn.closest('.ms');
    document.querySelectorAll('.ms.open').forEach(x => { if (x !== ms) x.classList.remove('open'); });
    ms.classList.toggle('open');
  }
});
document.addEventListener('change', e => {
  const ms = e.target instanceof Element && e.target.closest('.ms');
  if (!ms || !e.target.closest('.ms-panel')) return;
  const items = Array.from(ms.querySelectorAll('.ms-panel input:not([data-ms-all])'));
  const all = ms.querySelector('[data-ms-all]');
  // «Выбрать все» отмечает/снимает все пункты; сам отмечен, когда выбраны все
  if (e.target.hasAttribute('data-ms-all')) items.forEach(c => { c.checked = e.target.checked; });
  else if (all) all.checked = items.every(c => c.checked);
  const labels = items.filter(c => c.checked).map(c => c.closest('.ms-opt').textContent.trim());
  ms.querySelector('.ms-btn').innerHTML = msLabel(labels, ms.getAttribute('data-placeholder'));
});
document.addEventListener('mousedown', e => {
  document.querySelectorAll('.ms.open').forEach(ms => { if (!ms.contains(e.target)) ms.classList.remove('open'); });
});
