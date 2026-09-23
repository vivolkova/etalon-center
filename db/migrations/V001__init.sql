SET NAMES utf8mb4;
-- ============================================================
-- V001 — Базовая (текущая) схема БД «Эталон», MySQL 8
-- Это ФИКСАЦИЯ отправной точки: ровно то, что УЖЕ есть в живой базе.
-- На рабочую базу НАКАТЫВАТЬ НЕ НУЖНО (таблицы уже существуют).
-- Запускается только при установке с нуля (чистая база).
-- ============================================================

CREATE TABLE users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    phone       VARCHAR(32) NOT NULL,
    role        ENUM('client','admin') DEFAULT 'client',
    status      ENUM('new','active','vip','inactive') DEFAULT 'new',
    bike        VARCHAR(64),
    birth_date  DATE,
    notes       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE trainers (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    full_name   VARCHAR(255) NOT NULL,
    speciality  VARCHAR(255),
    experience  INT DEFAULT 0,
    rating      DECIMAL(3,1) DEFAULT 5.0,
    color       VARCHAR(16) DEFAULT '#00BAB3',
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE library (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    type        ENUM('training','service') DEFAULT 'training',
    name        VARCHAR(255) NOT NULL,
    category    ENUM('training','bikefit','workshop') DEFAULT 'training',
    duration    INT NOT NULL DEFAULT 60,
    price       INT NOT NULL,
    max_people  INT,
    difficulty  VARCHAR(32) DEFAULT 'any',
    description TEXT,
    features    JSON,
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE slots (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    library_id  INT,
    name        VARCHAR(255) NOT NULL,
    category    ENUM('training','bikefit','workshop') DEFAULT 'training',
    slot_date   DATE NOT NULL,
    start_time  TIME NOT NULL,
    duration    INT NOT NULL DEFAULT 60,
    trainer_id  INT,
    price       INT NOT NULL,
    max_people  INT,
    taken       INT DEFAULT 0,
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_date (slot_date),
    INDEX idx_active (active),
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL,
    FOREIGN KEY (library_id) REFERENCES library(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bookings (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    slot_id        INT NOT NULL,
    status         ENUM('pending','confirmed','cancelled') DEFAULT 'pending',
    payment_status ENUM('unpaid','paid','refunded') DEFAULT 'unpaid',
    payment_id     VARCHAR(128),
    price          INT NOT NULL DEFAULT 0,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_slot (user_id, slot_id),
    INDEX idx_status (status),
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
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
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE chat_messages (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    from_user   INT NOT NULL,
    to_user     INT,
    message     TEXT NOT NULL,
    is_read     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_from (from_user),
    INDEX idx_to (to_user),
    INDEX idx_read (is_read),
    FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    type        VARCHAR(32) DEFAULT 'info',
    title       VARCHAR(255) NOT NULL,
    message     TEXT,
    target_user INT,
    is_read     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_target (target_user),
    INDEX idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sessions (
    id          VARCHAR(64) PRIMARY KEY,
    user_id     INT NOT NULL,
    expires_at  DATETIME NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
