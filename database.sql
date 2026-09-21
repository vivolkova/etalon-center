-- ═══════════════════════════════════════════════════════════
-- ETALONCENTER — Schema MySQL
-- Загрузить через phpMyAdmin на REG.RU
-- ═══════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET time_zone = '+03:00';

-- ── Пользователи ─────────────────────────────────────────────
CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,  -- bcrypt hash
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(32),
  role        ENUM('client','admin') DEFAULT 'client',
  status      ENUM('new','active','vip','inactive') DEFAULT 'new',
  bike        VARCHAR(64),
  birth_date  DATE,
  notes       TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Администратор по умолчанию (пароль: admin123)
INSERT INTO users (email, password, name, role, status)
VALUES ('admin@velo.ru', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Администратор', 'admin', 'active');

-- ── Тренеры ──────────────────────────────────────────────────
CREATE TABLE trainers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  full_name    VARCHAR(255) NOT NULL,
  speciality   VARCHAR(255),
  experience   INT DEFAULT 0,
  rating       DECIMAL(3,1) DEFAULT 5.0,
  color        VARCHAR(16) DEFAULT '#00BAB3',
  active       TINYINT(1) DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO trainers (name, full_name, speciality, experience, rating, color) VALUES
('Анна К.',    'Анна Козлова',    'Групповые тренировки, Endurance', 5, 4.9, '#00BAB3'),
('Максим Р.',  'Максим Романов',  'Интервальные тренировки, HIIT',   7, 4.8, '#4e42b5'),
('Елена С.',   'Елена Смирнова',  'Персональные тренировки',         4, 4.9, '#c07a10'),
('Алексей Д.', 'Алексей Дмитров', 'Байкфит, биомеханика',            8, 5.0, '#059669');

-- ── Библиотека тренировок ─────────────────────────────────────
CREATE TABLE library (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  type         ENUM('training','service') DEFAULT 'training',
  name         VARCHAR(255) NOT NULL,
  category     ENUM('training','bikefit','workshop') DEFAULT 'training',
  duration     INT NOT NULL DEFAULT 60,    -- минут
  price        INT NOT NULL DEFAULT 1200,  -- руб.
  max_people   INT DEFAULT 12,
  difficulty   VARCHAR(32) DEFAULT 'Любой',
  description  TEXT,
  features     JSON,                        -- ["feature1","feature2"]
  active       TINYINT(1) DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Слоты расписания ─────────────────────────────────────────
CREATE TABLE slots (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  library_id   INT,                         -- ссылка на библиотеку (опц.)
  name         VARCHAR(255) NOT NULL,
  category     ENUM('training','bikefit','workshop') DEFAULT 'training',
  slot_date    DATE NOT NULL,
  start_time   TIME NOT NULL,
  duration     INT NOT NULL DEFAULT 60,
  trainer_id   INT,
  price        INT NOT NULL DEFAULT 1200,
  max_people   INT DEFAULT 12,
  taken        INT DEFAULT 0,
  active       TINYINT(1) DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL,
  FOREIGN KEY (library_id) REFERENCES library(id) ON DELETE SET NULL,
  INDEX idx_date (slot_date),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Записи на тренировки ──────────────────────────────────────
CREATE TABLE bookings (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  slot_id        INT NOT NULL,
  status         ENUM('pending','confirmed','cancelled') DEFAULT 'pending',
  payment_status ENUM('unpaid','paid','refunded') DEFAULT 'unpaid',
  payment_id     VARCHAR(128),              -- ID платежа ЮКассы
  price          INT NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_user_slot (user_id, slot_id),
  INDEX idx_status (status),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Абонементы — тарифы ───────────────────────────────────────
CREATE TABLE subscription_plans (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  sessions     INT DEFAULT 8,    -- 999 = безлимит
  price        INT NOT NULL,
  validity     INT DEFAULT 30,   -- дней
  color        VARCHAR(16) DEFAULT '#00BAB3',
  features     JSON,
  active       TINYINT(1) DEFAULT 1,
  sort_order   INT DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO subscription_plans (name, sessions, price, validity, color, features, sort_order) VALUES
('Старт',       4,   4200,  30, '#6b7280', '["4 групповых занятия","Любые тренировки","Срок 30 дней"]', 1),
('Базовый',     8,   7500,  30, '#00BAB3', '["8 групповых занятий","Любые тренировки","Срок 30 дней","Скидка 10%"]', 2),
('Продвинутый', 12,  10200, 45, '#4e42b5', '["12 групповых занятий","Любые тренировки","Срок 45 дней","Скидка 15%"]', 3),
('Безлимит',    999, 14900, 30, '#c07a10', '["Безлимитные занятия","Приоритетная запись","Срок 30 дней","Скидка 20%"]', 4);

-- ── Проданные абонементы ──────────────────────────────────────
CREATE TABLE subscriptions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  plan_id     INT NOT NULL,
  sessions_left INT NOT NULL,
  expires_at  DATE NOT NULL,
  status      ENUM('active','expired','cancelled') DEFAULT 'active',
  payment_id  VARCHAR(128),
  price_paid  INT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Чат ──────────────────────────────────────────────────────
CREATE TABLE chat_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  from_user   INT NOT NULL,
  to_user     INT,                 -- NULL = всем (анонс)
  message     TEXT NOT NULL,
  is_read     TINYINT(1) DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_from (from_user),
  INDEX idx_to (to_user),
  INDEX idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Уведомления ───────────────────────────────────────────────
CREATE TABLE notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  type        VARCHAR(32) DEFAULT 'info',
  title       VARCHAR(255) NOT NULL,
  message     TEXT,
  target_user INT,                 -- NULL = все
  is_read     TINYINT(1) DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_target (target_user),
  INDEX idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Промокоды ─────────────────────────────────────────────────
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

-- ── Сессии (JWT хранение на сервере) ─────────────────────────
CREATE TABLE sessions (
  id          VARCHAR(64) PRIMARY KEY,
  user_id     INT NOT NULL,
  expires_at  DATETIME NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
