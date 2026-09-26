-- ============================================================
-- Эталон — ПОЛНАЯ СТРУКТУРА БД (единый файл, без миграций).
-- Накатывать на чистую базу:  mysql -u USER -p DBNAME < db/schema.sql
-- Данные (справочники + тестовые) — отдельно: db/seed.sql
-- Диалект: MySQL 8. Кодировка: utf8mb4. В структуре нет русских значений
-- по умолчанию — только латинские коды; русские подписи хранятся в данных.
-- Таблицы идут в порядке зависимостей, поэтому FOREIGN_KEY_CHECKS не нужен.
-- ============================================================
SET NAMES utf8mb4;

-- ── Филиалы ─────────────────────────────────────────────────
-- Размер сетки зала задаётся по филиалу (hall_cols × hall_rows).
CREATE TABLE locations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    address     VARCHAR(512) NOT NULL,
    hall_cols   TINYINT UNSIGNED NOT NULL,
    hall_rows   TINYINT UNSIGNED NOT NULL,
    max_people  INT          NOT NULL,               -- максимальная вместимость зала (единый источник; задаётся в админке)
    email       VARCHAR(255) NOT NULL,
    phone       VARCHAR(32)  NOT NULL,
    work_hours  JSON,                                 -- режим работы: [{day,open,from,to}]
    timezone    VARCHAR(64)  NOT NULL DEFAULT 'Europe/Moscow',
    active      TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Единый справочник ───────────────────────────────────────
