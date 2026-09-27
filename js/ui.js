// Интерфейс: toast, закрытие модалок по клику на фон

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

// ═══ CLOSE MODALS ON OVERLAY CLICK ═══════════════════════════════

(document.getElementById('booking-modal') || { addEventListener: () => { } }).addEventListener('click', e => { if (e.target === e.currentTarget) closeBookingModal(); });
// Форма входа/регистрации — модальная: клик по подложке НЕ закрывает (только × или кнопка).
['slot-modal', 'service-modal', 'announce-modal', 'client-modal', 'client-profile-modal', 'slot-detail-modal', 'service-detail-modal', 'payment-modal', 'lib-modal', 'lib-to-sch-modal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
});


