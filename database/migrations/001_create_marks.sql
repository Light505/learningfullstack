CREATE TABLE IF NOT EXISTS marks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uid CHAR(36) NOT NULL,
    x_percent DECIMAL(8,2) NOT NULL,
    y_percent DECIMAL(8,2) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    message VARCHAR(280) NULL,
    drawing LONGTEXT NULL,
    color CHAR(7) NOT NULL,
    shape ENUM('circle', 'square', 'diamond') NOT NULL DEFAULT 'circle',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_marks_uid (uid),
    INDEX idx_marks_created_at (created_at),
    INDEX idx_marks_position (x_percent, y_percent)
);
