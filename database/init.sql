-- Compatibility bootstrap for simple setup.
-- New schema changes should be added as ordered files in database/migrations/.

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

CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_key CHAR(64) NOT NULL,
    action VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rate_limits_lookup (client_key, action, created_at),
    INDEX idx_rate_limits_created_at (created_at)
);
