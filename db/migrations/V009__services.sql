-- V009: услуги главной страницы переезжают из localStorage в БД.
-- theme (green|amber|purple) — цветовая тема карточки; price — маркетинговый текст.
SET NAMES utf8mb4;

CREATE TABLE services (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL DEFAULT 1,
    theme       VARCHAR(16)  NOT NULL DEFAULT 'green',
    icon        TEXT,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    price       VARCHAR(64),
    cta         VARCHAR(64)  DEFAULT 'Подробнее',
    page        VARCHAR(32)  DEFAULT 'schedule',
    sort_order  INT DEFAULT 0,
    active      TINYINT(1)   DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active (active),
    INDEX idx_sort (sort_order),
    CONSTRAINT fk_services_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
