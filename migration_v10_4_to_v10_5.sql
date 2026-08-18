-- Version 10.5: 手動修正済みパン輪郭マスクの保存先
ALTER TABLE samples
  ADD COLUMN bread_mask_path VARCHAR(500) NULL AFTER result_image_path;
