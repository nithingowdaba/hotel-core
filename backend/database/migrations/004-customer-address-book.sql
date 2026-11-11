DROP PROCEDURE IF EXISTS migrate_004_customer_address_book;

CREATE PROCEDURE migrate_004_customer_address_book()
SQL SECURITY INVOKER
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_address'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(255) NULL AFTER payment_method;
  END IF;

  CREATE TABLE IF NOT EXISTS customer_addresses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(60) NOT NULL,
    address VARCHAR(255) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_customer_addresses_user_default (user_id, is_default, id),
    CONSTRAINT fk_customer_addresses_user FOREIGN KEY (user_id)
      REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  INSERT INTO customer_addresses (user_id, label, address, is_default)
  SELECT u.id, 'Home', u.address, TRUE
  FROM users u
  WHERE u.address IS NOT NULL AND TRIM(u.address) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM customer_addresses ca WHERE ca.user_id = u.id
    );
END;
