-- Version 4 から Version 5 へ更新する場合に、phpMyAdminで一度だけ実行してください。
ALTER TABLE samples ADD COLUMN parent_sample_id BIGINT UNSIGNED NULL AFTER app_version;
ALTER TABLE samples ADD COLUMN revision_no INT NOT NULL DEFAULT 1 AFTER parent_sample_id;
ALTER TABLE samples ADD COLUMN roi_json JSON NULL AFTER revision_no;
CREATE INDEX idx_samples_parent ON samples(parent_sample_id);

CREATE TABLE IF NOT EXISTS analysis_presets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    parameter_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
