CREATE TABLE IF NOT EXISTS manual_corrections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sample_id BIGINT UNSIGNED NOT NULL,
    correction_json JSON NOT NULL,
    corrected_result_path VARCHAR(500) NULL,
    corrected_hole_count INT NULL,
    corrected_hole_area_mm2 DECIMAL(18,6) NULL,
    corrected_porosity_percent DECIMAL(12,6) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_manual_sample
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE,
    INDEX idx_manual_sample (sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
