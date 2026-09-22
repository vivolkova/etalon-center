SET NAMES utf8mb4;
-- ============================================================
-- V005 — Статусы броней в справочник booking_statuses.
-- Убираем подтверждение: клиент записался — и всё.
-- Пока только два значения: booked (записан) и cancelled (отменена).
-- ============================================================

-- 1. Справочник статусов (id фиксируем: 2 = cancelled используется в active_key).
CREATE TABLE booking_statuses (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(32)  NOT NULL UNIQUE,
    name       VARCHAR(64)  NOT NULL,
    sort_order INT DEFAULT 0,
    active     TINYINT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO booking_statuses (id, code, name, sort_order) VALUES
    (1, 'booked',    'Записан',  1),
    (2, 'cancelled', 'Отменена', 2);

-- 2. Новый столбец-ссылка.
ALTER TABLE bookings ADD COLUMN status_id INT NOT NULL DEFAULT 1 AFTER station_id;

-- 3. Переносим данные: всё, что не отменено (pending/confirmed) → booked(1); cancelled → cancelled(2).
UPDATE bookings SET status_id = IF(status = 'cancelled', 2, 1);

-- 4. Пересобираем защиту от овербукинга на новый столбец.
--    active_key и уникальные индексы зависят от status — снимаем в правильном порядке.
-- Страховочный индекс под FK по slot_id: без него нельзя снять uq_booking_station_active
ALTER TABLE bookings ADD INDEX idx_slot (slot_id);

ALTER TABLE bookings DROP INDEX uq_booking_station_active;
ALTER TABLE bookings DROP INDEX uq_booking_user_active;
ALTER TABLE bookings DROP COLUMN active_key;
ALTER TABLE bookings DROP INDEX idx_status;
ALTER TABLE bookings DROP COLUMN status;

-- active_key = 1 для активной брони, NULL для отменённой (status_id = 2 = cancelled).
ALTER TABLE bookings
    ADD COLUMN active_key TINYINT
        GENERATED ALWAYS AS (IF(status_id = 2, NULL, 1)) STORED AFTER status_id;

ALTER TABLE bookings
    ADD UNIQUE KEY uq_booking_station_active (slot_id, station_id, active_key),
    ADD UNIQUE KEY uq_booking_user_active    (user_id, slot_id, active_key);

-- 5. Внешний ключ на справочник.
ALTER TABLE bookings
    ADD CONSTRAINT fk_bookings_status FOREIGN KEY (status_id) REFERENCES booking_statuses(id);
