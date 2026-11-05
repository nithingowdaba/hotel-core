-- Development/demo data only. Platform administrators are never seeded.
-- This file assumes the connection is already using the explicitly selected DB.
-- Inserts are idempotent. Matching demo hotels/menu rows are updated; unrelated rows are preserved.

INSERT INTO hotels
  (name, slug, description, cuisines, address, phone, logo_url, cover_url, accepting_orders, status)
VALUES
  ('Udupi Hotel', 'udupi-hotel',
   'South Indian tiffins and traditional filter coffee.', 'South Indian, Tiffins',
   '12 Temple Road, Bengaluru', '+919876543210', '/img/hotels/udupi-logo.jpg', '/img/hotels/udupi-cover.jpg', TRUE, 'active'),
  ('Divum Vendor', 'divum-vendor',
   'Fresh meals, quick bites, and drinks for the workday.', 'North Indian, Italian, Beverages',
   'Divum Corporate Tower, Bengaluru', '+919876543211', '/img/hotels/divum-logo.jpg', '/img/hotels/divum-cover.jpg', TRUE, 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), cuisines = VALUES(cuisines),
  address = VALUES(address), phone = VALUES(phone), logo_url = VALUES(logo_url),
  cover_url = VALUES(cover_url), accepting_orders = VALUES(accepting_orders), status = VALUES(status);

INSERT INTO menu_items
  (hotel_id, name, description, category, price, is_veg, image_url, is_available)
SELECT h.id, seed.name, seed.description, seed.category, seed.price, seed.is_veg, seed.image_url, seed.is_available
FROM hotels h
JOIN (
  SELECT 'udupi-hotel' AS slug, 'Masala Dosa' AS name, 'Crisp dosa with spiced potato, sambar, and chutney.' AS description, 'South Indian' AS category, 80.00 AS price, TRUE AS is_veg, '/img/dishes/masala-dosa.jpg' AS image_url, TRUE AS is_available
  UNION ALL SELECT 'udupi-hotel', 'Idli (2 pcs)', 'Steamed rice cakes with sambar and coconut chutney.', 'South Indian', 55.00, TRUE, '/img/dishes/idli.jpg', TRUE
  UNION ALL SELECT 'udupi-hotel', 'Medu Vada (2 pcs)', 'Crisp lentil fritters served with chutney.', 'South Indian', 60.00, TRUE, '/img/dishes/medu-vada.jpg', TRUE
  UNION ALL SELECT 'udupi-hotel', 'Bisi Bele Bath', 'Karnataka rice and lentil dish with vegetables.', 'South Indian', 90.00, TRUE, '/img/dishes/bisi-bele-bath.jpg', TRUE
  UNION ALL SELECT 'udupi-hotel', 'Filter Coffee', 'Freshly brewed South Indian filter coffee.', 'Beverages', 35.00, TRUE, '/img/dishes/filter-coffee.jpg', TRUE
  UNION ALL SELECT 'udupi-hotel', 'Masala Tea', 'Ginger and cardamom tea.', 'Beverages', 25.00, TRUE, '/img/dishes/masala-tea.jpg', TRUE
  UNION ALL SELECT 'udupi-hotel', 'Mangalore Buns', 'Soft banana buns served with chutney.', 'Snacks', 50.00, TRUE, '/img/dishes/mangalore-buns.jpg', TRUE
  UNION ALL SELECT 'udupi-hotel', 'Vegetable Upma', 'Savory semolina cooked with vegetables.', 'Snacks', 55.00, TRUE, '/img/dishes/vegetable-upma.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Paneer Butter Masala Meal', 'Paneer curry served with rice and bread.', 'Mains', 180.00, TRUE, '/img/dishes/paneer-butter-masala-meal.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Dal Makhani Rice Bowl', 'Slow-cooked black lentils over basmati rice.', 'Mains', 140.00, TRUE, '/img/dishes/dal-makhani-rice-bowl.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Chicken Curry Meal', 'Chicken curry served with rice.', 'Mains', 190.00, FALSE, '/img/dishes/chicken-curry-meal.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Grilled Veg Sandwich', 'Grilled sandwich with vegetables and cheese.', 'Quick Bites', 120.00, TRUE, '/img/dishes/grilled-veg-sandwich.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Penne Arrabbiata', 'Penne pasta in a spicy tomato sauce.', 'Quick Bites', 160.00, TRUE, '/img/dishes/penne-arrabbiata.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Crispy Peri Peri Fries', 'Crisp fries with peri peri seasoning.', 'Quick Bites', 75.00, TRUE, '/img/dishes/peri-peri-fries.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Iced Americano', 'Espresso served over ice and water.', 'Beverages', 65.00, TRUE, '/img/dishes/iced-americano.jpg', TRUE
  UNION ALL SELECT 'divum-vendor', 'Mango Lassi', 'Chilled yogurt drink blended with mango.', 'Beverages', 80.00, TRUE, '/img/dishes/mango-lassi.jpg', TRUE
) AS seed ON seed.slug = h.slug
ON DUPLICATE KEY UPDATE
  description = VALUES(description), price = VALUES(price), is_veg = VALUES(is_veg),
  image_url = VALUES(image_url), is_available = VALUES(is_available);
