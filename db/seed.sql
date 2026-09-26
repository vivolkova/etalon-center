-- ============================================================
-- Эталон — ДАННЫЕ. Накатывать ПОСЛЕ db/schema.sql.
--   mysql -u USER -p DBNAME < db/seed.sql
-- Раздел 1 — базовые справочники и станки: нужны ВСЕГДА (в т.ч. на проде).
-- Раздел 2 — тестовые данные: ТОЛЬКО для локальной разработки.
-- ============================================================
SET NAMES utf8mb4;

-- ─────────────── РАЗДЕЛ 1. БАЗОВЫЕ ДАННЫЕ ───────────────

-- Справочники (коды латиницей, подписи русские). id не фиксируем — логика по кодам.
INSERT INTO dictionaries (group_code, code, name, icon, sort_order) VALUES
('user_role', 'client', 'Клиент', NULL, 1),
('user_role', 'admin', 'Администратор', NULL, 2),
('library_type', 'training', 'Тренировка', NULL, 1),
('library_type', 'service', 'Услуга', NULL, 2),
('activity_category', 'training', 'Тренировка', NULL, 1),
('activity_category', 'bikefit', 'Байкфит', NULL, 2),
('activity_category', 'workshop', 'Мастерская', NULL, 3),
('station_type', 'exercise_bike', 'Велотренажёр', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 57h52M10 57v-2M54 57v-2M27 57l2-8"/><rect x="18" y="34" width="34" height="15" rx="7.5"/><path d="M24 34l-1-18M16 13h13M24 23l22-2M46 21l1-9M43 12h9q4 0 4 4v4q0 3-3 3"/><circle cx="25" cy="41.5" r="6" stroke="#ff6a1a"/><path d="M25 41.5h-6"/><path d="M23 22l-.5-6" stroke="#ff6a1a"/></svg>', 1),
('station_type', 'trainer_stand_11', 'Велостанок', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7h22a4 4 0 0 1 4 4l3 39a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3l3-39a4 4 0 0 1 4-4zM18 53v4M46 53v4M13 57h9M42 57h9"/><g stroke="#ff6a1a"><circle cx="32" cy="21" r="9"/><circle cx="32" cy="21" r="4"/></g><path d="M23 36h9M27.5 36v10M35 36h5l-3 4a3 3 0 1 1-2 5" stroke="#1fa5a0"/></svg>', 2),
('station_type', 'trainer_stand_12', 'Велостанок', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7h22a4 4 0 0 1 4 4l3 39a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3l3-39a4 4 0 0 1 4-4zM18 53v4M46 53v4M13 57h9M42 57h9"/><g stroke="#ff6a1a"><circle cx="32" cy="21" r="9"/><circle cx="32" cy="21" r="4"/></g><path d="M23 36h9M27.5 36v10M35 36h5l-3 4a3 3 0 1 1-2 5" stroke="#1fa5a0"/></svg>', 3),
('station_type', 'rollers', 'Роллерный станок', '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="36" r="10.5"/><circle cx="50" cy="36" r="10.5"/><path d="M14 36h16l-6-17M14 36l10-15h19l7 15M30 36l13-15M20 17h8M41 17h6"/><g stroke="#ff6a1a" stroke-width="3"><circle cx="9" cy="51" r="3.5"/><circle cx="19" cy="51" r="3.5"/><circle cx="50" cy="51" r="3.5"/><path d="M19 47.5h31M19 54.5h31"/></g><path d="M3 58h58M6 58v-2M58 58v-2" stroke-width="3"/></svg>', 4),
('slot_type', 'group', 'Групповая', NULL, 1),
('slot_type', 'open', 'Свободная', NULL, 2);

-- Филиал по умолчанию (зал 6×2 = 12 мест).
INSERT INTO locations (id, name, address, hall_cols, hall_rows) VALUES
(1, 'Эталон — основной филиал', '', 6, 2);

-- Станки основного филиала: 1-й ряд — 4 велотренажёра + 2 велостанка, 2-й ряд — роллер.
INSERT INTO stations (location_id, type_id, label, pos_x, pos_y, sort_order) VALUES
(1, (SELECT id FROM dictionaries WHERE group_code='station_type' AND code='exercise_bike'), 'Smart Bike 1', 0, 0, 1),
(1, (SELECT id FROM dictionaries WHERE group_code='station_type' AND code='exercise_bike'), 'Smart Bike 2', 1, 0, 2),
(1, (SELECT id FROM dictionaries WHERE group_code='station_type' AND code='exercise_bike'), 'Smart Bike 3', 2, 0, 3),
(1, (SELECT id FROM dictionaries WHERE group_code='station_type' AND code='exercise_bike'), 'Smart Bike 4', 3, 0, 4),
(1, (SELECT id FROM dictionaries WHERE group_code='station_type' AND code='trainer_stand_11'), 'Станок 11S', 4, 0, 5),
(1, (SELECT id FROM dictionaries WHERE group_code='station_type' AND code='trainer_stand_12'), 'Станок 12S', 5, 0, 6),
(1, (SELECT id FROM dictionaries WHERE group_code='station_type' AND code='rollers'), 'Роллер 1', 0, 1, 7);


-- ─────────────── РАЗДЕЛ 2. ТЕСТОВЫЕ ДАННЫЕ (только dev) ───────────────

INSERT INTO trainers (location_id, name, full_name, speciality, experience, rating, color) VALUES
(1, 'Анна К.',   'Анна Козлова',   'Групповые тренировки', 5, 4.9, '#00BAB3'),
(1, 'Максим Р.', 'Максим Романов', 'HIIT',                 7, 4.8, '#4e42b5');

INSERT INTO subscription_plans (location_id, name, sessions, price, validity, color, sort_order) VALUES
(1, 'Старт',   4, 4200, 30, '#6b7280', 1),
(1, 'Базовый', 8, 7500, 30, '#00BAB3', 2);

-- Локальный админ: admin@local / admin123
INSERT INTO users (email, password, name, phone, role_id, type) VALUES
('admin@local', '$2y$12$N6HM/utEyDnERNj9S/WPIumZmbMtnbnWEbkeuzytl5O.HLuZYoWnK', 'Админ (dev)', '',
 (SELECT id FROM dictionaries WHERE group_code='user_role' AND code='admin'), 'new');

-- Библиотека тренировок и услуг (единый источник описаний; коды сложности, подписи — на фронте)
INSERT INTO library (location_id, type_id, name, category_id, duration, price, max_people, difficulty, summary, details) VALUES
-- Тренировки (library_type = training)
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='training'),'Утренний сайкл',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),60,1200,12,'beginner',
 'Лёгкая утренняя тренировка для разгона метаболизма. Аэробная зона, комфортный темп.',
 JSON_ARRAY('Аэробная зона ЧСС 60-70%','Темп: 85-95 RPM','Zwift - равнинные трассы','Подходит после перерыва')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='training'),'Endurance Ride',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),90,1500,8,'intermediate',
 'Длинная тренировка на выносливость. Стабильная мощность, развивает аэробную базу.',
 JSON_ARRAY('Зона 2-3 по мощности','Темп: 80-90 RPM','Без спринтов и ускорений','Подготовка к гранфондо')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='training'),'Интервальный сайкл',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),60,1200,12,'advanced',
 'Высокоинтенсивные интервалы для роста МПК и скоростной выносливости.',
 JSON_ARRAY('Интервалы 30/30, 1/1, 4 мин','Пиковая мощность 120-150% FTP','Zwift - гонки','VO2max развитие')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='training'),'Персональная тренировка',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),60,2500,1,'any',
 'Индивидуальное занятие с тренером. Программа полностью под ваш уровень и цели.',
 JSON_ARRAY('Тест FTP при первом занятии','Индивидуальный план','Анализ педалирования','Обратная связь в реальном времени')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='training'),'Восстановительная',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),45,900,8,'beginner',
 'Лёгкое восстановительное занятие после интенсивных тренировок или соревнований.',
 JSON_ARRAY('Зона 1 по мощности','Высокий каденс 95-105 RPM','Без нагрузки','Растяжка в конце')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='training'),'Свободная тренировка',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),60,800,12,'any',
 'Самостоятельная тренировка на смарт-тренере в удобном темпе. Зал, оборудование и Zwift в вашем распоряжении - без программы и тренера.',
 JSON_ARRAY('Свободный график нагрузки','Доступ к Zwift и ERG-режиму','Подходит для любого уровня','Оплата за одно посещение')),
