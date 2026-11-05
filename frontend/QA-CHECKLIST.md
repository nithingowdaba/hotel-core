# Step 6a browser QA checklist

Run `npm run dev` from `frontend/`, open the displayed URL, and repeat at 390 px and desktop width.

- [ ] Home search debounces, cuisine chips filter, cards load more, closed hotels are marked, and card images fall back gracefully.
- [ ] Hotel menu search, veg filter, category scroll-spy, ADD/quantity stepper, unavailable items, closed hotel banner, and sticky cart bar work.
- [ ] Add from another hotel; cancel and confirm the replace-cart dialog. Refresh and confirm the cart persists.
- [ ] Cart payment choices, quantity removal, login-at-checkout return, and one-click order submission work.
- [ ] Success screen shows the returned order total; open the order detail and verify items/status.
- [ ] Orders All/Active/Past, pagination, pending cancellation, completed/cancelled status, and reorder path work.
- [ ] Account profile and logout work; cart survives logout. Admin links lead to the placeholder.
- [ ] Expire the session and verify redirect to login with cart retained. Disable network and verify the offline toast stays visible.
- [ ] Complete a keyboard-only pass: focus rings, tabs/chips/steppers, modal focus and Escape handling.
- [ ] Check browser console for errors, especially CSP violations. Check 360–430 px widths for horizontal scrolling and 44 px controls.
