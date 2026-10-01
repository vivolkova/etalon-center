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
-- group_code — код справочника (user_role, activity_category, service_category,
-- slot_type, specialist_type); неизменяем — защищён триггером ниже.
-- Категории занятий — две группы: activity_category (только training — тренировки) и service_category
-- (услуги: bikefit, workshop, massage…). Код категории уникален в обеих группах (проверка в API).
-- station_type вынесен в отдельную таблицу (см. ниже).
-- ref_id — связанное значение другого справочника. Сейчас используется так:
-- activity_category -> specialist_type (какой специалист ведёт активность:
-- training -> trainer, bikefit -> bikefitter, workshop -> mechanic).
-- В каких филиалах доступно значение (activity_category, specialist_type) — location_dictionaries.
CREATE TABLE dictionaries (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    group_code VARCHAR(40)  NOT NULL,
    code       VARCHAR(40)  NOT NULL,
    name       VARCHAR(100) NOT NULL,
    ref_id     INT NULL,                          -- dictionaries.id связанного значения
    active     TINYINT DEFAULT 1,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dict (group_code, code),
    KEY idx_group (group_code),
    KEY fk_dict_ref (ref_id),
    CONSTRAINT fk_dict_ref FOREIGN KEY (ref_id) REFERENCES dictionaries(id)
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

-- ── Филиалы, в которых доступно значение справочника ────────
-- Для прикладных групп (activity_category, specialist_type): значение доступно только в филиалах с активной строкой,
-- всегда явным списком — новый филиал автоматически никуда не добавляется. Филиал убрали из значения — active = 0.
CREATE TABLE location_dictionaries (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    dictionary_id INT NOT NULL,
    location_id   INT NOT NULL,
    active        TINYINT(1) NOT NULL DEFAULT 1,   -- 0 — филиал убран из значения
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_loc_dict (dictionary_id, location_id),
    KEY fk_locdict_location (location_id),
    CONSTRAINT fk_locdict_location FOREIGN KEY (location_id)   REFERENCES locations(id)    ON DELETE CASCADE,
    CONSTRAINT fk_locdict_dict     FOREIGN KEY (dictionary_id) REFERENCES dictionaries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Типы станков ────────────────────────────────────────────
-- Отдельный справочник (раньше был группой station_type в dictionaries).
-- icon — SVG-иконка типа станка для схемы зала.
CREATE TABLE station_type (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    icon       TEXT NULL,
    active     TINYINT DEFAULT 1,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_station_type_name (name)
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
    has_account TINYINT(1)   NOT NULL DEFAULT 1,        -- 0 — без личного кабинета: клиента завёл администратор при записи по телефону,
                                                        --     войти на сайт он не может, email служебный <телефон>@phone.invalid
    bike        VARCHAR(64),
    birth_date  DATE,
    notes       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY fk_users_role (role_id),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES dictionaries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Специалисты (тренеры, байкфиттеры, мастера) ────────────
-- Не привязан к филиалу: в каком филиале работает — задаётся у интервалов графика (specialist_schedules.week).
-- Специализация — типы из справочника specialist_type, может быть несколько (тренер и байкфиттер) — specialist_types.
CREATE TABLE specialists (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    full_name   VARCHAR(255) NOT NULL,
    experience  INT DEFAULT 0,
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Типы специалиста (тренер / байкфиттер / мастер), может быть несколько ──
-- Тип сняли со специалиста — active = 0 (физически не удаляем).
CREATE TABLE specialist_types (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    specialist_id INT NOT NULL,
    type_id       INT NOT NULL,                  -- dictionaries.specialist_type
    active        TINYINT(1) NOT NULL DEFAULT 1, -- 0 — тип снят со специалиста
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_spec_type (specialist_id, type_id),
    KEY fk_spec_types_type (type_id),
    CONSTRAINT fk_spec_types_specialist FOREIGN KEY (specialist_id) REFERENCES specialists(id),
    CONSTRAINT fk_spec_types_type       FOREIGN KEY (type_id)       REFERENCES dictionaries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── График работы специалиста: недельный шаблон на период ───
-- Периоды одного специалиста не пересекаются (проверка в API, среди активных). Например, «Зима» 01.09–31.05, «Лето» 01.06–31.08.
-- work_hours — [{day:'Понедельник', intervals:[{from:'07:00', to:'11:00', location_id:1}, {from:'17:00', to:'21:00', location_id:2}]}, …];
-- у каждого интервала свой филиал (locations.id); интервалы дня не пересекаются даже в разных филиалах;
-- дня нет в списке или intervals пуст — выходной. На даты вне всех периодов специалист не работает.
CREATE TABLE specialist_schedules (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    specialist_id INT NOT NULL,
    name          VARCHAR(128) NOT NULL,              -- «Зима», «Лето»… (обязательно)
    date_from     DATE NOT NULL,
    date_to       DATE NULL,                          -- NULL — бессрочно
    work_hours    JSON NOT NULL,                      -- недельный шаблон (см. выше)
    active        TINYINT(1) NOT NULL DEFAULT 1,      -- soft-delete: 0 = удалён (физически не удаляем)
    created_by    INT NOT NULL,                       -- users.id, кто создал
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_spec_sched (specialist_id, date_from),
    CONSTRAINT fk_spec_sched_specialist FOREIGN KEY (specialist_id) REFERENCES specialists(id),
    CONSTRAINT fk_spec_sched_user       FOREIGN KEY (created_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Исключения из графика: отсутствия и особые часы на даты ─
-- type — что происходит: off — не работает (вкладка «Отсутствия»); custom — работает по work_hours вместо шаблона
-- (вкладка «Особые часы работы»). Подписи — в интерфейсе.
-- reason — почему (для людей): сборы, соревнования, отпуск… На логику не влияет.
-- Исключения одного специалиста не пересекаются (проверка в API, среди активных). Исключение важнее шаблона.
CREATE TABLE specialist_exceptions (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    specialist_id INT NOT NULL,
    date_from     DATE NOT NULL,
    date_to       DATE NOT NULL,                      -- для одного дня = date_from
    type          ENUM('off','custom') NOT NULL,
    work_hours    JSON NULL,                          -- для custom: [{from, to, location_id}, …]
    reason        VARCHAR(255) NULL,                  -- «Сборы», «Соревнования»…; NULL — не указана
    active        TINYINT(1) NOT NULL DEFAULT 1,      -- soft-delete: 0 = удалён (физически не удаляем)
    created_by    INT NOT NULL,                       -- users.id, кто создал
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_spec_exc (specialist_id, date_from),
    CONSTRAINT fk_spec_exc_specialist FOREIGN KEY (specialist_id) REFERENCES specialists(id),
    CONSTRAINT fk_spec_exc_user       FOREIGN KEY (created_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Библиотека тренировок/услуг (источник описаний слотов) ───
-- Тренировка или услуга — по категории: activity_category.code = 'training' — тренировка,
-- любая другая (bikefit, workshop, massage…) — услуга.
CREATE TABLE library (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    activity_category_id INT NOT NULL,           -- dictionaries: activity_category (training) или service_category (услуга)
    slot_type_id         INT NULL,               -- dictionaries.slot_type: group / personal / free — только у тренировок; у услуг NULL
    duration    INT NOT NULL DEFAULT 60,
    price       INT NOT NULL,
    difficulty  VARCHAR(32) DEFAULT 'any',       -- код; подпись на фронте
    summary     TEXT,                            -- краткое описание тренировки
    details     JSON,                            -- список особенностей
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    location_id INT NOT NULL,
    KEY fk_library_location (location_id),
    KEY fk_library_category (activity_category_id),
    KEY fk_library_type (slot_type_id),
    CONSTRAINT fk_library_category FOREIGN KEY (activity_category_id) REFERENCES dictionaries(id),
    CONSTRAINT fk_library_type     FOREIGN KEY (slot_type_id)         REFERENCES dictionaries(id),
    CONSTRAINT fk_library_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Слоты расписания ────────────────────────────────────────
CREATE TABLE slots (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    library_id  INT,                             -- источник описания (nullable)
    name        VARCHAR(255) NOT NULL,
    category_id INT NOT NULL,                    -- dictionaries: activity_category (training) или service_category (услуга)
    slot_date   DATE NOT NULL,
    start_time  TIME NOT NULL,
    duration    INT NOT NULL DEFAULT 60,
    specialist_id INT,
    price       INT NOT NULL,
    taken       INT DEFAULT 0,                    -- сколько станков забронировано (вместимость — из locations)
    active      TINYINT(1) DEFAULT 1,
    -- 0 — занятие поставил в расписание админ (групповая тренировка из библиотеки);
    -- 1 — слот создан автоматически записью клиента (персональная, самостоятельная, услуга):
    --     в расписании не показывается, живёт вместе со своей записью (отмена записи выключает слот)
    auto_created TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    location_id INT NOT NULL,
    KEY idx_active_date (active, slot_date),
    KEY specialist_id (specialist_id),
    KEY library_id (library_id),
    KEY fk_slots_location (location_id),
    KEY fk_slots_category (category_id),
    CONSTRAINT fk_slots_category FOREIGN KEY (category_id) REFERENCES dictionaries(id),
    CONSTRAINT fk_slots_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT fk_slots_specialist FOREIGN KEY (specialist_id) REFERENCES specialists(id) ON DELETE SET NULL,
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
    location_id INT NOT NULL,
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

-- ── Параметры студии, которые меняет администратор ──────────
-- Технические настройки (доступ к БД, секреты, адрес сайта) — в config/db.php, не здесь.
-- code — на него опирается приложение (не меняется); name — подпись в админке; value — значение строкой,
-- тип и допустимые значения проверяет API (api/settings.php). Новая настройка — строкой в раздел 1 seed.sql.
CREATE TABLE settings (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL,
    name        VARCHAR(255) NOT NULL,
    value       VARCHAR(255) NOT NULL,
    updated_by  INT NULL,                          -- users.id, кто изменил последним
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_settings_code (code),
    CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Время на переезд специалиста между двумя филиалами ───────
-- Одинаково в обе стороны: пара хранится одной строкой, location_a_id < location_b_id.
-- Для пары без активной строки действует settings.location_travel_minutes (по умолчанию).
CREATE TABLE location_travel (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    location_a_id INT NOT NULL,                    -- меньший id пары
    location_b_id INT NOT NULL,                    -- больший id пары
    minutes       INT NOT NULL,
    active        TINYINT(1) NOT NULL DEFAULT 1,   -- 0 — время для пары сброшено (действует значение по умолчанию)
    updated_by    INT NULL,                        -- users.id, кто изменил последним
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_location_travel (location_a_id, location_b_id),
    KEY fk_travel_b (location_b_id),
    CONSTRAINT chk_travel_pair  CHECK (location_a_id < location_b_id),
    CONSTRAINT fk_travel_a      FOREIGN KEY (location_a_id) REFERENCES locations(id),
    CONSTRAINT fk_travel_b      FOREIGN KEY (location_b_id) REFERENCES locations(id),
    CONSTRAINT fk_travel_user   FOREIGN KEY (updated_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
