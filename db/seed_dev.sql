-- Тестовые данные ТОЛЬКО для локальной разработки.
SET NAMES utf8mb4;

INSERT INTO trainers (location_id, name, full_name, speciality, experience, rating, color) VALUES
(1, 'Анна К.',   'Анна Козлова',   'Групповые тренировки', 5, 4.9, '#00BAB3'),
(1, 'Максим Р.', 'Максим Романов', 'HIIT',                 7, 4.8, '#4e42b5');

INSERT INTO subscription_plans (location_id, name, sessions, price, validity, color, sort_order) VALUES
(1, 'Старт',   4, 4200, 30, '#6b7280', 1),
(1, 'Базовый', 8, 7500, 30, '#00BAB3', 2);

-- Локальный админ: admin@local / admin123
INSERT INTO users (email, password, name, role_id, status) VALUES
('admin@local', '$2y$12$N6HM/utEyDnERNj9S/WPIumZmbMtnbnWEbkeuzytl5O.HLuZYoWnK', 'Админ (dev)',
 (SELECT id FROM dictionaries WHERE group_code='user_role' AND code='admin'), 'active');

-- Пара слотов на завтра
INSERT INTO slots (location_id, name, category_id, type_id, slot_date, start_time, duration, trainer_id, price) VALUES
(1, 'Интервальный сайкл',
 (SELECT id FROM dictionaries WHERE group_code='slot_category' AND code='training'),
 (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='group'),
 CURDATE() + INTERVAL 1 DAY, '10:00:00', 60, 1, 1200),
(1, 'Свободная тренировка',
 (SELECT id FROM dictionaries WHERE group_code='slot_category' AND code='training'),
 (SELECT id FROM dictionaries WHERE group_code='slot_type' AND code='open'),
 CURDATE() + INTERVAL 1 DAY, '12:00:00', 60, NULL, 800);