-- Услуги (library_type = service)
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='service'),'Байкфит стандарт',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='bikefit'),120,9500,NULL,'any',
 'Полная настройка посадки с видеозахватом в трёх плоскостях.',
 JSON_ARRAY('Замеры углов в ключевых точках','Настройка седла, руля, шипов','Видеоразбор со специалистом','PDF-отчёт с параметрами')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='service'),'Байкфит PRO',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='bikefit'),180,12000,NULL,'any',
 'Максимальный формат: байкфит, индивидуальные стельки и 3D-анализ.',
 JSON_ARRAY('Всё из стандартного байкфита','3D-сканирование позиции','Индивидуальные ортопедические стельки','Расширенный цифровой отчёт')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='service'),'Настройка шипов',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='bikefit'),60,3500,NULL,'any',
 'Точная установка шипов по биомеханике стопы для эффективного педалирования.',
 JSON_ARRAY('Анализ положения стопы','Установка угла и смещения шипов','Проверка на станке','Рекомендации по обуви')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='service'),'ТО среднее',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='workshop'),60,3400,NULL,'any',
 'Плановое обслуживание для поддержания велосипеда в рабочем состоянии.',
 JSON_ARRAY('Настройка переключателей и тормозов','Смазка и промывка цепи','Протяжка спиц','Проверка давления')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='service'),'Капитальное ТО',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='workshop'),180,6900,NULL,'any',
 'Полная переборка всех узлов велосипеда с промывкой и диагностикой.',
 JSON_ARRAY('Разборка и сборка каретки','Переборка втулок и рулевой','Замена расходников','Финальная настройка и тест')),
