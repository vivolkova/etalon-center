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

// ═══ МЕНЮ НА ТЕЛЕФОНЕ ════════════════════════════════════════════

// Кнопка .nav-burger раскрывает под шапкой меню .nav-menu: разделы и кнопки входа (css/site.css).
// Закрывается выбором пункта, нажатием мимо меню и клавишей Esc
function navToggle(open) {
  const nav = document.querySelector('.nav');
  if (nav) nav.classList.toggle('is-open', open);
}
document.addEventListener('click', e => {
  const t = e.target instanceof Element ? e.target : null;
  if (t && (t.closest('.nav-link, .nav-auth button') || !t.closest('.nav'))) navToggle(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') navToggle(false); });

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
  // Окно закрыто с клавиатуры — браузер иначе обвёл бы рамкой кнопку, которой его открывали («Детали», «Ред.»…):
  // снимаем с неё фокус, чтобы после Esc кнопки выглядели так же, как после закрытия мышью
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== document.body && !focused.closest('.show')) focused.blur();
});



// ═══ ПОДТВЕРЖДЕНИЕ ДЕЙСТВИЯ ══════════════════════════════════════

// Единое окно подтверждения вместо системного confirm(): заголовок — вопрос («Отменить запись?»), под ним при
// необходимости пояснение (что произойдёт), кнопки «Нет» и «Да». Используется во всей системе:
//   if (!await uiConfirm('Удалить клиента?', 'Его записи сохранятся.')) return;
// Возвращает Promise<boolean>. «Нет» и Esc — отказ; фокус на «Да», поэтому Enter — согласие.
// Открывается поверх любого окна (.confirm-overlay, css/panels.css).
function uiConfirm(title, note) {
  return new Promise(function (resolve) {
    const el = document.createElement('div');
    el.className = 'admin-modal-overlay confirm-overlay show';
    el.innerHTML = '<div class="admin-modal u-max-w-380">'
      + '<div class="admin-modal-title' + (note ? ' u-mb-8' : '') + '">' + escAttr(title) + '</div>'
      + (note ? '<div class="u-text-body u-muted u-mb-20">' + escAttr(note) + '</div>' : '')
      + '<div class="admin-modal-actions"><button class="btn-ghost" data-act="cancel">Нет</button>'
      + '<button class="btn-danger" data-act="ok">Да</button></div></div>';
    const done = function (yes) { el.remove(); resolve(yes); };
    el.querySelector('[data-act="cancel"]').onclick = function () { done(false); };
    el.querySelector('[data-act="ok"]').onclick = function () { done(true); };
    document.body.appendChild(el);
    el.querySelector('[data-act="ok"]').focus();
  });
}

// ═══ ТЕЛЕФОН: одно поле для всех мест, где телефон вводится целиком ═══
// В разметке достаточно класса: <input class="form-input phone-input">. Всё остальное задаётся здесь, одинаково
// для всех: вид +7 (XXX) XXX-XX-XX при вводе, шаблон в пустом поле, длина и проверка «введён полностью»
// (неполный номер — красная рамка, css/kit.css). Значение из базы подставлять через maskPhone(значение).
// Поля поиска по телефону сюда не относятся — в них номер вводят частично.
const PHONE_TEMPLATE = '+7 (___) ___-__-__';

// Поиск по телефону — одно правило для всех полей поиска: сравниваются только цифры, скобки, пробелы и дефисы
// не важны («666» находит +7 (951) 660-56-66). Цифры запроса ищем в номере без кода страны (последние 10 цифр);
// номер, набранный с начала — «8 951…» или «+7 951…», — тот же, что «951…». Запрос без цифр или с буквами номеру не подходит
function phoneMatches(phone, q) {
  const digits = String(q || '').replace(/\D+/g, '');
  if (!digits || /[a-zа-яё]/i.test(q)) return false;   // запрос с буквами — это имя или название, а не номер
  const nat = String(phone || '').replace(/\D+/g, '').slice(-10);
  return nat.indexOf(digits) >= 0 || (/^[78]/.test(digits) && nat.indexOf(digits.slice(1)) === 0);
}
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
    // список внутри прокручиваемой вкладки окна (.tab-pane-body) мог открыться за её краем — показать целиком
    if (ms.classList.contains('open')) ms.querySelector('.ms-panel').scrollIntoView({ block: 'nearest' });
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

// ═══ ОКНО-СООБЩЕНИЕ ══════════════════════════════════════════════
// Как uiConfirm, но с одной кнопкой «Закрыть»: сообщение, которое нужно успеть прочитать (не всплывающая подсказка)
function uiInfo(title, note) {
  const el = document.createElement('div');
  el.className = 'admin-modal-overlay confirm-overlay show';
  el.innerHTML = '<div class="admin-modal u-max-w-380">'
    + '<div class="admin-modal-title' + (note ? ' u-mb-8' : '') + '">' + escAttr(title) + '</div>'
    + (note ? '<div class="u-text-body u-muted u-mb-20">' + escAttr(note) + '</div>' : '')
    + '<div class="admin-modal-actions"><button class="btn-primary" data-act="ok">Закрыть</button></div></div>';
  el.querySelector('[data-act="ok"]').onclick = function () { el.remove(); };
  document.body.appendChild(el);
  el.querySelector('[data-act="ok"]').focus();
}

// ═══ ПОЛЕ ПАРОЛЯ ═════════════════════════════════════════════════
// Одно поле с кнопкой «показать пароль» — без «повторите пароль». autocomplete: current-password | new-password
function passFieldHtml(id, autocomplete, minlength) {
  return '<div class="pass-field"><input class="form-input" id="' + id + '" type="password" required autocomplete="' + autocomplete + '"'
    + (minlength ? ' minlength="' + minlength + '"' : '') + '>'
    + '<button type="button" class="pass-toggle" onclick="togglePass(this)" title="Показать пароль">'
    + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div>';
}
function togglePass(btn) {
  const inp = btn.parentNode.querySelector('input');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.classList.toggle('is-on', show);
  btn.title = show ? 'Скрыть пароль' : 'Показать пароль';
}

// ═══ ПОЛОСА ПРО COOKIE ═══════════════════════════════════════════
// На сайте только техническая cookie входа — согласие не требуется, достаточно сообщить. Показываем до «Понятно»
const COOKIE_OK_KEY = 'etalon.cookieOk';
function cookieBarInit() {
  const bar = document.getElementById('cookie-bar');
  if (!bar) return;
  let seen = false;
  try { seen = localStorage.getItem(COOKIE_OK_KEY) === '1'; } catch (e) { /* хранилище недоступно — покажем */ }
  bar.hidden = seen;
}
function cookieBarOk() {
  try { localStorage.setItem(COOKIE_OK_KEY, '1'); } catch (e) { /* скроем до перезагрузки */ }
  document.getElementById('cookie-bar').hidden = true;
}
cookieBarInit();
