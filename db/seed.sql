-- ============================================================
-- Эталон — ДАННЫЕ. Накатывать ПОСЛЕ db/schema.sql.
--   mysql -u USER -p DBNAME < db/seed.sql
-- Раздел 1 — базовые справочники и станки: нужны ВСЕГДА (в т.ч. на проде).
-- Раздел 2 — тестовые данные: ТОЛЬКО для локальной разработки.
-- ============================================================
SET NAMES utf8mb4;

-- ─────────────── РАЗДЕЛ 1. БАЗОВЫЕ ДАННЫЕ ───────────────

-- Справочники (коды латиницей, подписи русские). id не фиксируем — логика по кодам.
INSERT INTO dictionaries (group_code, code, name) VALUES
('user_role', 'client', 'Клиент'),
('user_role', 'admin', 'Администратор'),
('activity_category', 'training', 'Тренировка'),
('service_category', 'bikefit', 'Байкфит'),
('service_category', 'workshop', 'Мастерская'),
('slot_type', 'group', 'Групповая'),
('slot_type', 'personal', 'Персональная'),
('slot_type', 'free', 'Самостоятельная'),
('specialist_type', 'trainer', 'Тренер'),
('specialist_type', 'bikefitter', 'Байкфиттер'),
('specialist_type', 'mechanic', 'Мастер');

-- Связь категория активности -> тип специалиста (dictionaries.ref_id).
-- Новая категория (например, massage -> masseur) — добавить пару сюда.
UPDATE dictionaries c
JOIN dictionaries s ON s.group_code = 'specialist_type'
 AND (c.code, s.code) IN (('training', 'trainer'), ('bikefit', 'bikefitter'), ('workshop', 'mechanic'))
SET c.ref_id = s.id
WHERE c.group_code IN ('activity_category', 'service_category');

