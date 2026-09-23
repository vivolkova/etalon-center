SET NAMES utf8mb4;
-- ============================================================
-- V006 — Единый справочник dictionaries вместо мелких таблиц/ENUM.
-- group_code — код справочника (неизменяем, защищён триггером).
-- Уникальность активной брони держится на active_key, который
-- заполняет триггер ПО КОДУ статуса — без числовых id в логике.
-- ============================================================

CREATE TABLE dictionaries (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    group_code VARCHAR(40)  NOT NULL,
    code       VARCHAR(40)  NOT NULL,
    name       VARCHAR(100) NOT NULL,
    icon       TEXT NULL,
    sort_order INT DEFAULT 0,
    active     TINYINT DEFAULT 1,
    UNIQUE KEY uq_dict (group_code, code),
    KEY idx_group (group_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$
CREATE TRIGGER trg_dict_group_immutable BEFORE UPDATE ON dictionaries
FOR EACH ROW
BEGIN
    IF NEW.group_code <> OLD.group_code THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'group_code is immutable';
    END IF;
END$$
DELIMITER ;

-- id заданы явно только для читабельности; логика на них не завязана.
INSERT INTO dictionaries (id, group_code, code, name, sort_order) VALUES
    (1,  'user_role',      'client',        'Клиент',            1),
    (2,  'user_role',      'admin',         'Администратор',     2),
    (3,  'library_type',   'training',      'Тренировка',        1),
    (4,  'library_type',   'service',       'Услуга',            2),
    (5,  'slot_category',  'training',      'Тренировка',        1),
    (6,  'slot_category',  'bikefit',       'Байкфит',           2),
    (7,  'slot_category',  'workshop',      'Мастерская',        3),
    (10, 'station_type',   'exercise_bike', 'Велотренажёр',      1),
    (11, 'station_type',   'trainer_stand', 'Велостанок',        2),
    (12, 'station_type',   'rollers',       'Роллерный станок',  3),
    (20, 'slot_type',      'group',         'Групповая',         1),
    (21, 'slot_type',      'open',          'Свободная',         2),
    (30, 'booking_status', 'booked',        'Записан',           1),
    (31, 'booking_status', 'cancelled',     'Отменена',          2);

UPDATE dictionaries d
    JOIN station_types t ON t.code = d.code
    SET d.icon = t.icon
    WHERE d.group_code = 'station_type';

-- stations.type_id -> dictionaries
ALTER TABLE stations DROP FOREIGN KEY fk_stations_type;
UPDATE stations s
    JOIN station_types t ON s.type_id = t.id
    JOIN dictionaries d ON d.group_code = 'station_type' AND d.code = t.code
    SET s.type_id = d.id;
ALTER TABLE stations ADD CONSTRAINT fk_stations_type FOREIGN KEY (type_id) REFERENCES dictionaries(id);

-- slots.type_id -> dictionaries
ALTER TABLE slots DROP FOREIGN KEY fk_slots_type;
UPDATE slots s
    JOIN slot_types t ON s.type_id = t.id
    JOIN dictionaries d ON d.group_code = 'slot_type' AND d.code = t.code
    SET s.type_id = d.id;
ALTER TABLE slots ADD CONSTRAINT fk_slots_type FOREIGN KEY (type_id) REFERENCES dictionaries(id);

-- slots.category -> slots.category_id
ALTER TABLE slots ADD COLUMN category_id INT NULL AFTER category;
UPDATE slots s
    JOIN dictionaries d ON d.group_code = 'slot_category' AND d.code = s.category
    SET s.category_id = d.id;
ALTER TABLE slots MODIFY category_id INT NOT NULL;
ALTER TABLE slots DROP COLUMN category;
ALTER TABLE slots ADD CONSTRAINT fk_slots_category FOREIGN KEY (category_id) REFERENCES dictionaries(id);

-- users.role -> users.role_id
ALTER TABLE users ADD COLUMN role_id INT NULL AFTER role;
UPDATE users u
    JOIN dictionaries d ON d.group_code = 'user_role' AND d.code = u.role
    SET u.role_id = d.id;
ALTER TABLE users MODIFY role_id INT NOT NULL;
ALTER TABLE users DROP COLUMN role;
ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES dictionaries(id);

-- library.type -> library.type_id
ALTER TABLE library ADD COLUMN type_id INT NULL AFTER type;
UPDATE library l
    JOIN dictionaries d ON d.group_code = 'library_type' AND d.code = l.type
    SET l.type_id = d.id;
ALTER TABLE library MODIFY type_id INT NOT NULL;
ALTER TABLE library DROP COLUMN type;
ALTER TABLE library ADD CONSTRAINT fk_library_type FOREIGN KEY (type_id) REFERENCES dictionaries(id);

-- bookings.status_id -> dictionaries; перенос старых значений ПО КОДУ (без чисел)
ALTER TABLE bookings DROP FOREIGN KEY fk_bookings_status;
ALTER TABLE bookings DROP INDEX uq_booking_station_active;
ALTER TABLE bookings DROP INDEX uq_booking_user_active;
ALTER TABLE bookings DROP COLUMN active_key;
UPDATE bookings b
    JOIN booking_statuses old ON b.status_id = old.id
    JOIN dictionaries d ON d.group_code = 'booking_status' AND d.code = old.code
    SET b.status_id = d.id;
ALTER TABLE bookings MODIFY status_id INT NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_status FOREIGN KEY (status_id) REFERENCES dictionaries(id);

-- active_key: 1 у активной брони, NULL у отменённой. Выставляет триггер по КОДУ статуса.
-- NULL-ы в уникальном индексе считаются различными => много отменённых, одна активная.
ALTER TABLE bookings ADD COLUMN active_key TINYINT NULL AFTER status_id;

DELIMITER $$
CREATE TRIGGER trg_bookings_active_ins BEFORE INSERT ON bookings
FOR EACH ROW
BEGIN
    SET NEW.active_key = IF(
        NEW.status_id = (SELECT id FROM dictionaries WHERE group_code = 'booking_status' AND code = 'cancelled'),
        NULL, 1);
END$$
CREATE TRIGGER trg_bookings_active_upd BEFORE UPDATE ON bookings
FOR EACH ROW
BEGIN
    SET NEW.active_key = IF(
        NEW.status_id = (SELECT id FROM dictionaries WHERE group_code = 'booking_status' AND code = 'cancelled'),
        NULL, 1);
END$$
DELIMITER ;

-- заполнить active_key для уже существующих строк (по коду, без чисел)
UPDATE bookings
    SET active_key = IF(
        status_id = (SELECT id FROM dictionaries WHERE group_code = 'booking_status' AND code = 'cancelled'),
        NULL, 1);

ALTER TABLE bookings
    ADD UNIQUE KEY uq_booking_station_active (slot_id, station_id, active_key),
    ADD UNIQUE KEY uq_booking_user_active    (user_id, slot_id, active_key);

-- Старые справочники-таблицы больше не нужны
DROP TABLE station_types;
DROP TABLE slot_types;
DROP TABLE booking_statuses;
