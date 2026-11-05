# Phase 6b manual QA

Run this checklist against a production build with `DB_NAME=hotel_core_dev`. Never run browser QA against `hotel_core_test`.

- [ ] Create and edit a hotel, including the duplicate-slug error.
- [ ] Add and remove a hotel admin in both modes: link by email and create a new account.
- [ ] Add, edit, and toggle menu-item availability with both valid and broken image URLs.
- [ ] Toggle accepting orders and confirm the customer sees the hotel as “Closed”.
- [ ] Confirm a customer order appears in Live orders within 15 seconds; complete and cancel orders, and confirm the customer sees each status.
- [ ] Confirm reports match completed orders and exclude cancelled orders.
- [ ] Suspend and reactivate a hotel.
- [ ] Check the metrics page.
- [ ] Confirm an admin of hotel A gets “Not authorized” on hotel B’s `/admin` route.
- [ ] At 390 px, confirm no horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`), no console or CSP errors, and broken images fall back to the placeholder.
