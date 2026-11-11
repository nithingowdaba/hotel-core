DROP PROCEDURE IF EXISTS migrate_003_customer_profile_feedback;

CREATE PROCEDURE migrate_003_customer_profile_feedback()
SQL SECURITY INVOKER
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'address'
  ) THEN
    ALTER TABLE users ADD COLUMN address VARCHAR(255) NULL AFTER phone;
  END IF;

  CREATE TABLE IF NOT EXISTS order_feedback (
    order_id BIGINT UNSIGNED NOT NULL,
    hotel_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(2000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id),
    KEY idx_order_feedback_hotel_created (hotel_id, created_at),
    CONSTRAINT fk_order_feedback_order FOREIGN KEY (order_id, hotel_id)
      REFERENCES orders(id, hotel_id) ON DELETE CASCADE,
    CONSTRAINT fk_order_feedback_user FOREIGN KEY (user_id)
      REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_order_feedback_rating CHECK (rating BETWEEN 1 AND 5)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
END;
