-- =============================================================================
-- HOTEL CORE DATABASE SCHEMA
-- Multi-Tenant B2C Food Ordering Platform
-- Database: hotel_core
-- Engine: InnoDB
-- Charset: utf8mb4 / Collate: utf8mb4_unicode_ci
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `hotel_core`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `hotel_core`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `menu_items`;
DROP TABLE IF EXISTS `hotel_members`;
DROP TABLE IF EXISTS `hotels`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- 1. USERS
-- Customers and platform administrators.
-- -----------------------------------------------------------------------------
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('CUSTOMER', 'PLATFORM_ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. HOTELS
-- Individual hotel/vendor tenants operating on the platform.
-- -----------------------------------------------------------------------------
CREATE TABLE `hotels` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hotels_slug` (`slug`),
  INDEX `idx_hotels_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. HOTEL MEMBERS
-- Association between users and hotels, granting hotel administrator privileges.
-- -----------------------------------------------------------------------------
CREATE TABLE `hotel_members` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `hotel_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('ADMIN') NOT NULL DEFAULT 'ADMIN',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `hotel_id`),
  INDEX `idx_hotel_members_hotel` (`hotel_id`),
  CONSTRAINT `fk_hotel_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hotel_members_hotel`
    FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. MENU ITEMS
-- Hotel-owned catalog items. Prices stored as integer paise.
-- -----------------------------------------------------------------------------
CREATE TABLE `menu_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hotel_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `category` VARCHAR(100) NOT NULL,
  `price` INT UNSIGNED NOT NULL COMMENT 'Current item price in integer paise',
  `is_available` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Composite unique key required for order_items composite foreign key
  UNIQUE KEY `uq_menu_items_id_hotel` (`id`, `hotel_id`),
  -- Prevent duplicate menu items within a hotel and category
  UNIQUE KEY `uq_menu_items_hotel_category_name` (`hotel_id`, `category`, `name`),
  INDEX `idx_menu_items_hotel_id` (`hotel_id`),
  INDEX `idx_menu_items_hotel_category` (`hotel_id`, `category`),
  INDEX `idx_menu_items_is_available` (`is_available`),
  CONSTRAINT `fk_menu_items_hotel`
    FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_menu_items_price`
    CHECK (`price` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. ORDERS
-- Customer orders scoped to a single hotel tenant.
-- Amounts stored as integer paise.
-- -----------------------------------------------------------------------------
CREATE TABLE `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hotel_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `customer_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'cod',
  `total_amount` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total amount in integer paise',
  `status` ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
  `cancelled_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Composite unique key required for order_items composite foreign key
  UNIQUE KEY `uq_orders_id_hotel` (`id`, `hotel_id`),
  INDEX `idx_orders_user_id` (`user_id`),
  INDEX `idx_orders_hotel_status` (`hotel_id`, `status`),
  INDEX `idx_orders_created_at` (`created_at`),
  CONSTRAINT `fk_orders_hotel`
    FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_orders_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_orders_total_amount`
    CHECK (`total_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. ORDER ITEMS
-- Line items snapshotting item details at purchase time.
-- Uses composite foreign keys to enforce tenant isolation at database level.
-- -----------------------------------------------------------------------------
CREATE TABLE `order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `hotel_id` BIGINT UNSIGNED NOT NULL,
  `menu_item_id` BIGINT UNSIGNED NOT NULL,
  `item_name` VARCHAR(150) NOT NULL,
  `unit_price` INT UNSIGNED NOT NULL COMMENT 'Unit price at order time in integer paise',
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `subtotal` INT UNSIGNED NOT NULL COMMENT 'Line subtotal in integer paise',
  PRIMARY KEY (`id`),
  INDEX `idx_order_items_order_id` (`order_id`),
  INDEX `idx_order_items_hotel_id` (`hotel_id`),
  INDEX `idx_order_items_menu_item_id` (`menu_item_id`),
  -- Composite FK enforcing order and order item share the exact same hotel_id
  CONSTRAINT `fk_order_items_order`
    FOREIGN KEY (`order_id`, `hotel_id`)
    REFERENCES `orders` (`id`, `hotel_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- Composite FK enforcing menu item and order item share the exact same hotel_id
  CONSTRAINT `fk_order_items_menu_item`
    FOREIGN KEY (`menu_item_id`, `hotel_id`)
    REFERENCES `menu_items` (`id`, `hotel_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_order_items_unit_price`
    CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_order_items_quantity`
    CHECK (`quantity` > 0),
  CONSTRAINT `chk_order_items_subtotal`
    CHECK (`subtotal` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