-- Типы станков (вынесены из dictionaries).
INSERT INTO station_type (name, icon) VALUES
('Велотренажёр', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 57h52M10 57v-2M54 57v-2M27 57l2-8"/><rect x="18" y="34" width="34" height="15" rx="7.5"/><path d="M24 34l-1-18M16 13h13M24 23l22-2M46 21l1-9M43 12h9q4 0 4 4v4q0 3-3 3"/><circle cx="25" cy="41.5" r="6" stroke="#ff6a1a"/><path d="M25 41.5h-6"/><path d="M23 22l-.5-6" stroke="#ff6a1a"/></svg>'),
('Велостанок 11s', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7h22a4 4 0 0 1 4 4l3 39a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3l3-39a4 4 0 0 1 4-4zM18 53v4M46 53v4M13 57h9M42 57h9"/><g stroke="#ff6a1a"><circle cx="32" cy="21" r="9"/><circle cx="32" cy="21" r="4"/></g><path d="M23 36h9M27.5 36v10M35 36h5l-3 4a3 3 0 1 1-2 5" stroke="#1fa5a0"/></svg>'),
('Велостанок 12s', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7h22a4 4 0 0 1 4 4l3 39a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3l3-39a4 4 0 0 1 4-4zM18 53v4M46 53v4M13 57h9M42 57h9"/><g stroke="#ff6a1a"><circle cx="32" cy="21" r="9"/><circle cx="32" cy="21" r="4"/></g><path d="M23 36h9M27.5 36v10M35 36h5l-3 4a3 3 0 1 1-2 5" stroke="#1fa5a0"/></svg>'),
('Роллерный станок', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="36" r="10.5"/><circle cx="50" cy="36" r="10.5"/><path d="M14 36h16l-6-17M14 36l10-15h19l7 15M30 36l13-15M20 17h8M41 17h6"/><g stroke="#ff6a1a" stroke-width="3"><circle cx="9" cy="51" r="3.5"/><circle cx="19" cy="51" r="3.5"/><circle cx="50" cy="51" r="3.5"/><path d="M19 47.5h31M19 54.5h31"/></g><path d="M3 58h58M6 58v-2M58 58v-2" stroke-width="3"/></svg>');

-- Филиал по умолчанию (зал 6×2 = 12 мест).
INSERT INTO locations (name, address, hall_cols, hall_rows, max_people, email, phone, work_hours) VALUES
('Эталон — основной филиал', 'Лиственная 18', 6, 2, 7, 'info@etaloncenter.ru', '+7 495 000-00-00',
 '[{"day":"Понедельник","open":true,"from":"07:00","to":"22:00"},{"day":"Вторник","open":true,"from":"07:00","to":"22:00"},{"day":"Среда","open":true,"from":"07:00","to":"22:00"},{"day":"Четверг","open":true,"from":"07:00","to":"22:00"},{"day":"Пятница","open":true,"from":"07:00","to":"21:00"},{"day":"Суббота","open":true,"from":"09:00","to":"20:00"},{"day":"Воскресенье","open":false,"from":"10:00","to":"18:00"}]');

-- Параметры студии (меняются в админке: Настройки студии → Параметры)
INSERT INTO settings (code, name, value) VALUES
('location_travel_minutes', 'Время на переезд между филиалами по умолчанию, мин', '90'),
('client_booking_lead_minutes', 'Индивидуальная запись: не позже чем за, мин до начала', '60'),
('client_booking_horizon_days', 'Индивидуальная запись: не дальше чем на, дней вперёд', '30'),
('free_training_max_minutes', 'Самостоятельная тренировка: максимальная длительность, мин', '180'),
('free_training_extra_price', 'Самостоятельная тренировка: доплата за каждые 30 минут сверх базовой длительности, ₽', '500');

-- Категории активностей и типы специалистов доступны в основном филиале (филиалы у значений — явным списком)
INSERT INTO location_dictionaries (dictionary_id, location_id)
SELECT d.id, l.id FROM dictionaries d CROSS JOIN locations l
WHERE d.group_code IN ('activity_category', 'service_category', 'specialist_type');

-- Станки основного филиала: 1-й ряд — 4 велотренажёра + 2 велостанка, 2-й ряд — роллер.
INSERT INTO stations (location_id, type_id, label, pos_x, pos_y, sort_order) VALUES
(1, (SELECT id FROM station_type WHERE name='Велотренажёр'), 'Smart Bike 1', 0, 0, 1),
(1, (SELECT id FROM station_type WHERE name='Велотренажёр'), 'Smart Bike 2', 1, 0, 2),
(1, (SELECT id FROM station_type WHERE name='Велотренажёр'), 'Smart Bike 3', 2, 0, 3),
(1, (SELECT id FROM station_type WHERE name='Велотренажёр'), 'Smart Bike 4', 3, 0, 4),
(1, (SELECT id FROM station_type WHERE name='Велостанок 11s'), 'Станок 11S', 4, 0, 5),
(1, (SELECT id FROM station_type WHERE name='Велостанок 12s'), 'Станок 12S', 5, 0, 6),
(1, (SELECT id FROM station_type WHERE name='Роллерный станок'), 'Роллер 1', 0, 1, 7);


-- ─────────────── РАЗДЕЛ 2. ТЕСТОВЫЕ ДАННЫЕ (только dev) ───────────────

-- Второй филиал (id = 2): зал 3×2, 6 мест; Пн–Сб 08:00–21:00, Вс — выходной
INSERT INTO locations (name, address, hall_cols, hall_rows, max_people, email, phone, work_hours) VALUES
('Эталон — Юг', 'Южная 5', 3, 2, 6, 'south@etaloncenter.ru', '+7 495 000-00-01',
 '[{"day":"Понедельник","open":true,"from":"08:00","to":"21:00"},{"day":"Вторник","open":true,"from":"08:00","to":"21:00"},{"day":"Среда","open":true,"from":"08:00","to":"21:00"},{"day":"Четверг","open":true,"from":"08:00","to":"21:00"},{"day":"Пятница","open":true,"from":"08:00","to":"21:00"},{"day":"Суббота","open":true,"from":"08:00","to":"21:00"},{"day":"Воскресенье","open":false,"from":"","to":""}]');
SET @south = LAST_INSERT_ID();

-- В «Юге» — только тренировки, их ведёт тренер (байкфита и мастерской нет)
INSERT INTO location_dictionaries (dictionary_id, location_id)
SELECT d.id, @south FROM dictionaries d
WHERE (d.group_code, d.code) IN (('activity_category', 'training'), ('specialist_type', 'trainer'));

-- Зал «Юга» настроен: два велотренажёра и велостанок (1-й ряд)
INSERT INTO stations (location_id, type_id, label, pos_x, pos_y, sort_order) VALUES
(@south, (SELECT id FROM station_type WHERE name='Велотренажёр'),   'Юг Bike 1',   0, 0, 1),
(@south, (SELECT id FROM station_type WHERE name='Велотренажёр'),   'Юг Bike 2',   1, 0, 2),
(@south, (SELECT id FROM station_type WHERE name='Велостанок 11s'), 'Юг Станок 1', 2, 0, 3);

-- Переезд между основным филиалом и «Югом» — 45 минут (для остальных пар — значение по умолчанию)
INSERT INTO location_travel (location_a_id, location_b_id, minutes) VALUES (1, @south, 45);

INSERT INTO specialists (name, full_name, experience) VALUES
('Анна К.',   'Анна Козлова',   5),
('Максим Р.', 'Максим Романов', 7),
('Игорь Б.',  'Игорь Белов',    6);

-- Типы специалистов: Максим — и тренер, и байкфиттер
INSERT INTO specialist_types (specialist_id, type_id)
SELECT sp.id, d.id FROM specialists sp
JOIN dictionaries d ON d.group_code = 'specialist_type'
 AND (sp.full_name, d.code) IN (('Анна Козлова', 'trainer'), ('Максим Романов', 'trainer'),
                                ('Максим Романов', 'bikefitter'), ('Игорь Белов', 'bikefitter'));

INSERT INTO subscription_plans (location_id, name, sessions, price, validity, color, sort_order) VALUES
(1, 'Старт',   4, 4200, 30, '#6b7280', 1),
(1, 'Базовый', 8, 7500, 30, '#00BAB3', 2);

-- Локальный админ: admin@local / admin123
INSERT INTO users (email, password, name, phone, role_id, type) VALUES
('admin@local', '$2y$12$N6HM/utEyDnERNj9S/WPIumZmbMtnbnWEbkeuzytl5O.HLuZYoWnK', 'Админ (dev)', '',
 (SELECT id FROM dictionaries WHERE group_code='user_role' AND code='admin'), 'new'),
-- Клиент (dev): vikisvolkova@gmail.com
('vikisvolkova@gmail.com', '$2y$12$t4RYOd0pszvOvb0W2X8QQuCZ808dHmohFy5m5t.2vXjlJ5xyGhV7i', 'Виктория', '+79515506666',
 (SELECT id FROM dictionaries WHERE group_code='user_role' AND code='client'), 'new');

-- Графики и исключения ниже заводит локальный админ (created_by обязателен)
SET @dev_admin = (SELECT id FROM users WHERE email = 'admin@local');

-- Графики специалистов (в пределах режима работы филиалов). Анна — по месяцам: сентябрь, октябрь, ноябрь 2026
-- (в остальные месяцы не работает); Максим и Игорь — бессрочно. Максим по вторникам и четвергам вечером — в «Юге»
-- (location_id 2), остальное — в основном филиале (location_id 1).
INSERT INTO specialist_schedules (specialist_id, name, date_from, date_to, work_hours, created_by) VALUES
(1, 'Сентябрь 2026', '2026-09-01', '2026-09-30',
 '[{"day":"Понедельник","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Вторник","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Среда","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Четверг","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Пятница","intervals":[{"from":"07:00","to":"11:00","location_id":1}]},{"day":"Суббота","intervals":[{"from":"09:00","to":"13:00","location_id":1}]},{"day":"Воскресенье","intervals":[]}]', @dev_admin),
(1, 'Октябрь 2026', '2026-10-01', '2026-10-31',
 '[{"day":"Понедельник","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Вторник","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Среда","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Четверг","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Пятница","intervals":[{"from":"07:00","to":"11:00","location_id":1},{"from":"17:00","to":"20:00","location_id":1}]},{"day":"Суббота","intervals":[{"from":"09:00","to":"13:00","location_id":1}]},{"day":"Воскресенье","intervals":[]}]', @dev_admin),
(1, 'Ноябрь 2026', '2026-11-01', '2026-11-30',
 '[{"day":"Понедельник","intervals":[{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Вторник","intervals":[{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Среда","intervals":[{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Четверг","intervals":[{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Пятница","intervals":[{"from":"17:00","to":"21:00","location_id":1}]},{"day":"Суббота","intervals":[{"from":"10:00","to":"14:00","location_id":1}]},{"day":"Воскресенье","intervals":[]}]', @dev_admin),
(2, 'Основной', '2026-01-01', NULL,
 '[{"day":"Понедельник","intervals":[{"from":"10:00","to":"14:00","location_id":1},{"from":"18:00","to":"22:00","location_id":1}]},{"day":"Вторник","intervals":[{"from":"10:00","to":"14:00","location_id":1},{"from":"18:00","to":"21:00","location_id":2}]},{"day":"Среда","intervals":[{"from":"10:00","to":"14:00","location_id":1},{"from":"18:00","to":"22:00","location_id":1}]},{"day":"Четверг","intervals":[{"from":"10:00","to":"14:00","location_id":1},{"from":"18:00","to":"21:00","location_id":2}]},{"day":"Пятница","intervals":[{"from":"10:00","to":"14:00","location_id":1},{"from":"18:00","to":"21:00","location_id":1}]},{"day":"Суббота","intervals":[]},{"day":"Воскресенье","intervals":[]}]', @dev_admin),
(3, 'Основной', '2026-01-01', NULL,
 '[{"day":"Понедельник","intervals":[]},{"day":"Вторник","intervals":[{"from":"10:00","to":"18:00","location_id":1}]},{"day":"Среда","intervals":[]},{"day":"Четверг","intervals":[{"from":"10:00","to":"18:00","location_id":1}]},{"day":"Пятница","intervals":[]},{"day":"Суббота","intervals":[{"from":"10:00","to":"18:00","location_id":1}]},{"day":"Воскресенье","intervals":[]}]', @dev_admin);

-- Исключения: сборы и соревнования (не работает), день с особыми часами
INSERT INTO specialist_exceptions (specialist_id, date_from, date_to, type, work_hours, reason, created_by) VALUES
(1, '2026-10-12', '2026-10-25', 'off',    NULL, 'Сборы', @dev_admin),
(1, '2026-10-30', '2026-10-30', 'custom', '[{"from":"12:00","to":"16:00","location_id":1}]', 'Перенос часов', @dev_admin),
(2, '2026-10-04', '2026-10-04', 'off',    NULL, 'Соревнования', @dev_admin);

-- Библиотека тренировок и услуг (единый источник описаний; коды сложности, подписи — на фронте)
INSERT INTO library (location_id, name, activity_category_id, slot_type_id, duration, price, difficulty, summary, details) VALUES
-- Тренировки (activity_category = training)
(1,'Утренний сайкл',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'),60,1200,'beginner',
 'Лёгкая утренняя тренировка для разгона метаболизма. Аэробная зона, комфортный темп.',
 JSON_ARRAY('Аэробная зона ЧСС 60-70%','Темп: 85-95 RPM','Zwift - равнинные трассы','Подходит после перерыва')),
(1,'Endurance Ride',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'),90,1500,'intermediate',
 'Длинная тренировка на выносливость. Стабильная мощность, развивает аэробную базу.',
 JSON_ARRAY('Зона 2-3 по мощности','Темп: 80-90 RPM','Без спринтов и ускорений','Подготовка к гранфондо')),
(1,'Интервальный сайкл',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'),60,1200,'advanced',
 'Высокоинтенсивные интервалы для роста МПК и скоростной выносливости.',
 JSON_ARRAY('Интервалы 30/30, 1/1, 4 мин','Пиковая мощность 120-150% FTP','Zwift - гонки','VO2max развитие')),
(1,'Персональная тренировка',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='personal'),60,2500,'any',
 'Индивидуальное занятие с тренером. Программа полностью под ваш уровень и цели.',
 JSON_ARRAY('Тест FTP при первом занятии','Индивидуальный план','Анализ педалирования','Обратная связь в реальном времени')),
(1,'Восстановительная',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'),45,900,'beginner',
 'Лёгкое восстановительное занятие после интенсивных тренировок или соревнований.',
 JSON_ARRAY('Зона 1 по мощности','Высокий каденс 95-105 RPM','Без нагрузки','Растяжка в конце')),
(1,'Свободная тренировка',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='free'),60,800,'any',
 'Самостоятельная тренировка на смарт-тренере в удобном темпе. Зал, оборудование и Zwift в вашем распоряжении - без программы и тренера.',
 JSON_ARRAY('Свободный график нагрузки','Доступ к Zwift и ERG-режиму','Подходит для любого уровня','Оплата за одно посещение')),
-- Услуги (категории service_category)
(1,'Байкфит стандарт',
 (SELECT id FROM dictionaries WHERE group_code='service_category' AND code='bikefit'), NULL,120,9500,'any',
 'Полная настройка посадки с видеозахватом в трёх плоскостях.',
 JSON_ARRAY('Замеры углов в ключевых точках','Настройка седла, руля, шипов','Видеоразбор со специалистом','PDF-отчёт с параметрами')),
(1,'Байкфит PRO',
 (SELECT id FROM dictionaries WHERE group_code='service_category' AND code='bikefit'), NULL,180,12000,'any',
 'Максимальный формат: байкфит, индивидуальные стельки и 3D-анализ.',
 JSON_ARRAY('Всё из стандартного байкфита','3D-сканирование позиции','Индивидуальные ортопедические стельки','Расширенный цифровой отчёт')),
(1,'Настройка шипов',
 (SELECT id FROM dictionaries WHERE group_code='service_category' AND code='bikefit'), NULL,60,3500,'any',
 'Точная установка шипов по биомеханике стопы для эффективного педалирования.',
 JSON_ARRAY('Анализ положения стопы','Установка угла и смещения шипов','Проверка на станке','Рекомендации по обуви')),
(1,'ТО среднее',
 (SELECT id FROM dictionaries WHERE group_code='service_category' AND code='workshop'), NULL,60,3400,'any',
 'Плановое обслуживание для поддержания велосипеда в рабочем состоянии.',
 JSON_ARRAY('Настройка переключателей и тормозов','Смазка и промывка цепи','Протяжка спиц','Проверка давления')),
(1,'Капитальное ТО',
 (SELECT id FROM dictionaries WHERE group_code='service_category' AND code='workshop'), NULL,180,6900,'any',
 'Полная переборка всех узлов велосипеда с промывкой и диагностикой.',
 JSON_ARRAY('Разборка и сборка каретки','Переборка втулок и рулевой','Замена расходников','Финальная настройка и тест')),
(1,'Диагностика',
 (SELECT id FROM dictionaries WHERE group_code='service_category' AND code='workshop'), NULL,30,1500,'any',
 'Быстрая проверка состояния велосипеда с рекомендациями по обслуживанию.',
 JSON_ARRAY('Проверка всех узлов','Список необходимых работ','Оценка стоимости ремонта','Без разборки'));

-- Слоты расписания (тестовые): неделя 05–11.10.2026 — только групповые тренировки из библиотеки
-- (остальное записывает клиент), в часы работы тренеров по их графикам (периоды выше).
-- Даты фиксированные, как и графики, — чтобы расписание всегда было согласовано с графиками.
-- Название, длительность и цена — из записи библиотеки.
INSERT INTO slots (location_id, library_id, name, category_id, slot_date, start_time, duration, specialist_id, price)
SELECT 1, l.id, l.name, l.activity_category_id, v.slot_date, v.start_time, l.duration, sp.id, l.price
FROM (
  SELECT '2026-10-05' AS slot_date, '08:00:00' AS start_time, 'Утренний сайкл' AS lib, 'Анна Козлова' AS spec
  UNION ALL SELECT '2026-10-05' AS slot_date, '18:30:00' AS start_time, 'Интервальный сайкл' AS lib, 'Максим Романов' AS spec
  UNION ALL SELECT '2026-10-06' AS slot_date, '10:00:00' AS start_time, 'Endurance Ride' AS lib, 'Максим Романов' AS spec
  UNION ALL SELECT '2026-10-06' AS slot_date, '18:00:00' AS start_time, 'Интервальный сайкл' AS lib, 'Анна Козлова' AS spec
  UNION ALL SELECT '2026-10-07' AS slot_date, '08:00:00' AS start_time, 'Утренний сайкл' AS lib, 'Анна Козлова' AS spec
  UNION ALL SELECT '2026-10-07' AS slot_date, '19:00:00' AS start_time, 'Восстановительная' AS lib, 'Максим Романов' AS spec
  UNION ALL SELECT '2026-10-08' AS slot_date, '12:00:00' AS start_time, 'Восстановительная' AS lib, 'Максим Романов' AS spec
  UNION ALL SELECT '2026-10-08' AS slot_date, '17:30:00' AS start_time, 'Endurance Ride' AS lib, 'Анна Козлова' AS spec
  UNION ALL SELECT '2026-10-09' AS slot_date, '18:00:00' AS start_time, 'Интервальный сайкл' AS lib, 'Анна Козлова' AS spec
  UNION ALL SELECT '2026-10-10' AS slot_date, '10:00:00' AS start_time, 'Утренний сайкл' AS lib, 'Анна Козлова' AS spec
) v
JOIN library l      ON l.name = v.lib AND l.location_id = 1
JOIN specialists sp ON sp.full_name = v.spec
ORDER BY v.slot_date, v.start_time;

-- Библиотека «Юга»: групповые тренировки
INSERT INTO library (location_id, name, activity_category_id, slot_type_id, duration, price, difficulty, summary, details)
SELECT @south, v.name, dc.id, dt.id, v.duration, v.price, v.difficulty, v.summary, v.details
FROM (
  SELECT 'Вечерний сайкл' AS name, 60 AS duration, 1100 AS price, 'any' AS difficulty,
         'Групповая тренировка после работы: ровный темп и интервалы средней интенсивности.' AS summary,
         JSON_ARRAY('Аэробная зона ЧСС 65-75%', 'Zwift — групповой заезд', 'Подходит для любого уровня') AS details
  UNION ALL
  SELECT 'Силовой сайкл', 75, 1300, 'intermediate',
         'Работа на низком каденсе с высоким сопротивлением — развивает силу педалирования.',
         JSON_ARRAY('Каденс 60-70 RPM', 'Зона мощности Z3-Z4', 'Нужен опыт тренировок')
) v
JOIN dictionaries dc ON dc.group_code = 'activity_category' AND dc.code = 'training'
JOIN dictionaries dt ON dt.group_code = 'slot_type' AND dt.code = 'group';

-- Занятия Максима в «Юге» на тестовой неделе (Вт и Чт вечером, по его графику)
INSERT INTO slots (location_id, library_id, name, category_id, slot_date, start_time, duration, specialist_id, price)
SELECT @south, l.id, l.name, l.activity_category_id, v.slot_date, v.start_time, l.duration, sp.id, l.price
FROM (
  SELECT '2026-10-06' AS slot_date, '18:30:00' AS start_time, 'Вечерний сайкл' AS lib
  UNION ALL SELECT '2026-10-08', '19:00:00', 'Силовой сайкл'
) v
JOIN library l      ON l.name = v.lib AND l.location_id = @south
JOIN specialists sp ON sp.full_name = 'Максим Романов'
ORDER BY v.slot_date, v.start_time;

