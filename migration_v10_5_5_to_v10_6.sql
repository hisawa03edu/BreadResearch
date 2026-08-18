-- Version 10.6.0: binary threshold white/black area metrics
ALTER TABLE samples
  ADD COLUMN binary_white_area_mm2 DECIMAL(18,6) NULL AFTER porosity_percent,
  ADD COLUMN binary_black_area_mm2 DECIMAL(18,6) NULL AFTER binary_white_area_mm2,
  ADD COLUMN binary_white_percent DECIMAL(12,6) NULL AFTER binary_black_area_mm2,
  ADD COLUMN binary_black_percent DECIMAL(12,6) NULL AFTER binary_white_percent;
