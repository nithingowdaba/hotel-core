-- Development/demo data only. Never run against production.
-- Platform administrators are created by a separate CLI script, never here.

USE `hotel_core`;

INSERT INTO hotels
  (id, name, slug, description, cuisines, address, phone, logo_url, cover_url, accepting_orders, status)
VALUES
  (1, 'Udupi Hotel', 'udupi-hotel',
   'South Indian tiffins and traditional filter coffee.', 'South Indian, Tiffins',
   '12 Temple Road, Bengaluru', '+919876543210', '/img/hotels/udupi-logo.jpg', '/img/hotels/udupi-cover.jpg', TRUE, 'active'),
  (2, 'Divum Vendor', 'divum-vendor',
   'Fresh meals, quick bites, and drinks for the workday.', 'North Indian, Italian, Beverages',
   'Divum Corporate Tower, Bengaluru', '+919876543211', '/img/hotels/divum-logo.jpg', '/img/hotels/divum-cover.jpg', TRUE, 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), cuisines = VALUES(cuisines),
  address = VALUES(address), phone = VALUES(phone), logo_url = VALUES(logo_url),
  cover_url = VALUES(cover_url), accepting_orders = VALUES(accepting_orders), status = VALUES(status);

INSERT INTO menu_items (hotel_id, name, description, category, price, is_veg, image_url, is_available)
VALUES
  (1, 'Masala Dosa', 'Crisp dosa with spiced potato, sambar, and chutney.', 'South Indian', 80.00, TRUE, '/img/dishes/masala-dosa.jpg', TRUE),
  (1, 'Idli (2 pcs)', 'Steamed rice cakes with sambar and coconut chutney.', 'South Indian', 55.00, TRUE, '/img/dishes/idli.jpg', TRUE),
  (1, 'Medu Vada (2 pcs)', 'Crisp lentil fritters served with chutney.', 'South Indian', 60.00, TRUE, '/img/dishes/medu-vada.jpg', TRUE),
  (1, 'Bisi Bele Bath', 'Karnataka rice and lentil dish with vegetables.', 'South Indian', 90.00, TRUE, '/img/dishes/bisi-bele-bath.jpg', TRUE),
  (1, 'Filter Coffee', 'Freshly brewed South Indian filter coffee.', 'Beverages', 35.00, TRUE, '/img/dishes/filter-coffee.jpg', TRUE),
  (1, 'Masala Tea', 'Ginger and cardamom tea.', 'Beverages', 25.00, TRUE, '/img/dishes/masala-tea.jpg', TRUE),
  (1, 'Mangalore Buns', 'Soft banana buns served with chutney.', 'Snacks', 50.00, TRUE, '/img/dishes/mangalore-buns.jpg', TRUE),
  (1, 'Vegetable Upma', 'Savory semolina cooked with vegetables.', 'Snacks', 55.00, TRUE, '/img/dishes/vegetable-upma.jpg', TRUE),
  (2, 'Paneer Butter Masala Meal', 'Paneer curry served with rice and bread.', 'Mains', 180.00, TRUE, '/img/dishes/paneer-butter-masala-meal.jpg', TRUE),
  (2, 'Dal Makhani Rice Bowl', 'Slow-cooked black lentils over basmati rice.', 'Mains', 140.00, TRUE, '/img/dishes/dal-makhani-rice-bowl.jpg', TRUE),
  (2, 'Chicken Curry Meal', 'Chicken curry served with rice.', 'Mains', 190.00, FALSE, '/img/dishes/chicken-curry-meal.jpg', TRUE),
  (2, 'Grilled Veg Sandwich', 'Grilled sandwich with vegetables and cheese.', 'Quick Bites', 120.00, TRUE, '/img/dishes/grilled-veg-sandwich.jpg', TRUE),
  (2, 'Penne Arrabbiata', 'Penne pasta in a spicy tomato sauce.', 'Quick Bites', 160.00, TRUE, '/img/dishes/penne-arrabbiata.jpg', TRUE),
  (2, 'Crispy Peri Peri Fries', 'Crisp fries with peri peri seasoning.', 'Quick Bites', 75.00, TRUE, '/img/dishes/peri-peri-fries.jpg', TRUE),
  (2, 'Iced Americano', 'Espresso served over ice and water.', 'Beverages', 65.00, TRUE, '/img/dishes/iced-americano.jpg', TRUE),
  (2, 'Mango Lassi', 'Chilled yogurt drink blended with mango.', 'Beverages', 80.00, TRUE, '/img/dishes/mango-lassi.jpg', TRUE)
ON DUPLICATE KEY UPDATE
  description = VALUES(description), price = VALUES(price), is_veg = VALUES(is_veg),
  image_url = VALUES(image_url), is_available = VALUES(is_available);
