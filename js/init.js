// Старт приложения

// ═══ INIT ═════════════════════════════════════════════════════════

renderServices();

// Загружаем все данные с сервера при старте
(async function () {
  // 1. Загружаем публичные данные (слоты, тренеры, библиотека, справочники)
  await Promise.allSettled([
    loadLocations(),
    loadSlots(),
    loadSpecialists(),
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
      currentUser.role === 'admin' ? loadClients() : Promise.resolve(),
      currentUser.role === 'admin' ? loadAdminBookings() : loadMyBookings(),
    ]);
  }

  // 4. Перерисовываем с актуальными данными
  renderSitePages();
  renderServices();
})();
