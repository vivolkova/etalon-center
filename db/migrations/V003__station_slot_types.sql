-- ============================================================
-- V003 — Справочники типов: station_types и slot_types
-- type в stations и slots переносится из ENUM в ссылку на справочник.
-- Типы глобальные (не привязаны к филиалу). У станков — иконка (SVG).
-- ============================================================
SET NAMES utf8mb4;

-- ── Типы станков ────────────────────────────────────────────
CREATE TABLE station_types (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64) NOT NULL,
    code        VARCHAR(32) NOT NULL UNIQUE,   -- машинное имя (для миграции старых значений)
    icon        TEXT,                          -- SVG-иконка (stroke=currentColor)
    sort_order  INT NOT NULL DEFAULT 0,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO station_types (name, code, icon, sort_order) VALUES
('Велотренажёр','exercise_bike','<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 57h52M10 57v-2M54 57v-2M27 57l2-8"/><rect x="18" y="34" width="34" height="15" rx="7.5"/><path d="M24 34l-1-18M16 13h13M24 23l22-2M46 21l1-9M43 12h9q4 0 4 4v4q0 3-3 3"/><circle cx="25" cy="41.5" r="6" stroke="#ff6a1a"/><path d="M25 41.5h-6"/><path d="M23 22l-.5-6" stroke="#ff6a1a"/></svg>',1),
('Велостанок','trainer_stand','<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7h22a4 4 0 0 1 4 4l3 39a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3l3-39a4 4 0 0 1 4-4zM18 53v4M46 53v4M13 57h9M42 57h9"/><g stroke="#ff6a1a"><circle cx="32" cy="21" r="9"/><circle cx="32" cy="21" r="4"/></g><path d="M23 36h9M27.5 36v10M35 36h5l-3 4a3 3 0 1 1-2 5" stroke="#1fa5a0"/></svg>',2),
('Роллерный станок','rollers','<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="36" r="10.5"/><circle cx="50" cy="36" r="10.5"/><path d="M14 36h16l-6-17M14 36l10-15h19l7 15M30 36l13-15M20 17h8M41 17h6"/><g stroke="#ff6a1a" stroke-width="3"><circle cx="9" cy="51" r="3.5"/><circle cx="19" cy="51" r="3.5"/><circle cx="50" cy="51" r="3.5"/><path d="M19 47.5h31M19 54.5h31"/></g><path d="M3 58h58M6 58v-2M58 58v-2" stroke-width="3"/></svg>',3);

-- stations.type (ENUM) -> stations.type_id (FK)
ALTER TABLE stations ADD COLUMN type_id INT NULL;
UPDATE stations SET type_id=(SELECT id FROM station_types WHERE code='exercise_bike') WHERE type='trainer';
UPDATE stations SET type_id=(SELECT id FROM station_types WHERE code='trainer_stand') WHERE type='roller';
ALTER TABLE stations MODIFY type_id INT NOT NULL;
ALTER TABLE stations ADD CONSTRAINT fk_stations_type FOREIGN KEY (type_id) REFERENCES station_types(id);
ALTER TABLE stations DROP COLUMN type;

-- ── Типы слотов ─────────────────────────────────────────────
CREATE TABLE slot_types (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64) NOT NULL,
    code        VARCHAR(32) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO slot_types (name, code, sort_order) VALUES
('Групповая','group',1),
('Свободная','open',2);

-- slots.type (ENUM) -> slots.type_id (FK)
ALTER TABLE slots ADD COLUMN type_id INT NULL;
UPDATE slots SET type_id=(SELECT id FROM slot_types WHERE code='group') WHERE type='group';
UPDATE slots SET type_id=(SELECT id FROM slot_types WHERE code='open')  WHERE type='open';
UPDATE slots SET type_id=(SELECT id FROM slot_types WHERE code='group') WHERE type_id IS NULL;
ALTER TABLE slots MODIFY type_id INT NOT NULL;
ALTER TABLE slots ADD CONSTRAINT fk_slots_type FOREIGN KEY (type_id) REFERENCES slot_types(id);
ALTER TABLE slots DROP COLUMN type;
