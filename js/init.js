// Старт приложения

// ═══ INIT ═════════════════════════════════════════════════════════

// Возврат со страницы оплаты ЮKassa (?payment=success). Вызов перенесён сюда из client/payment.js:
// при загрузке все функции должны быть уже подключены.
checkPaymentReturn();

renderServices();
renderSchedule();

// Загружаем все данные с сервера при старте
(async function () {
  // 1. Загружаем публичные данные (слоты, тренеры, планы абонементов)
  await Promise.allSettled([
    loadLocations(),
    loadSlots(),
    loadSpecialists(),
    loadSubPlans(),
    loadLibrary(),
    loadActivityCats(),
    loadServices(),
  ]);
  renderServices();   // перерисовываем карточки услуг данными из БД

  // 2. Восстанавливаем сессию
  await restoreSession();

  // 3. Если залогинен — загружаем персональные данные
  if (currentUser && Auth.isLoggedIn()) {
    await Promise.allSettled([
      loadNotifications(),
      loadChatDialogs(),
      currentUser.role === 'admin' ? loadClients() : Promise.resolve(),
      currentUser.role === 'admin' ? loadAdminBookings() : loadMyBookings(),
    ]);
  }

  // 4. Перерисовываем с актуальными данными
  renderSchedule();
  renderServices();
})();
