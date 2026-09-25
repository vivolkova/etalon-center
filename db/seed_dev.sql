-- Тестовые данные ТОЛЬКО для локальной разработки.
SET NAMES utf8mb4;

INSERT INTO trainers (location_id, name, full_name, speciality, experience, rating, color) VALUES
(1, 'Анна К.',   'Анна Козлова',   'Групповые тренировки', 5, 4.9, '#00BAB3'),
(1, 'Максим Р.', 'Максим Романов', 'HIIT',                 7, 4.8, '#4e42b5');

INSERT INTO subscription_plans (location_id, name, sessions, price, validity, color, sort_order) VALUES
(1, 'Старт',   4, 4200, 30, '#6b7280', 1),
(1, 'Базовый', 8, 7500, 30, '#00BAB3', 2);

-- Локальный админ: admin@local / admin123
INSERT INTO users (email, password, name, phone, role_id, status) VALUES
('admin@local', '$2y$12$N6HM/utEyDnERNj9S/WPIumZmbMtnbnWEbkeuzytl5O.HLuZYoWnK', 'Админ (dev)', '',
 (SELECT id FROM dictionaries WHERE group_code='user_role' AND code='admin'), 'active');

-- Библиотека тренировок и услуг (единый источник описаний; коды сложности, подписи — на фронте)
INSERT INTO library (location_id, type_id, name, category_id, duration, price, max_people, difficulty, description, features) VALUES
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

-- Пара слотов на завтра
INSERT INTO slots (location_id, library_id, name, category_id, type_id, slot_date, start_time, duration, trainer_id, price, max_people) VALUES
(1, (SELECT id FROM library WHERE name='Интервальный сайкл' LIMIT 1), 'Интервальный сайкл',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),
 (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'),
 CURDATE() + INTERVAL 1 DAY, '10:00:00', 60, 1, 1200, 12),
(1, (SELECT id FROM library WHERE name='Свободная тренировка' LIMIT 1), 'Свободная тренировка',
 (SELECT id FROM dictionaries WHERE group_code='activity_category' AND code='training'),
 (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='open'),
 CURDATE() + INTERVAL 1 DAY, '12:00:00', 60, NULL, 800, 12);

-- Услуги главной страницы (перенос из localStorage в БД)
INSERT INTO services (location_id, theme, icon, name, description, price, cta, page, sort_order) VALUES
(1, 'green', '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M8.5 17.5h7m-3-10.5l2 4 2-1.5m-4 0l-3 4h5"/><circle cx="15" cy="6" r="1"/></svg>', 'Групповые тренировки', 'Динамичные занятия на смарт-тренерах с Zwift. Подходят для любого уровня подготовки.', 'от 1 200 ₽', 'Смотреть расписание', 'schedule', 1),
(1, 'green', '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>', 'Персональные тренировки', 'Индивидуальные занятия с тренером. Программа под ваши цели: похудение, выносливость, скорость.', '2 500 ₽ / час', 'Смотреть расписание', 'schedule', 2),
(1, 'amber', '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>', 'Байкфит стандарт', 'Полная настройка посадки с видеозахватом. 2 часа, подробный отчёт с замерами.', '9 500 ₽', 'Записаться', 'schedule', 3),
(1, 'amber', '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.5 15.5L7 22l5-2 5 2-1.5-6.5"/></svg>', 'Байкфит PRO', 'Максимальный формат: байкфит + индивидуальные стельки + цифровой отчёт.', '12 000 ₽', 'Записаться', 'schedule', 4),
(1, 'purple', '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>', 'Техобслуживание', 'Среднее ТО: настройка переключателей и тормозов, смазка цепи, протяжка спиц.', 'от 3 400 ₽', 'Записаться', 'schedule', 5),
(1, 'purple', '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>', 'Капитальный ремонт', 'Полная переборка всех узлов, промывка, диагностика. Велосипед будет как новый.', 'от 6 900 ₽', 'Записаться', 'schedule', 6);
