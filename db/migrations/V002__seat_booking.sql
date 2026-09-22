SET NAMES utf8mb4;
-- ============================================================
-- V002 — Бронь с выбором места (станки, филиалы, тип слота)
-- Накатывается на ТЕКУЩУЮ живую MySQL-базу поверх V001.
-- ПЕРЕД НАКАТКОЙ — сделать бэкап (Экспорт из phpMyAdmin, структура + данные)!
--
-- Изменения безопасны для текущего кода:
--   • bookings.station_id — NULLABLE, поэтому старый INSERT без station_id
--     продолжит работать, пока код не обновим.
--   • slots.taken и slots.max_people НЕ трогаем — их ещё использует текущий PHP.
--     Уберём отдельной миграцией уже ПОСЛЕ обновления кода.
-- ============================================================

-- 1) Филиалы + первый филиал (нужен раньше, т.к. на него ссылаются FK) ────
CREATE TABLE locations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    address     VARCHAR(512),
    timezone    VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
    active      TINYINT(1)  NOT NULL DEFAULT 1,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO locations (id, name, address) VALUES (1, 'Эталон — основной филиал', '');

-- 2) location_id в операционные таблицы (nullable → бэкфилл → FK) ──────────
-- Приём: сперва nullable, чтобы существующие строки не сломали ADD COLUMN,
-- затем проставляем всем филиал 1, затем вешаем внешний ключ.
ALTER TABLE trainers            ADD COLUMN location_id INT NULL;
ALTER TABLE library             ADD COLUMN location_id INT NULL;
ALTER TABLE slots               ADD COLUMN location_id INT NULL;
ALTER TABLE subscription_plans  ADD COLUMN location_id INT NULL;

UPDATE trainers            SET location_id = 1 WHERE location_id IS NULL;
UPDATE library             SET location_id = 1 WHERE location_id IS NULL;
UPDATE slots               SET location_id = 1 WHERE location_id IS NULL;
UPDATE subscription_plans  SET location_id = 1 WHERE location_id IS NULL;

ALTER TABLE trainers            ADD CONSTRAINT fk_trainers_location  FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE library             ADD CONSTRAINT fk_library_location   FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE slots               ADD CONSTRAINT fk_slots_location     FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE subscription_plans  ADD CONSTRAINT fk_plans_location     FOREIGN KEY (location_id) REFERENCES locations(id);

-- 3) Станки + 6 станков основного филиала ─────────────────────────────────
CREATE TABLE stations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    type        ENUM('trainer','roller') NOT NULL,   -- велотренажёр / велостанок
    label       VARCHAR(64) NOT NULL,
    pos_x       INT NOT NULL DEFAULT 0,               -- координаты для схемы зала
    pos_y       INT NOT NULL DEFAULT 0,
    sort_order  INT NOT NULL DEFAULT 0,
    active      TINYINT(1) NOT NULL DEFAULT 1,        -- глобально доступен (не в ремонте)
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Координаты pos_x/pos_y — черновые, поправишь под реальную планировку зала.
INSERT INTO stations (location_id, type, label, pos_x, pos_y, sort_order) VALUES
(1, 'trainer', 'Тренажёр 1', 0, 0, 1),
(1, 'trainer', 'Тренажёр 2', 1, 0, 2),
(1, 'trainer', 'Тренажёр 3', 2, 0, 3),
(1, 'trainer', 'Тренажёр 4', 3, 0, 4),
(1, 'roller',  'Станок 1',   0, 1, 5),
(1, 'roller',  'Станок 2',   1, 1, 6);

-- 4) Блокировка станка на конкретный слот (персоналка/ремонт) ─────────────
CREATE TABLE slot_station_blocks (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    slot_id     INT NOT NULL,
    station_id  INT NOT NULL,
    reason      VARCHAR(255),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_slot_station (slot_id, station_id),
    FOREIGN KEY (slot_id)    REFERENCES slots(id)    ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5) Тип слота: group (групповая) / open (свободная тренировка) ───────────
ALTER TABLE slots
    ADD COLUMN type ENUM('group','open') NOT NULL DEFAULT 'group';

-- 6) Бронь конкретного станка + фикс овербукинга ──────────────────────────
-- station_id NULLABLE (см. шапку). FK на станок.
ALTER TABLE bookings
    ADD COLUMN station_id INT NULL,
    ADD CONSTRAINT fk_bookings_station FOREIGN KEY (station_id) REFERENCES stations(id);

-- Старое ограничение uniq_user_slot убираем: оно запрещало повторную запись
-- на слот даже после отмены. Ниже — более гибкая версия «одна АКТИВНАЯ бронь».
ALTER TABLE bookings DROP INDEX uniq_user_slot;

-- ВНИМАНИЕ — трюк для «одной активной брони» (в MySQL нет частичного индекса):
-- active_key = 1 для активной брони, NULL для отменённой. Уникальный индекс
-- считает NULL-ы РАЗНЫМИ, поэтому отменённых на одно место может быть много,
-- а активная — ровно одна. Это ключевое место, где легко ошибиться.
ALTER TABLE bookings
    ADD COLUMN active_key TINYINT
        GENERATED ALWAYS AS (IF(status = 'cancelled', NULL, 1)) STORED;

ALTER TABLE bookings
    ADD UNIQUE KEY uq_booking_station_active (slot_id, station_id, active_key),
    ADD UNIQUE KEY uq_booking_user_active    (user_id, slot_id, active_key);