(1,(SELECT id FROM dictionaries WHERE group_code='library_type' AND code='service'),'Диагностика',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='workshop'),30,1500,NULL,'any',
 'Быстрая проверка состояния велосипеда с рекомендациями по обслуживанию.',
 JSON_ARRAY('Проверка всех узлов','Список необходимых работ','Оценка стоимости ремонта','Без разборки'));

-- Слоты расписания на ближайшую неделю (тестовые)
INSERT INTO slots (location_id, library_id, name, category_id, type_id, slot_date, start_time, duration, trainer_id, price, max_people) VALUES
(1, (SELECT id FROM library WHERE name='Интервальный сайкл' LIMIT 1), 'Интервальный сайкл', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 0 DAY, '10:00:00', 60, 1, 1200, 7),
(1, (SELECT id FROM library WHERE name='Восстановительная' LIMIT 1), 'Восстановительная', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 0 DAY, '19:00:00', 60, 2, 900, 7),
(1, (SELECT id FROM library WHERE name='Утренний сайкл' LIMIT 1), 'Утренний сайкл', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 1 DAY, '09:00:00', 60, 1, 1200, 7),
(1, (SELECT id FROM library WHERE name='Endurance Ride' LIMIT 1), 'Endurance Ride', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 1 DAY, '18:00:00', 60, 2, 1500, 7),
(1, (SELECT id FROM library WHERE name='Свободная тренировка' LIMIT 1), 'Свободная тренировка', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='open'), CURDATE() + INTERVAL 2 DAY, '12:00:00', 60, NULL, 800, 7),
(1, (SELECT id FROM library WHERE name='Интервальный сайкл' LIMIT 1), 'Интервальный сайкл', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 2 DAY, '20:00:00', 60, 1, 1200, 7),
(1, (SELECT id FROM library WHERE name='Утренний сайкл' LIMIT 1), 'Утренний сайкл', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 3 DAY, '10:00:00', 60, 1, 1200, 7),
(1, (SELECT id FROM library WHERE name='Интервальный сайкл' LIMIT 1), 'Интервальный сайкл', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 4 DAY, '17:00:00', 60, 2, 1200, 7),
(1, (SELECT id FROM library WHERE name='Свободная тренировка' LIMIT 1), 'Свободная тренировка', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='open'), CURDATE() + INTERVAL 4 DAY, '19:00:00', 60, NULL, 800, 7),
(1, (SELECT id FROM library WHERE name='Endurance Ride' LIMIT 1), 'Endurance Ride', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 5 DAY, '11:00:00', 60, 1, 1500, 7),
(1, (SELECT id FROM library WHERE name='Восстановительная' LIMIT 1), 'Восстановительная', (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'), (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'), CURDATE() + INTERVAL 6 DAY, '12:00:00', 60, 2, 900, 7);