-- group_code — код справочника (user_role, library_type, activity_category,
-- slot_type); неизменяем — защищён триггером ниже.
-- station_type вынесен в отдельную таблицу (см. ниже).
CREATE TABLE dictionaries (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    group_code VARCHAR(40)  NOT NULL,
    code       VARCHAR(40)  NOT NULL,
    name       VARCHAR(100) NOT NULL,
    active     TINYINT DEFAULT 1,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

-- ── Типы станков ────────────────────────────────────────────
-- Отдельный справочник (раньше был группой station_type в dictionaries).
-- icon — SVG-иконка типа станка для схемы зала.
CREATE TABLE station_type (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(40)  NOT NULL,
    name       VARCHAR(100) NOT NULL,
    icon       TEXT NULL,
    active     TINYINT DEFAULT 1,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_station_type_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Пользователи ────────────────────────────────────────────
CREATE TABLE users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,           -- bcrypt hash
    name        VARCHAR(255) NOT NULL,
    phone       VARCHAR(32)  NOT NULL,
    role_id     INT NOT NULL,                    -- dictionaries.user_role
    type        ENUM('new','vip') DEFAULT 'new',           -- категория клиента
    active      TINYINT(1)   NOT NULL DEFAULT 1,        -- soft-delete: 0 = удалён/отключён
    bike        VARCHAR(64),
    birth_date  DATE,
    notes       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY fk_users_role (role_id),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES dictionaries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Тренеры ─────────────────────────────────────────────────
CREATE TABLE trainers (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    full_name   VARCHAR(255) NOT NULL,
    speciality  VARCHAR(255),
    experience  INT DEFAULT 0,
    rating      DECIMAL(3,1) DEFAULT 5.0,
    color       VARCHAR(16) DEFAULT '#00BAB3',
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    location_id INT,
    KEY fk_trainers_location (location_id),
    CONSTRAINT fk_trainers_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Библиотека тренировок/услуг (источник описаний слотов) ───
CREATE TABLE library (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    type_id     INT NOT NULL,                    -- dictionaries.library_type
    name        VARCHAR(255) NOT NULL,
    category_id INT NOT NULL,                    -- dictionaries.activity_category
    duration    INT NOT NULL DEFAULT 60,
    price       INT NOT NULL,
    difficulty  VARCHAR(32) DEFAULT 'any',       -- код; подпись на фронте
    summary     TEXT,                            -- краткое описание тренировки
    details     JSON,                            -- список особенностей
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    location_id INT,
    KEY fk_library_location (location_id),
    KEY fk_library_type (type_id),
    KEY fk_library_category (category_id),
    CONSTRAINT fk_library_type     FOREIGN KEY (type_id)     REFERENCES dictionaries(id),
    CONSTRAINT fk_library_category FOREIGN KEY (category_id) REFERENCES dictionaries(id),
    CONSTRAINT fk_library_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Слоты расписания ────────────────────────────────────────
CREATE TABLE slots (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    library_id  INT,                             -- источник описания (nullable)
    name        VARCHAR(255) NOT NULL,
    category_id INT NOT NULL,                    -- dictionaries.activity_category
    type_id     INT NOT NULL,                    -- dictionaries.slot_type
    slot_date   DATE NOT NULL,
    start_time  TIME NOT NULL,
    duration    INT NOT NULL DEFAULT 60,
    trainer_id  INT,
    price       INT NOT NULL,
    taken       INT DEFAULT 0,                    -- сколько станков забронировано (вместимость — из locations)
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    location_id INT,
    KEY idx_active_date (active, slot_date),
    KEY trainer_id (trainer_id),
    KEY library_id (library_id),
    KEY fk_slots_location (location_id),
    KEY fk_slots_type (type_id),
    KEY fk_slots_category (category_id),
    CONSTRAINT fk_slots_category FOREIGN KEY (category_id) REFERENCES dictionaries(id),
    CONSTRAINT fk_slots_type     FOREIGN KEY (type_id)     REFERENCES dictionaries(id),
    CONSTRAINT fk_slots_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT fk_slots_trainer  FOREIGN KEY (trainer_id)  REFERENCES trainers(id)  ON DELETE SET NULL,
    CONSTRAINT fk_slots_library  FOREIGN KEY (library_id)  REFERENCES library(id)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Станки (места в зале) ───────────────────────────────────
CREATE TABLE stations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    type_id     INT NOT NULL,                    -- station_type.id
    label       VARCHAR(64) NOT NULL,
    pos_x       INT NOT NULL DEFAULT 0,          -- колонка сетки зала
    pos_y       INT NOT NULL DEFAULT 0,          -- ряд сетки зала
    sort_order  INT NOT NULL DEFAULT 0,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY location_id (location_id),
    KEY fk_stations_type (type_id),
    CONSTRAINT fk_stations_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT fk_stations_type     FOREIGN KEY (type_id)     REFERENCES station_type(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Брони ───────────────────────────────────────────────────
-- status — конечный автомат (booked/cancelled), код прямо в строке.
-- active_key = 1 у активной брони, NULL у отменённой. В уникальном индексе
-- NULL-ы различны => на одно место много отменённых, но лишь одна активная.
CREATE TABLE bookings (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    slot_id        INT NOT NULL,
    station_id     INT,
    status         VARCHAR(20) NOT NULL DEFAULT 'booked',
    active_key     TINYINT GENERATED ALWAYS AS (IF(status = 'cancelled', NULL, 1)) STORED,
    payment_status ENUM('unpaid','paid','refunded') DEFAULT 'unpaid',
    payment_id     VARCHAR(128),
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_booking_station_active (slot_id, station_id, active_key),
    UNIQUE KEY uq_booking_user_active    (user_id, slot_id, active_key),
    KEY fk_bookings_station (station_id),
    CONSTRAINT fk_bookings_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_slot    FOREIGN KEY (slot_id)    REFERENCES slots(id)    ON DELETE CASCADE,
    CONSTRAINT fk_bookings_station FOREIGN KEY (station_id) REFERENCES stations(id),
    CONSTRAINT chk_booking_status  CHECK (status IN ('booked','cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Блокировка станка на конкретный слот (ремонт/персоналка) ─
CREATE TABLE slot_station_blocks (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    slot_id     INT NOT NULL,
    station_id  INT NOT NULL,
    reason      VARCHAR(255),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_slot_station (slot_id, station_id),
    KEY station_id (station_id),
    CONSTRAINT fk_ssb_slot    FOREIGN KEY (slot_id)    REFERENCES slots(id)    ON DELETE CASCADE,
    CONSTRAINT fk_ssb_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Абонементы: тарифы и покупки ────────────────────────────
CREATE TABLE subscription_plans (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    sessions    INT DEFAULT 8,
    price       INT NOT NULL,
    validity    INT DEFAULT 30,
    color       VARCHAR(16) DEFAULT '#00BAB3',
    features    JSON,
    active      TINYINT(1) DEFAULT 1,
    sort_order  INT DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    location_id INT,
    KEY fk_plans_location (location_id),
    CONSTRAINT fk_plans_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE subscriptions (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    plan_id       INT NOT NULL,
    sessions_left INT NOT NULL,
    expires_at    DATE NOT NULL,
    status        ENUM('active','expired','cancelled') DEFAULT 'active',
    payment_id    VARCHAR(128),
    price_paid    INT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user (user_id),
    KEY idx_status (status),
    KEY plan_id (plan_id),
    CONSTRAINT fk_subs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Услуги (карточки на главной) ────────────────────────────
CREATE TABLE services (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL DEFAULT 1,
    icon        TEXT,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    price       VARCHAR(64),                             -- маркетинговый текст
    features    JSON,
    sort_order  INT DEFAULT 0,
    active      TINYINT(1)   DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY fk_services_location (location_id),
    CONSTRAINT fk_services_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Чат ─────────────────────────────────────────────────────
CREATE TABLE chat_messages (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    from_user   INT NOT NULL,
    to_user     INT,
    message     TEXT NOT NULL,
    is_read     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_from (from_user),
    KEY idx_to (to_user),
    KEY idx_read (is_read),
    CONSTRAINT fk_chat_from FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Уведомления ─────────────────────────────────────────────
CREATE TABLE notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    type        VARCHAR(32) DEFAULT 'info',
    title       VARCHAR(255) NOT NULL,
    message     TEXT,
    target_user INT,
    is_read     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_target (target_user),
    KEY idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Сессии (server-side JWT/сессии) ─────────────────────────
CREATE TABLE sessions (
    id          VARCHAR(64) PRIMARY KEY,
    user_id     INT NOT NULL,
    expires_at  DATETIME NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Промокоды ───────────────────────────────────────────────
CREATE TABLE promo_codes (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(32) NOT NULL UNIQUE,
    type        ENUM('percent','fixed') DEFAULT 'percent',
    value       INT NOT NULL,
    max_uses    INT DEFAULT 100,
    used_count  INT DEFAULT 0,
    expires_at  DATE,
    description VARCHAR(255),
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
