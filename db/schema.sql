-- ============================================================
-- Эталон — ПОЛНАЯ СТРУКТУРА БД (единый файл, без миграций).
-- Накатывать на чистую базу:  mysql -u USER -p DBNAME < db/schema.sql
-- Данные (справочники + тестовые) — отдельно: db/seed.sql
-- Диалект: MySQL 8.0.13 и новее (индексы по выражениям). Кодировка: utf8mb4. В структуре нет русских значений
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
-- slot_type); неизменяем — защищён триггером ниже.
-- Категории занятий — две группы: activity_category (только training — тренировки) и service_category
-- (услуги: bikefit, workshop, massage…). Код категории уникален в обеих группах (проверка в API).
-- station_type вынесен в отдельную таблицу (см. ниже).
-- ref_id — связанное значение другого справочника. Сейчас используется так:
-- категория занятия -> роль из user_role (какой специалист ведёт занятие:
-- training -> trainer, bikefit -> bikefitter, workshop -> mechanic).
-- В каких филиалах доступно значение (activity_category, service_category) — location_dictionaries.
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
-- Для прикладных групп (activity_category, service_category): значение доступно только в филиалах с активной строкой,
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
-- Один человек — одна строка; телефон уникален и служит логином. Email не храним.
-- phone — только цифры в едином виде 7XXXXXXXXXX (phoneDigits в middleware/auth.php), на экран — phoneView.
-- has_account = 0 — клиента завёл администратор при записи по телефону: пароля нет, войти на сайт он не может.
-- Роли сотрудников — в user_roles; клиентом может быть любой пользователь.
CREATE TABLE users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    first_name  VARCHAR(100) NOT NULL,
    last_name   VARCHAR(100) NOT NULL,
    -- «Имя Фамилия» для показа и поиска: в базе не хранится, вычисляется при чтении; порядок слов задан в одном месте
    name        VARCHAR(201) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) VIRTUAL,
    phone       VARCHAR(15)  NOT NULL,
    password    VARCHAR(255) NULL,                      -- bcrypt hash; NULL — кабинета нет
    type        ENUM('new','regular','vip') DEFAULT 'new',   -- категория клиента: new — новый (ставится при появлении), regular — постоянный, vip
    active      TINYINT(1)   NOT NULL DEFAULT 1,        -- soft-delete: 0 = удалён/отключён
    has_account TINYINT(1)   NOT NULL DEFAULT 1,        -- 1 — есть личный кабинет (может войти)
    account_created_at    DATETIME NULL,                -- когда создан кабинет
    phone_verified_at     DATETIME NULL,                -- когда номер подтверждён; NULL — не подтверждён
    phone_verified_by     INT NULL,                     -- users.id администратора, подтвердившего вручную
    phone_verified_method ENUM('admin','max','telegram') NULL,
    birth_date  DATE,
    notes       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_phone (phone),
    CONSTRAINT fk_users_verified_by FOREIGN KEY (phone_verified_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Роли сотрудников ────────────────────────────────────────
-- У человека может быть несколько ролей (dictionaries.user_role: studio_admin, trainer, mechanic, system_admin).
-- location_id — филиал роли: обязателен у администратора студии (два филиала — две строки); NULL — все филиалы.
-- У тренера и механика филиалы определяет график (specialist_schedules), location_id пуст.
-- История изменений (amnd_*): действующая строка — amnd_state = 'A' (active) и сохраняет свой id; прежняя версия — копия
-- строки с amnd_state = 'I' (inactive); удалённая запись (роль снята) — amnd_state = 'C' (closed), отдельного поля active в таблицах с историей нет; amnd_prev — id копии с предыдущей версией; amnd_date — когда записана версия;
-- updated_by — кто записал.
-- Уникальность (человек, роль, филиал) действует только среди действующих строк: последняя часть индекса — выражение,
-- равное 1 у действующей строки и пустое у копий (пустые значения в уникальном индексе друг другу не мешают).
-- IFNULL(location_id, 0) — чтобы роль «на все филиалы» (филиал пуст) тоже нельзя было выдать дважды.
-- Индексы по выражениям — MySQL 8.0.13 и новее.
CREATE TABLE user_roles (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    role_id     INT NOT NULL,                      -- dictionaries.user_role
    location_id INT NULL,                          -- филиал роли: NULL только у администратора системы; у администратора студии,
                                                   -- тренера, байкфиттера, механика — обязателен (одна строка на каждый филиал)
    amnd_state  CHAR(1)  NOT NULL DEFAULT 'A',
    amnd_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    amnd_prev   INT NULL,
    updated_by  INT NULL,                          -- users.id; NULL — начальные данные
    UNIQUE KEY uq_user_role (user_id, role_id, (IFNULL(location_id, 0)), (IF(amnd_state = 'A', 1, NULL))),
    KEY fk_user_roles_role (role_id),
    KEY fk_user_roles_location (location_id),
    CONSTRAINT fk_user_roles_user     FOREIGN KEY (user_id)     REFERENCES users(id),
    CONSTRAINT fk_user_roles_role     FOREIGN KEY (role_id)     REFERENCES dictionaries(id),
    CONSTRAINT fk_user_roles_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT fk_user_roles_prev     FOREIGN KEY (amnd_prev)   REFERENCES user_roles(id),
    CONSTRAINT fk_user_roles_by       FOREIGN KEY (updated_by)  REFERENCES users(id),
    CONSTRAINT chk_user_roles_state   CHECK (amnd_state IN ('A','I','C'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Специалисты (тренеры, байкфиттеры, механики) ───────────
-- Карточка специалиста — человек из users (user_id обязателен): имя, фамилия и телефон берутся оттуда и здесь
-- не повторяются. Под этой учётной записью он входит и видит своё расписание.
-- Кем и где он работает, здесь не записано: это его роли trainer, bikefitter, mechanic с филиалом в user_roles.
-- Карточка создаётся при первой такой роли и не удаляется: на неё ссылаются занятия, графики и отсутствия.
CREATE TABLE specialists (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,                    -- users.id: один человек — одна карточка специалиста
    experience  INT DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_specialists_user (user_id),
    CONSTRAINT fk_specialists_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Специалист вместе с именем из users — для чтения (запись идёт в таблицы specialists, users и user_roles).
-- name — короткое имя для сетки расписания («Анна К.»), full_name — полное («Анна Козлова»).
-- active — вычисляется, в базе не хранится: 1 — человек не отключён (users.active) и у него есть действующая роль
-- тренера, байкфиттера или механика; 0 — специалист больше не работает (карточка остаётся ради прошедших занятий).
CREATE VIEW specialists_view AS
SELECT sp.id, sp.user_id, sp.experience,
       (u.active = 1 AND EXISTS (SELECT 1 FROM user_roles ur JOIN dictionaries d ON d.id = ur.role_id
                                 WHERE ur.user_id = sp.user_id AND ur.amnd_state = 'A'
                                   AND d.code IN ('trainer', 'bikefitter', 'mechanic'))) AS active,
       sp.created_at, sp.updated_at,
       u.first_name, u.last_name, u.phone,
       CONCAT(u.first_name, ' ', LEFT(u.last_name, 1), '.') AS name,
       u.name AS full_name
FROM specialists sp
JOIN users u ON u.id = sp.user_id;

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
    KEY idx_active_date (active, slot_date),              -- расписание всех филиалов за период (сайт)
    -- занятия одного филиала за день или период: журнал, ближайшие занятия, проверки пересечений;
    -- начинается с location_id, поэтому служит и внешнему ключу fk_slots_location
    KEY idx_loc_active_date (location_id, active, slot_date),
    KEY specialist_id (specialist_id),
    KEY library_id (library_id),
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

-- ── Сессии: один вход — одна строка («кто вошёл и когда») ───
-- В cookie лежит случайный секрет, здесь — только его отпечаток (SHA-256). Сессия действует, пока ended_at пусто
-- и expires_at не наступил. Строки не удаляются (кроме очистки журналов администратором системы).
CREATE TABLE sessions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    token_hash   CHAR(64) NOT NULL,
    user_id      INT NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- момент входа
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- последнее обращение
    expires_at   DATETIME NOT NULL,                             -- продлевается при обращениях
    ended_at     DATETIME NULL,
    end_reason   ENUM('logout','password','admin','expired') NULL,
    ip           VARCHAR(45) NOT NULL,
    user_agent   VARCHAR(255) NULL,
    UNIQUE KEY uq_session_token (token_hash),
    KEY idx_session_user (user_id, created_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Попытки входа, регистрации и использования ссылок ───────
-- Защита от перебора (считаем неудачные за последние минуты) и журнал попыток.
CREATE TABLE auth_attempts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    kind        ENUM('login','register','link') NOT NULL,
    phone       VARCHAR(15) NULL,                  -- какой номер вводили
    success     TINYINT(1) NOT NULL,
    session_id  INT NULL,                          -- созданная сессия при удачном входе
    ip          VARCHAR(45) NOT NULL,
    user_agent  VARCHAR(255) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_attempt_phone (phone, created_at),
    KEY idx_attempt_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Одноразовые ссылки от администратора ────────────────────
-- activate — создать кабинет, reset — сменить пароль. Действует 24 часа, срабатывает один раз.
-- token_hash — отпечаток (SHA-256) секрета из ссылки; сам секрет не хранится.
CREATE TABLE auth_links (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    purpose     ENUM('activate','reset') NOT NULL,
    token_hash  CHAR(64) NOT NULL,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL,
    created_by  INT NOT NULL,                      -- users.id администратора
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_auth_link_token (token_hash),
    KEY idx_auth_link_user (user_id),
    CONSTRAINT fk_auth_link_user  FOREIGN KEY (user_id)    REFERENCES users(id),
    CONSTRAINT fk_auth_link_admin FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Документы: оферта, правила, политика, тексты согласий ───
-- acceptance: required — без согласия нельзя зарегистрироваться, новая редакция принимается заново;
-- optional — добровольное согласие, можно отозвать; none — документ просто опубликован.
-- История изменений (amnd_*) — как в user_roles.
CREATE TABLE documents (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(40)  NOT NULL,             -- offer, rules, privacy, pd_consent, photo_consent
    name        VARCHAR(255) NOT NULL,
    acceptance  ENUM('required','optional','none') NOT NULL,
    amnd_state  CHAR(1)  NOT NULL DEFAULT 'A',
    amnd_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    amnd_prev   INT NULL,
    updated_by  INT NULL,
    UNIQUE KEY uq_documents_code (code, (IF(amnd_state = 'A', 1, NULL))),   -- код уникален среди действующих строк
    CONSTRAINT fk_documents_prev  FOREIGN KEY (amnd_prev)  REFERENCES documents(id),
    CONSTRAINT fk_documents_by    FOREIGN KEY (updated_by) REFERENCES users(id),
    CONSTRAINT chk_documents_state CHECK (amnd_state IN ('A','I','C'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Редакции документов ─────────────────────────────────────
-- Действующая редакция — с наибольшим номером. Опубликованная редакция не меняется и не удаляется:
-- любая правка — новая редакция. body — простой текст: пустая строка делит абзацы, «# » в начале строки — заголовок.
CREATE TABLE document_versions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    document_id  INT NOT NULL,
    version      INT NOT NULL,
    body         MEDIUMTEXT NOT NULL,
    published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_by INT NULL,                         -- users.id; NULL — начальные данные
    UNIQUE KEY uq_doc_version (document_id, version),
    CONSTRAINT fk_docver_document FOREIGN KEY (document_id)  REFERENCES documents(id),
    CONSTRAINT fk_docver_user     FOREIGN KEY (published_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Согласия: кто какую редакцию принял ─────────────────────
-- Строки не удаляются: отзыв — revoked_at. source: site — галочка на сайте, admin — отмечено бумажное согласие.
-- given_by — кто дал согласие, если не сам клиент (родитель несовершеннолетнего); NULL — сам.
CREATE TABLE user_consents (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL,
    document_version_id INT NOT NULL,
    accepted_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at          DATETIME NULL,
    source              ENUM('site','admin') NOT NULL,
    recorded_by         INT NULL,                  -- users.id администратора, если source = admin
    given_by            VARCHAR(255) NULL,
    ip                  VARCHAR(45) NULL,
    UNIQUE KEY uq_consent (user_id, document_version_id),
    KEY fk_consent_version (document_version_id),
    CONSTRAINT fk_consent_user    FOREIGN KEY (user_id)             REFERENCES users(id),
    CONSTRAINT fk_consent_version FOREIGN KEY (document_version_id) REFERENCES document_versions(id),
    CONSTRAINT fk_consent_admin   FOREIGN KEY (recorded_by)         REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Журнал действий: кто, когда и что сделал ────────────────
-- Только добавление. action — код действия (auth.register, role.granted, document.published…),
-- entity + entity_id — над чем (имя таблицы и id строки), details — подробности. Пароли и секреты сюда не пишутся.
CREATE TABLE action_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id     INT NULL,                          -- кто; NULL — не вошедший посетитель
    session_id  INT NULL,
    action      VARCHAR(64) NOT NULL,
    entity      VARCHAR(64) NULL,
    entity_id   INT NULL,
    details     JSON NULL,
    ip          VARCHAR(45) NULL,
    KEY idx_log_user (user_id, created_at),
    KEY idx_log_entity (entity, entity_id),
    KEY idx_log_action (action, created_at)
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

