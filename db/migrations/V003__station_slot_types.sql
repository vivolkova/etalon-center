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
('Велотренажёр','exercise_bike','<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 56 H26"/><path d="M38 56 H54"/><path d="M18 56 L26 45"/><path d="M46 56 L38 45"/><ellipse cx="31" cy="44" rx="10" ry="9"/><path d="M27 37 L20 22"/><path d="M14 21 H26"/><path d="M35 37 L41 12"/><path d="M34 15 H47"/><rect x="37" y="5" width="11" height="7" rx="1.5"/></svg>',1),
('Велостанок','trainer_stand','<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="47" cy="43" r="12"/><circle cx="30" cy="46" r="4"/><path d="M30 46 L34 50"/><path d="M30 46 L26 22"/><path d="M30 46 L42 25"/><path d="M26 22 L42 25"/><path d="M42 25 L47 43"/><path d="M30 46 L16 43"/><path d="M26 22 L16 43"/><path d="M20 20 H28"/><path d="M42 25 L45 19 M40 19 H51 M51 19 L51 24 L48 25"/><path d="M9 55 L13 43 L19 43 L23 55 Z"/><circle cx="16" cy="50" r="3.2"/><path d="M4 56 H26"/></svg>',2),
('Роллерный станок','rollers','<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="27" r="10"/><circle cx="45" cy="27" r="10"/><path d="M17 27 L29 27 L24 12 L17 27"/><path d="M24 12 L38 14 L29 27"/><path d="M38 14 L45 27"/><path d="M19 10 H27"/><path d="M38 14 L42 8 M36 8 H47 M47 8 L47 13"/><path d="M6 52 H58"/><circle cx="14" cy="47" r="3.2"/><circle cx="31" cy="47" r="3.2"/><circle cx="48" cy="47" r="3.2"/></svg>',3);

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
