# BreadResearch 10.5.5 deployment checklist

This checklist accompanies the 10.5.5 upgrade PR.

Before deploying to Xserver:

1. Back up the current web application and database.
2. Run `migration_v10_4_to_v10_5.sql` against the production database.
3. Confirm `samples.bread_mask_path` exists.
4. Update the existing Xserver `config.php` value `app_version` to `10.5.5`.
5. Keep `config.php` and `uploads/` out of GitHub deployment overwrite.
6. Deploy the application files.
7. Run the Python/OpenCV diagnostic and verify one image using bread-contour detection and save.

Do not deploy 10.5.5 application code before the database migration is complete.