-- Услуги главной страницы (перенос из localStorage в БД)
INSERT INTO services (location_id, icon, name, description, price, features, sort_order) VALUES
(1, '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M8.5 17.5h7m-3-10.5l2 4 2-1.5m-4 0l-3 4h5"/><circle cx="15" cy="6" r="1"/></svg>', 'Групповые тренировки', 'Динамичные занятия на смарт-тренерах с Zwift. Подходят для любого уровня подготовки.', 'от 1 200 ₽', JSON_ARRAY('До 12 участников в группе', 'Zwift и ERG-режим на смарт-тренерах', 'Тренер ведёт занятие онлайн', 'Разминка и заминка включены'), 1),
(1, '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>', 'Персональные тренировки', 'Индивидуальные занятия с тренером. Программа под ваши цели: похудение, выносливость, скорость.', '2 500 ₽ / час', JSON_ARRAY('Индивидуальная программа под ваши цели', 'Анализ мощности и ЧСС', 'Гибкое расписание', 'Доступ к данным через приложение'), 2),
(1, '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>', 'Байкфит стандарт', 'Полная настройка посадки с видеозахватом. 2 часа, подробный отчёт с замерами.', '9 500 ₽', JSON_ARRAY('2 часа работы с фиттером', 'Видеозахват и замеры', 'Настройка седла, руля, шипов', 'PDF-отчёт со всеми параметрами'), 3),
(1, '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.5 15.5L7 22l5-2 5 2-1.5-6.5"/></svg>', 'Байкфит PRO', 'Максимальный формат: байкфит + индивидуальные стельки + цифровой отчёт.', '12 000 ₽', JSON_ARRAY('Всё из стандартного байкфита', 'Индивидуальные стельки', '3D-анализ движения', 'Расширенный цифровой отчёт'), 4),
(1, '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>', 'Техобслуживание', 'Среднее ТО: настройка переключателей и тормозов, смазка цепи, протяжка спиц.', 'от 3 400 ₽', JSON_ARRAY('Настройка переключателей и тормозов', 'Смазка и промывка цепи', 'Протяжка спиц', 'Проверка давления в покрышках'), 5),
(1, '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>', 'Капитальный ремонт', 'Полная переборка всех узлов, промывка, диагностика. Велосипед будет как новый.', 'от 6 900 ₽', JSON_ARRAY('Полная разборка и сборка велосипеда', 'Промывка всех узлов', 'Замена расходников (по необходимости)', 'Финальная настройка и тест-райд'), 6);
