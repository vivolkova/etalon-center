SET NAMES utf8mb4;
-- ============================================================
-- V008 — Чистка индексов bookings: убираем избыточные.
-- idx_user дублируется uq_booking_user_active (ведущая колонка user_id),
-- idx_slot — uq_booking_station_active (ведущая колонка slot_id).
-- Внешние ключи (user_id, slot_id) опираются на эти составные индексы.
-- ============================================================
ALTER TABLE bookings DROP INDEX idx_user;
ALTER TABLE bookings DROP INDEX idx_slot;
