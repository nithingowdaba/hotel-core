-- =============================================================================
-- HOTEL CORE DATABASE SEED DATA
-- Development seed for initial tenants and menus.
-- NOTE: Never create a PLATFORM_ADMIN in this file. Platform admins are
-- created exclusively through the CLI script (scripts/create-admin.js).
-- =============================================================================

USE `hotel_core`;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `order_items`;
TRUNCATE TABLE `orders`;
TRUNCATE TABLE `hotel_members`;
TRUNCATE TABLE `menu_items`;
TRUNCATE TABLE `hotels`;
TRUNCATE TABLE `users`;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- 1. HOTELS (Initial Tenants)
-- -----------------------------------------------------------------------------
INSERT INTO `hotels` (`id`, `name`, `slug`, `description`, `address`, `phone`, `status`)
VALUES
  (
    1,
    'Udupi Hotel',
    'udupi-hotel',
    'Authentic South Indian vegetarian delicacies, crispy dosas, fluffy idlis, and traditional filter coffee.',
    '12 Temple Road, Indiranagar, Bangalore - 560038',
    '+919876543210',
    'active'
  ),
  (
    2,
    'Divum Vendor',
    'divum-vendor',
    'Multi-cuisine corporate cafeteria serving fresh wholesome meals, hot bowls, snacks, and refreshing coolers.',
    'Divum Corporate Tower, Outer Ring Road, Bellandur, Bangalore - 560103',
    '+919876543211',
    'active'
  );

-- -----------------------------------------------------------------------------
-- 2. USERS (Customers & Hotel Managers - NEVER platform admin)
-- Password for seed accounts: "Customer123!"
-- -----------------------------------------------------------------------------
INSERT INTO `users` (`id`, `full_name`, `email`, `phone`, `password_hash`, `role`, `is_active`)
VALUES
  (
    1,
    'Udupi Manager',
    'udupi.admin@example.com',
    '+919876500001',
    '$2b$12$x7N0qsLyFvLYYjSZfDc63ePgiR9iFo6WGS73T3Znfjp0MNLQ49ani',
    'CUSTOMER',
    TRUE
  ),
  (
    2,
    'Divum Manager',
    'divum.admin@example.com',
    '+919876500002',
    '$2b$12$x7N0qsLyFvLYYjSZfDc63ePgiR9iFo6WGS73T3Znfjp0MNLQ49ani',
    'CUSTOMER',
    TRUE
  ),
  (
    3,
    'Anand Kumar',
    'customer@example.com',
    '+919876500003',
    '$2b$12$x7N0qsLyFvLYYjSZfDc63ePgiR9iFo6WGS73T3Znfjp0MNLQ49ani',
    'CUSTOMER',
    TRUE
  );

-- -----------------------------------------------------------------------------
-- 3. HOTEL MEMBERS
-- Links customer accounts to hotels as HOTEL_ADMIN.
-- -----------------------------------------------------------------------------
INSERT INTO `hotel_members` (`user_id`, `hotel_id`, `role`)
VALUES
  (1, 1, 'ADMIN'), -- Udupi Manager -> Udupi Hotel
  (2, 2, 'ADMIN'); -- Divum Manager -> Divum Vendor

-- -----------------------------------------------------------------------------
-- 4. MENU ITEMS — Udupi Hotel (hotel_id = 1)
-- 7 items across 3 categories: South Indian, Beverages, Snacks
-- All prices in integer paise (1 INR = 100 paise)
-- -----------------------------------------------------------------------------
INSERT INTO `menu_items` (`id`, `hotel_id`, `name`, `description`, `category`, `price`, `is_available`)
VALUES
  (
    1,
    1,
    'Masala Dosa',
    'Thin crispy fermented rice crepe stuffed with spiced mashed potatoes, served with sambar and two chutneys.',
    'South Indian',
    8000,
    TRUE
  ),
  (
    2,
    1,
    'Ghee Podi Idli (2 pcs)',
    'Steamed rice cakes tossed in aromatic spiced lentil gunpowder and clarified butter.',
    'South Indian',
    7500,
    TRUE
  ),
  (
    3,
    1,
    'Medu Vada (2 pcs)',
    'Golden crispy deep-fried lentil doughnuts served with fresh coconut chutney and hot sambar.',
    'South Indian',
    6000,
    TRUE
  ),
  (
    4,
    1,
    'Bisi Bele Bath',
    'Karnataka style spiced rice and lentil mash with vegetables, topped with ghee and boondi.',
    'South Indian',
    9000,
    TRUE
  ),
  (
    5,
    1,
    'South Indian Filter Coffee',
    'Freshly decocted robusta-chicory blend frothed with thick whole milk in a traditional dabarah set.',
    'Beverages',
    3500,
    TRUE
  ),
  (
    6,
    1,
    'Masala Tea',
    'Crushed ginger and cardamom infused Assam black tea brewed with fresh milk.',
    'Beverages',
    2500,
    TRUE
  ),
  (
    7,
    1,
    'Mangalore Buns (2 pcs)',
    'Mildly sweet, fluffy fried banana flatbread served with coconut chutney.',
    'Snacks',
    5000,
    TRUE
  );

-- -----------------------------------------------------------------------------
-- 5. MENU ITEMS — Divum Vendor (hotel_id = 2)
-- 7 items across 3 categories: Mains, Quick Bites, Beverages
-- All prices in integer paise (1 INR = 100 paise)
-- -----------------------------------------------------------------------------
INSERT INTO `menu_items` (`id`, `hotel_id`, `name`, `description`, `category`, `price`, `is_available`)
VALUES
  (
    8,
    2,
    'Paneer Butter Masala Meal',
    'Cottage cheese simmered in buttery tomato-cashew gravy served with 2 butter naans, jeera rice, and salad.',
    'Mains',
    18000,
    TRUE
  ),
  (
    9,
    2,
    'Dal Makhani Rice Bowl',
    'Slow-cooked black lentils in butter cream served over aromatic basmati rice.',
    'Mains',
    14000,
    TRUE
  ),
  (
    10,
    2,
    'Chole Bhature',
    'Spiced Punjabi chickpea masala served with two puffed golden bhaturas and pickled onions.',
    'Mains',
    13000,
    TRUE
  ),
  (
    11,
    2,
    'Grilled Veg Club Sandwich',
    'Multi-grain toasted bread with cucumber, tomato, grilled paneer, mint chutney, and cheese.',
    'Quick Bites',
    12000,
    TRUE
  ),
  (
    12,
    2,
    'Penne Arrabbiata Pasta',
    'Al dente durum wheat penne tossed in garlic, chili flakes, and rich tomato herb sauce.',
    'Quick Bites',
    16000,
    TRUE
  ),
  (
    13,
    2,
    'Crispy Peri Peri Fries',
    'Deep-fried French fries dusted with tangy peri peri seasoning, served with garlic mayo dip.',
    'Quick Bites',
    7500,
    TRUE
  ),
  (
    14,
    2,
    'Iced Americano Cooler',
    'Double espresso shot poured over chilled mineral water and ice cubes.',
    'Beverages',
    6500,
    TRUE
  );
