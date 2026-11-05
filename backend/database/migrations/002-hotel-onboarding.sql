DROP PROCEDURE IF EXISTS migrate_002_hotel_onboarding;

CREATE PROCEDURE migrate_002_hotel_onboarding()
SQL SECURITY INVOKER
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 002 requires the hotels table from migration 001.';
  END IF;

  ALTER TABLE hotels MODIFY COLUMN status ENUM('active','suspended','pending','rejected') NOT NULL DEFAULT 'active';

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'rejection_reason') THEN
    ALTER TABLE hotels ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'submitted_at') THEN
    ALTER TABLE hotels ADD COLUMN submitted_at TIMESTAMP NULL DEFAULT NULL AFTER rejection_reason;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'approved_at') THEN
    ALTER TABLE hotels ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL AFTER submitted_at;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'approved_by') THEN
    ALTER TABLE hotels ADD COLUMN approved_by BIGINT UNSIGNED NULL AFTER approved_at;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND INDEX_NAME = 'idx_hotels_approved_by') THEN
    ALTER TABLE hotels ADD KEY idx_hotels_approved_by (approved_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND CONSTRAINT_NAME = 'fk_hotels_approved_by') THEN
    ALTER TABLE hotels ADD CONSTRAINT fk_hotels_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END;
