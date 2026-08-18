CREATE TABLE IF NOT EXISTS experiments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    objective TEXT NULL,
    researcher VARCHAR(200) NULL,
    institution VARCHAR(200) NULL,
    start_date DATE NULL,
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS treatments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    experiment_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(200) NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    description TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_treatment_experiment
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
    INDEX idx_treatments_experiment (experiment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS samples (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    experiment_id BIGINT UNSIGNED NOT NULL,
    treatment_id BIGINT UNSIGNED NOT NULL,
    sample_code VARCHAR(200) NOT NULL,
    replicate_no VARCHAR(50) NULL,
    bread_type VARCHAR(200) NULL,
    formulation TEXT NULL,
    production_date DATE NULL,
    baking_date DATE NULL,
    measurement_date DATE NULL,
    operator_name VARCHAR(200) NULL,
    notes TEXT NULL,
    original_filename VARCHAR(255) NULL,
    processed_at DATETIME NOT NULL,
    dpi DECIMAL(10,2) NOT NULL,
    parameter_json JSON NOT NULL,
    bread_area_mm2 DECIMAL(18,6) NOT NULL,
    hole_count INT NOT NULL,
    hole_area_mm2 DECIMAL(18,6) NOT NULL,
    porosity_percent DECIMAL(12,6) NOT NULL,
    mean_hole_area_mm2 DECIMAL(18,6) NOT NULL,
    median_hole_area_mm2 DECIMAL(18,6) NOT NULL,
    max_hole_area_mm2 DECIMAL(18,6) NOT NULL,
    mean_eq_diameter_mm DECIMAL(18,6) NOT NULL,
    small_hole_count INT NOT NULL DEFAULT 0,
    medium_hole_count INT NOT NULL DEFAULT 0,
    large_hole_count INT NOT NULL DEFAULT 0,
    original_image_path VARCHAR(500) NULL,
    result_image_path VARCHAR(500) NULL,
    bread_mask_path VARCHAR(500) NULL,
    app_version VARCHAR(50) NOT NULL,
    parent_sample_id BIGINT UNSIGNED NULL,
    revision_no INT NOT NULL DEFAULT 1,
    roi_json JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sample_experiment
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
    CONSTRAINT fk_sample_treatment
      FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON DELETE RESTRICT,
    INDEX idx_samples_experiment (experiment_id),
    INDEX idx_samples_treatment (treatment_id),
    INDEX idx_samples_code (sample_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sample_id BIGINT UNSIGNED NOT NULL,
    hole_number INT NOT NULL,
    area_mm2 DECIMAL(18,6) NOT NULL,
    eq_diameter_mm DECIMAL(18,6) NOT NULL,
    width_mm DECIMAL(18,6) NOT NULL,
    height_mm DECIMAL(18,6) NOT NULL,
    perimeter_mm DECIMAL(18,6) NOT NULL,
    circularity DECIMAL(12,6) NOT NULL,
    aspect_ratio DECIMAL(12,6) NOT NULL,
    size_class VARCHAR(20) NOT NULL,
    center_x_px INT NOT NULL,
    center_y_px INT NOT NULL,
    CONSTRAINT fk_hole_sample
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE,
    INDEX idx_holes_sample (sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS analysis_presets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    parameter_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


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
