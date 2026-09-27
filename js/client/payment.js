// Кабинет клиента: оплата ЮKassa

// ═══ YUKASSA PAYMENT ════════════════════════════════════════════════
// Настройки ЮКассы — замените на реальные перед деплоем
const YUKASSA_SHOP_ID = 'YOUR_SHOP_ID';
const YUKASSA_SECRET_KEY = 'YOUR_SECRET_KEY';
const YUKASSA_RETURN_URL = window.location.origin + window.location.pathname + '?payment=success';

let currentPayBookingId = null;
let selectedPayMethod = 'bank_card';

function openPaymentModal(bookingId) {
  const b = bookings.find(x => x.id === bookingId);
  if (!b) return;
  currentPayBookingId = bookingId;
  selectedPayMethod = 'bank_card';

  document.getElementById('pay-service-name').textContent = b.service + ' · ' + b.time;
  document.getElementById('pay-amount').textContent = b.price.toLocaleString('ru') + ' ₽';

  // Сбросить выбор метода
  document.querySelectorAll('.pay-method').forEach((el, i) => el.classList.toggle('selected', i === 0));

  // Показать шаг 1
  document.getElementById('pay-step-1').style.display = '';
  document.getElementById('pay-step-2').style.display = 'none';
  document.getElementById('pay-step-3').style.display = 'none';

  document.getElementById('payment-modal').classList.add('show');

  // Проверить параметр ?payment=success после возврата
  checkPaymentReturn();
}

function closePaymentModal() {
  document.getElementById('payment-modal').classList.remove('show');
  currentPayBookingId = null;
}

function selectPayMethod(method, el) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-method').forEach(m => m.classList.remove('selected'));
  el.classList.add('selected');
}

async function initiateYookassaPayment() {
  const b = bookings.find(x => x.id === currentPayBookingId);
  if (!b) return;

  // Показать шаг загрузки
  document.getElementById('pay-step-1').style.display = 'none';
  document.getElementById('pay-step-2').style.display = '';

  const idempotenceKey = 'booking-' + b.id + '-' + Date.now();

  const paymentData = {
    amount: { value: b.price.toFixed(2), currency: 'RUB' },
    confirmation: {
      type: 'redirect',
      return_url: YUKASSA_RETURN_URL + '&booking_id=' + b.id
    },
    capture: true,
    description: b.service + ' · ' + (currentUser?.name || 'Клиент'),
    payment_method_type: selectedPayMethod,
    metadata: {
      booking_id: String(b.id),
      client_email: currentUser?.email || '',
      service: b.service
    }
  };

  try {
    // ⚠️  В продакшне этот запрос должен идти через backend (секретный ключ нельзя хранить во фронтенде)
    // Для демо — показываем как это должно работать
    if (YUKASSA_SHOP_ID === 'YOUR_SHOP_ID') {
      // DEMO MODE
      await new Promise(r => setTimeout(r, 1200));
      const demoPaymentId = 'pay_' + Math.random().toString(36).slice(2, 12);
      const demoUrl = 'https://yookassa.ru/checkout/payments/v2/contract?orderId=' + demoPaymentId;
      showPaymentLink(demoPaymentId, demoUrl, b);
    } else {
      const response = await fetch('https://api.yookassa.ru/v2/payments', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(YUKASSA_SHOP_ID + ':' + YUKASSA_SECRET_KEY),
          'Content-Type': 'application/json',
          'Idempotence-Key': idempotenceKey
        },
        body: JSON.stringify(paymentData)
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err.description || 'Ошибка API') + ' (' + response.status + ')');
      }
      const payment = await response.json();
      const confirmUrl = payment.confirmation?.confirmation_url;
      if (!confirmUrl) throw new Error('Не получена ссылка на оплату');
      b.yukassaPaymentId = payment.id;
      showPaymentLink(payment.id, confirmUrl, b);
    }
  } catch (err) {
    document.getElementById('pay-step-2').style.display = 'none';
    document.getElementById('pay-step-1').style.display = '';
    showToast('Ошибка создания платежа: ' + err.message, 'error');
    console.error('ЮКасса:', err);
  }
}

function showPaymentLink(paymentId, url, booking) {
  document.getElementById('pay-step-2').style.display = 'none';
  document.getElementById('pay-step-3').style.display = '';
  document.getElementById('pay-id').textContent = paymentId;
  const link = document.getElementById('pay-link');
  link.href = url;
  // При клике на ссылку — помечаем как "ожидает подтверждения"
  link.onclick = () => {
    booking.paymentStatus = 'pending_payment';
  };
}

function checkPaymentReturn() {
  // Проверяем возврат со страницы оплаты ЮКассы
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    const bId = parseInt(params.get('booking_id'));
    const b = bookings.find(x => x.id === bId);
    if (b) {
      b.paymentStatus = 'paid';
      // Убираем параметры из URL
      history.replaceState({}, '', window.location.pathname);
      showToast('Оплата прошла успешно', 'success');
      notifications.unshift({
        id: Date.now(), type: 'booking',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>`,
        title: 'Оплата получена',
        text: (b.clientId || '') + ' — ' + b.service + ' · ' + b.price.toLocaleString('ru') + ' ₽',
        time: 'только что', read: false
      });
    }
  }
}

function cpPayBooking(id) {
  const b = bookings.find(x => x.id === id);
  if (!b || b.paymentStatus === 'paid') return;
  // Имитация оплаты
  b.paymentStatus = 'paid';
  renderCpBookings();
  showToast('Оплата прошла успешно', 'success');
  // Уведомление в панель администратора
  notifications.unshift({ id: Date.now(), type: 'booking', icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>`, title: 'Оплата получена', text: (currentUser?.name || '') + ' — ' + b.service + ' · ' + b.price.toLocaleString('ru') + ' ₽', time: 'только что', read: false });
}

async function cpCancelBooking(id) {
  if (!confirm('Отменить запись?')) return;
  try {
    await BookingsAPI.setStatus(id, 'cancelled');   // пишем в БД
    await loadMyBookings();                            // перечитываем свои записи
    renderCpBookings();                               // перерисовываем кабинет
    showToast('Запись отменена');
  } catch (e) {
    showToast('Не удалось отменить запись', 'error');
  }
}

