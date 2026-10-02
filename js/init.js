// Старт приложения

// ═══ INIT ═════════════════════════════════════════════════════════

// Возврат со страницы оплаты ЮKassa (?payment=success). Вызов перенесён сюда из client/payment.js:
// при загрузке все функции должны быть уже подключены.
checkPaymentReturn();

renderServices();

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
    loadDictValues(),
    loadDictAvailability(),
  ]);
  renderServices();   // страница «Услуги» — по справочнику и библиотеке

  // 2. Восстанавливаем сессию
  await restoreSession();

  // 3. Если залогинен — загружаем персональные данные
  if (currentUser && Auth.isLoggedIn()) {
    await Promise.allSettled([
      loadChatDialogs(),
      currentUser.role === 'admin' ? loadClients() : Promise.resolve(),
      currentUser.role === 'admin' ? loadAdminBookings() : loadMyBookings(),
    ]);
  }

  // 4. Перерисовываем с актуальными данными
  renderSitePages();
  renderServices();
})();
