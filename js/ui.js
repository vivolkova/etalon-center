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

// ═══ MODALS: CLOSE ON ESC ════════════════════════════════════════

// Esc закрывает верхнее открытое окно — так же, как его собственная кнопка («×», «Отмена», «Закрыть»):
// нажимаем эту кнопку, поэтому срабатывает вся уборка формы. Правило общее — действует и для новых модалок.
// Открытый выпадающий список (.ms) Esc сначала сворачивает, окно остаётся.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const list = document.querySelector('.ms.open');
  if (list) { list.classList.remove('open'); return; }
  const open = Array.from(document.querySelectorAll('.show')).filter(m => Array.from(m.classList).some(c => c.endsWith('modal-overlay')));
  const modal = open[open.length - 1];
  if (!modal) return;
  const visible = b => b.offsetParent !== null && !b.disabled;
  const btn = Array.from(modal.querySelectorAll('.modal-close, [data-act="cancel"]')).find(visible)
    || Array.from(modal.querySelectorAll('button')).find(b => visible(b) && /^(Отмена|Закрыть)$/.test(b.textContent.trim()));
  if (btn) btn.click(); else modal.classList.remove('show');
});



// ═══ ТЕЛЕФОН: одно поле для всех мест, где телефон вводится целиком ═══
// В разметке достаточно класса: <input class="form-input phone-input">. Всё остальное задаётся здесь, одинаково
// для всех: вид +7 (XXX) XXX-XX-XX при вводе, шаблон в пустом поле, длина и проверка «введён полностью»
// (неполный номер — красная рамка, css/kit.css). Значение из базы подставлять через maskPhone(значение).
// Поля поиска по телефону сюда не относятся — в них номер вводят частично.
const PHONE_TEMPLATE = '+7 (___) ___-__-__';
const PHONE_PATTERN = '\\+7 \\(\\d{3}\\) \\d{3}-\\d{2}-\\d{2}';

function maskPhone(v) {
  let d = (v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  d = d.slice(0, 11);
  const rest = d.slice(1);            // до 10 цифр после кода страны
  let r = '+7';
  if (rest.length > 0) r += ' (' + rest.slice(0, 3);
  if (rest.length >= 3) r += ')';
  if (rest.length > 3) r += ' ' + rest.slice(3, 6);
  if (rest.length > 6) r += '-' + rest.slice(6, 8);
  if (rest.length > 8) r += '-' + rest.slice(8, 10);
  return r;
}

function phoneSetup(el) {
  el.type = 'tel';
  el.inputMode = 'tel';
  el.maxLength = PHONE_TEMPLATE.length;
  el.placeholder = PHONE_TEMPLATE;
  el.pattern = PHONE_PATTERN;
  el.autocomplete = 'tel';
}
document.addEventListener('input', e => {
  if (e.target instanceof HTMLInputElement && e.target.classList.contains('phone-input')) e.target.value = maskPhone(e.target.value);
});
// Поля в разметке страницы и поля, которые формы добавляют позже
document.querySelectorAll('.phone-input').forEach(phoneSetup);
new MutationObserver(function (muts) {
  muts.forEach(function (m) {
    m.addedNodes.forEach(function (n) {
      if (n.nodeType !== 1) return;
      if (n.matches('.phone-input')) phoneSetup(n);
      n.querySelectorAll('.phone-input').forEach(phoneSetup);
    });
  });
}).observe(document.body, { childList: true, subtree: true });


// ═══ MULTI-SELECT: выпадающий список с выбором нескольких значений ═══

// msHtml(id, options [{value, label}], selected [value…], placeholder, selectAll, required) — разметка;
// selectAll — первым пунктом «Выбрать все»; required — обязательное поле (красная рамка, пока ничего не выбрано;
// стиль — css/kit.css). msValues(id) — выбранные значения (строки).
function msHtml(id, options, selected, placeholder, selectAll, required) {
  const sel = (selected || []).map(String);
  const allChecked = options.length && options.every(o => sel.includes(String(o.value)));
  return '<div class="ms' + (required ? ' is-required' : '') + '" id="' + id + '" data-placeholder="' + escAttr(placeholder || '— Выберите —') + '">' +
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
