# Manual browser QA

Run against the production frontend build served by the backend with `DB_NAME=hotel_core_dev`. Never run browser QA against `hotel_core_test`. Use uniquely named QA accounts/hotels and do not reset, seed, or delete development records.

## Self-service registration

- [ ] From `/partner`, register an anonymous owner and a uniquely named hotel without providing an image. Expect a new owner account, an ADMIN membership, an active hotel, a signed-in session, and navigation to `/admin/:hotelId/settings`.
- [ ] Confirm the new hotel appears on the public home page and `/api/hotels` search, and that its storefront placeholder appears in place of a photo.
- [ ] Add an available menu item and place an order. Expect successful checkout when the hotel is accepting orders.
- [ ] Create or use a customer account, sign in, then register a second uniquely named hotel from `/partner`. Expect the existing user to be reused, an ADMIN membership to be created, an active hotel, and navigation to that hotel's settings.
- [ ] Confirm duplicate email and duplicate hotel slug attempts are rejected. Confirm no registration flow asks the platform admin to approve or reject a new hotel.

## Suspension and legacy statuses

- [ ] As a platform administrator, search all hotels and verify status chips and cover-image placeholders. Suspend an active QA hotel and confirm the dialog before proceeding.
- [ ] Confirm the suspended hotel disappears from public listing/search and direct public hotel/menu requests return not found. Try direct API order creation and a tenant write; expect `HOTEL_SUSPENDED` even with an existing customer or owner session.
- [ ] Sign in as that hotel's owner. Expect the suspended status and a clear read-only warning in the admin area. Attempt a status change from the owner API and confirm it is rejected.
- [ ] Reactivate the hotel from the platform list and hotel detail page. Expect it to become public and orders to work again when `accepting_orders` is enabled.
- [ ] If legacy pending/rejected records exist, confirm they remain hidden and labeled legacy. Activate one only through the platform-admin confirmation; confirm the owner cannot self-activate it.
- [ ] Check metrics for total, active, suspended and legacy pending/rejected counts.

## Hotel management, images, and layout

- [ ] Add/remove a hotel admin by linking an existing customer and by creating a new customer admin.
- [ ] Add, edit, and toggle menu-item availability with valid and broken image URLs. Confirm dish placeholders remain visible if images fail.
- [ ] Toggle accepting orders off. Expect customers to browse but be unable to check out; toggle it back on and confirm ordering works.
- [ ] Confirm orders appear in Live orders; complete/cancel orders and check customer history. Confirm reports include completed and exclude cancelled orders.
- [ ] Confirm an admin of hotel A cannot access hotel B's admin routes.
- [ ] At 390 px wide, check home/search cards, hotel detail, partner form, platform hotel list/detail and metrics. Confirm `document.documentElement.scrollWidth <= window.innerWidth`, controls are usable, and no console/CSP errors appear.
- [ ] In DevTools, simulate an image request failure. Confirm hotel cards, hotel detail, and admin hotel list/detail render the same local branded placeholder without a broken-image icon or layout shift.
