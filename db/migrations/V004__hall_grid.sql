SET NAMES utf8mb4;
-- ============================================================
-- V004 — Настраиваемая схема зала (сетка) + роллерный станок во 2-й ряд
-- Размер сетки задаётся ПО ФИЛИАЛУ: в разных студиях разное число мест.
-- ============================================================

-- 1. Размер сетки зала на уровне филиала (колонки × ряды).
ALTER TABLE locations
  ADD COLUMN hall_cols TINYINT UNSIGNED NOT NULL DEFAULT 6 AFTER address,
  ADD COLUMN hall_rows TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER hall_cols;

-- Наш филиал: 6 колонок, 2 ряда (12 возможных мест).
UPDATE locations SET hall_cols = 6, hall_rows = 2 WHERE id = 1;

-- 2. Раскладка текущих 6 станков в первый ряд (pos_y = 0), колонки 0..5.
--    Координаты: pos_x = колонка (0..cols-1), pos_y = ряд (0..rows-1).
UPDATE stations SET pos_x = 0, pos_y = 0 WHERE location_id = 1 AND sort_order = 1;
UPDATE stations SET pos_x = 1, pos_y = 0 WHERE location_id = 1 AND sort_order = 2;
UPDATE stations SET pos_x = 2, pos_y = 0 WHERE location_id = 1 AND sort_order = 3;
UPDATE stations SET pos_x = 3, pos_y = 0 WHERE location_id = 1 AND sort_order = 4;
UPDATE stations SET pos_x = 4, pos_y = 0 WHERE location_id = 1 AND sort_order = 5;
UPDATE stations SET pos_x = 5, pos_y = 0 WHERE location_id = 1 AND sort_order = 6;

-- 3. Новый роллерный станок во второй ряд (pos_y = 1, колонка 0).
--    type_id берём из справочника по коду 'rollers' (Роллерный станок).
INSERT INTO stations (location_id, type_id, label, pos_x, pos_y, sort_order, active)
SELECT 1, t.id, 'Роллер 1', 0, 1, 7, 1
FROM station_types t
WHERE t.code = 'rollers';
