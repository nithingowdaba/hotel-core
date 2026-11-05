# Step 6a browser QA checklist

Run `npm run dev` from `frontend/`, open the displayed URL, and repeat at 390 px and desktop width.

- [ ] Home search debounces, cuisine chips filter, cards load more, closed hotels are marked, and card images fall back gracefully.
- [ ] Hotel menu search, veg filter, category scroll-spy, ADD/quantity stepper, unavailable items, closed hotel banner, and sticky cart bar work.
- [ ] Add from another hotel; cancel and confirm the replace-cart dialog. Refresh and confirm the cart persists.
- [ ] Cart payment choices, quantity removal, login-at-checkout return, and one-click order submission work.
- [ ] Success screen shows the returned order total; open the order detail and verify items/status.
- [ ] Orders All/Active/Past, pagination, pending cancellation, completed/cancelled status, and reorder path work.
- [ ] Account profile and logout work; cart survives logout. Hotel-admin links open the matching workspace and the platform link opens its console.
- [ ] Expire the session and verify redirect to login with cart retained. Disable network and verify the offline toast stays visible.
- [ ] Complete a keyboard-only pass: focus rings, tabs/chips/steppers, modal focus and Escape handling.
- [ ] Check browser console for errors, especially CSP violations. Check 360–430 px widths for horizontal scrolling and 44 px controls.

## Step 6b admin QA

Use a platform-admin account and a separate browser profile for the hotel admin and customer. Repeat admin checks at 390 px and desktop width.

- [ ] As platform admin, create a hotel, then add its administrator with the create-admin mode.
- [ ] Sign in as that hotel admin, add menu items with secure image URLs, edit one item, and toggle availability both ways.
- [ ] As a customer in the other profile, place an order. Confirm it appears in Live orders within 15 seconds.
- [ ] Expand an order to see items. Complete one order and cancel another pending order; confirm the list/status updates.
- [ ] Review daily sales and top-selling items; try 7-day, 30-day, and custom ranges.
- [ ] Close the hotel in Settings and confirm customer checkout cannot place an order. Reopen it afterward.
- [ ] As platform admin, suspend a hotel. Confirm the hotel workspace shows the suspended banner and disables writes; reactivate it.
- [ ] Try `/admin/<another hotel id>` as a hotel admin and confirm a clear Not authorized page; confirm customers cannot open `/platform`.
- [ ] In Platform hotels, suspend/reactivate a hotel, edit its profile, link an existing user, create an admin, and remove an admin link. Confirm removal leaves the account intact.
- [ ] Check the browser console for CSP errors and verify all admin screens at mobile and desktop sizes without horizontal page scrolling.
