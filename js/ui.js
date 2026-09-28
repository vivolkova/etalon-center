// Интерфейс: toast, модалки не закрываются по клику на фон

// ═══ TOAST ════════════════════════════════════════════════════════

function showToast(msg, type = '') {
  const container = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast${type ? ' ' + type : ''}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ═══ MODALS: NO CLOSE ON OVERLAY CLICK ═══════════════════════════

// Во всём проекте модальные окна закрываются только кнопками (×, «Отмена», «Закрыть»),
// клик мимо окна — по подложке *-modal-overlay — ничего не делает. Перехватываем такой клик
// на фазе захвата, до обработчиков самой модалки, — правило действует и для новых модалок.
document.addEventListener('click', e => {
  const t = e.target;
  if (t instanceof Element && Array.from(t.classList).some(c => c.endsWith('modal-overlay'))) e.stopPropagation();
}, true);


