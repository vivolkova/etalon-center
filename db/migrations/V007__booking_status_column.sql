SET NAMES utf8mb4;
-- ============================================================
-- V007 — Статус брони обратно в колонку bookings.status (VARCHAR + CHECK).
-- Справочник dictionaries остаётся для admin-управляемых списков.
-- Статус брони — конечный автомат: код ветвится по каждому значению,
-- поэтому храним читаемый код прямо в строке, без join/id/триггеров.
-- Коды в БД: booked / cancelled. Отображение на форме: Активна / Отменена.
-- ============================================================

-- 1) Новая колонка-код; заполняем из текущего status_id по коду справочника
ALTER TABLE bookings ADD COLUMN status VARCHAR(20) NULL AFTER station_id;
UPDATE bookings b JOIN dictionaries d ON b.status_id = d.id SET b.status = d.code;

-- 2) Снимаем всё, что было завязано на status_id
DROP TRIGGER IF EXISTS trg_bookings_active_ins;
DROP TRIGGER IF EXISTS trg_bookings_active_upd;
ALTER TABLE bookings DROP INDEX uq_booking_station_active;
ALTER TABLE bookings DROP INDEX uq_booking_user_active;
ALTER TABLE bookings DROP COLUMN active_key;
ALTER TABLE bookings DROP FOREIGN KEY fk_bookings_status;
ALTER TABLE bookings DROP COLUMN status_id;

-- 3) Ограничения на статус
ALTER TABLE bookings MODIFY status VARCHAR(20) NOT NULL DEFAULT 'booked';
ALTER TABLE bookings ADD CONSTRAINT chk_booking_status CHECK (status IN ('booked','cancelled'));

-- 4) active_key — снова генерируемая колонка прямо по коду (без id и триггеров)
ALTER TABLE bookings
    ADD COLUMN active_key TINYINT GENERATED ALWAYS AS (IF(status = 'cancelled', NULL, 1)) STORED AFTER status;
ALTER TABLE bookings
    ADD UNIQUE KEY uq_booking_station_active (slot_id, station_id, active_key),
    ADD UNIQUE KEY uq_booking_user_active    (user_id, slot_id, active_key);

-- 5) booking_status в справочнике больше не нужен (остальные группы остаются)
DELETE FROM dictionaries WHERE group_code = 'booking_status';
