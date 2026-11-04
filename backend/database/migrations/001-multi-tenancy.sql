DROP PROCEDURE IF EXISTS migrate_001_multi_tenancy;

CREATE PROCEDURE migrate_001_multi_tenancy()
SQL SECURITY INVOKER
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE old_fk VARCHAR(64);
  DECLARE fk_cursor CURSOR FOR
    SELECT CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_items'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      AND CONSTRAINT_NAME LIKE 'fk_order_items_%';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels'
  ) THEN
    CREATE TABLE hotels (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(80) NOT NULL,
      description TEXT NULL,
      cuisines VARCHAR(160) NULL,
      address VARCHAR(255) NULL,
      phone VARCHAR(20) NULL,
      logo_url VARCHAR(500) NULL,
      cover_url VARCHAR(500) NULL,
      accepting_orders BOOLEAN NOT NULL DEFAULT TRUE,
      status ENUM('active','suspended') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_hotels_slug (slug),
      KEY idx_hotels_status_name (status, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'cuisines') THEN
    ALTER TABLE hotels ADD COLUMN cuisines VARCHAR(160) NULL AFTER description;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'logo_url') THEN
    ALTER TABLE hotels ADD COLUMN logo_url VARCHAR(500) NULL AFTER phone;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'cover_url') THEN
    ALTER TABLE hotels ADD COLUMN cover_url VARCHAR(500) NULL AFTER logo_url;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'accepting_orders') THEN
    ALTER TABLE hotels ADD COLUMN accepting_orders BOOLEAN NOT NULL DEFAULT TRUE AFTER cover_url;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'hotel_id') THEN
    ALTER TABLE menu_items ADD COLUMN hotel_id BIGINT UNSIGNED NULL AFTER id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'hotel_id') THEN
    ALTER TABLE orders ADD COLUMN hotel_id BIGINT UNSIGNED NULL AFTER id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'hotel_id') THEN
    ALTER TABLE order_items ADD COLUMN hotel_id BIGINT UNSIGNED NULL AFTER order_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'is_veg') THEN
    ALTER TABLE menu_items ADD COLUMN is_veg BOOLEAN NOT NULL DEFAULT TRUE AFTER price;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'image_url') THEN
    ALTER TABLE menu_items ADD COLUMN image_url VARCHAR(500) NULL AFTER is_veg;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active') THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER role;
  END IF;

  INSERT INTO hotels (id, name, slug, status)
  VALUES (1, 'Udupi Hotel', 'udupi-hotel', 'active')
  ON DUPLICATE KEY UPDATE name = 'Udupi Hotel', slug = 'udupi-hotel', status = 'active';

  UPDATE menu_items SET hotel_id = 1 WHERE hotel_id IS NULL;
  UPDATE orders SET hotel_id = 1 WHERE hotel_id IS NULL;
  UPDATE order_items oi
    JOIN orders o ON o.id = oi.order_id
    SET oi.hotel_id = o.hotel_id
    WHERE oi.hotel_id IS NULL;

  ALTER TABLE menu_items MODIFY COLUMN hotel_id BIGINT UNSIGNED NOT NULL;
  ALTER TABLE orders MODIFY COLUMN hotel_id BIGINT UNSIGNED NOT NULL;
  ALTER TABLE order_items MODIFY COLUMN hotel_id BIGINT UNSIGNED NOT NULL;

  CREATE TABLE IF NOT EXISTS hotel_members (
    user_id BIGINT UNSIGNED NOT NULL,
    hotel_id BIGINT UNSIGNED NOT NULL,
    role ENUM('ADMIN') NOT NULL DEFAULT 'ADMIN',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, hotel_id),
    KEY idx_members_hotel (hotel_id),
    CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_members_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

  INSERT IGNORE INTO hotel_members (user_id, hotel_id, role)
    SELECT id, 1, 'ADMIN' FROM users WHERE role = 'ADMIN';
  UPDATE users SET role = 'CUSTOMER' WHERE role = 'ADMIN';
  ALTER TABLE users MODIFY COLUMN role ENUM('CUSTOMER','PLATFORM_ADMIN') NOT NULL DEFAULT 'CUSTOMER';

  OPEN fk_cursor;
  drop_old_order_item_fks: LOOP
    FETCH fk_cursor INTO old_fk;
    IF done = 1 THEN
      LEAVE drop_old_order_item_fks;
    END IF;
    SET @drop_fk_sql = CONCAT('ALTER TABLE `order_items` DROP FOREIGN KEY `', REPLACE(old_fk, '`', '``'), '`');
    PREPARE drop_fk_stmt FROM @drop_fk_sql;
    EXECUTE drop_fk_stmt;
    DEALLOCATE PREPARE drop_fk_stmt;
  END LOOP;
  CLOSE fk_cursor;

  IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_user') THEN
    ALTER TABLE orders DROP FOREIGN KEY fk_orders_user;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'idx_menu_category') THEN
    ALTER TABLE menu_items DROP INDEX idx_menu_category;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'idx_menu_available') THEN
    ALTER TABLE menu_items DROP INDEX idx_menu_available;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'idx_menu_items_hotel_id') THEN
    ALTER TABLE menu_items DROP INDEX idx_menu_items_hotel_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'idx_menu_items_hotel_category') THEN
    ALTER TABLE menu_items DROP INDEX idx_menu_items_hotel_category;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'idx_menu_items_is_available') THEN
    ALTER TABLE menu_items DROP INDEX idx_menu_items_is_available;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_status_created') THEN
    ALTER TABLE orders DROP INDEX idx_orders_status_created;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_created') THEN
    ALTER TABLE orders DROP INDEX idx_orders_created;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_created_at') THEN
    ALTER TABLE orders DROP INDEX idx_orders_created_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_user_id') THEN
    ALTER TABLE orders DROP INDEX idx_orders_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_hotel_status') THEN
    ALTER TABLE orders DROP INDEX idx_orders_hotel_status;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_order_items_menu') THEN
    ALTER TABLE order_items DROP INDEX idx_order_items_menu;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_order_items_menu_item_id') THEN
    ALTER TABLE order_items DROP INDEX idx_order_items_menu_item_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_order_items_hotel_id') THEN
    ALTER TABLE order_items DROP INDEX idx_order_items_hotel_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND INDEX_NAME = 'uq_hotels_slug') THEN
    ALTER TABLE hotels ADD UNIQUE KEY uq_hotels_slug (slug);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotels' AND INDEX_NAME = 'idx_hotels_status_name') THEN
    ALTER TABLE hotels ADD KEY idx_hotels_status_name (status, name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'uq_menu_id_hotel') THEN
    ALTER TABLE menu_items ADD UNIQUE KEY uq_menu_id_hotel (id, hotel_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'uq_menu_hotel_cat_name') THEN
    ALTER TABLE menu_items ADD UNIQUE KEY uq_menu_hotel_cat_name (hotel_id, category, name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND INDEX_NAME = 'idx_menu_hotel_avail_cat') THEN
    ALTER TABLE menu_items ADD KEY idx_menu_hotel_avail_cat (hotel_id, is_available, category);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_id_hotel') THEN
    ALTER TABLE orders ADD UNIQUE KEY uq_orders_id_hotel (id, hotel_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_hotel_status_created') THEN
    ALTER TABLE orders ADD KEY idx_orders_hotel_status_created (hotel_id, status, created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_hotel_created') THEN
    ALTER TABLE orders ADD KEY idx_orders_hotel_created (hotel_id, created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_user_created') THEN
    ALTER TABLE orders ADD KEY idx_orders_user_created (user_id, created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_oi_order') THEN
    ALTER TABLE order_items ADD KEY idx_oi_order (order_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_oi_hotel_menu') THEN
    ALTER TABLE order_items ADD KEY idx_oi_hotel_menu (hotel_id, menu_item_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND CONSTRAINT_NAME = 'fk_menu_hotel') THEN
    ALTER TABLE menu_items DROP FOREIGN KEY fk_menu_hotel;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_hotel') THEN
    ALTER TABLE orders DROP FOREIGN KEY fk_orders_hotel;
  END IF;
  ALTER TABLE orders MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND CONSTRAINT_NAME = 'fk_menu_hotel') THEN
    ALTER TABLE menu_items ADD CONSTRAINT fk_menu_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_hotel') THEN
    ALTER TABLE orders ADD CONSTRAINT fk_orders_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_user') THEN
    ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'fk_oi_order') THEN
    ALTER TABLE order_items ADD CONSTRAINT fk_oi_order FOREIGN KEY (order_id, hotel_id) REFERENCES orders(id, hotel_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'fk_oi_menu') THEN
    ALTER TABLE order_items ADD CONSTRAINT fk_oi_menu FOREIGN KEY (menu_item_id, hotel_id) REFERENCES menu_items(id, hotel_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND CONSTRAINT_NAME = 'chk_menu_price') THEN
    ALTER TABLE menu_items ADD CONSTRAINT chk_menu_price CHECK (price > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'chk_order_total') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_order_total CHECK (total_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'chk_item_price') THEN
    ALTER TABLE order_items ADD CONSTRAINT chk_item_price CHECK (unit_price > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'chk_item_quantity') THEN
    ALTER TABLE order_items ADD CONSTRAINT chk_item_quantity CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'chk_item_subtotal') THEN
    ALTER TABLE order_items ADD CONSTRAINT chk_item_subtotal CHECK (subtotal > 0);
  END IF;
END;
