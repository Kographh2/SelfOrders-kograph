# Consumer pages and Liquid Glass navigation

Navigation now opens real routes: `/menu`, `/search`, `/cart`, and `/profile`. `/settings` is accessible from the profile. The profile has identity, order/wallet/reward shortcuts, account information, staff dashboard access, help, and explicit logout confirmation. There is no account dropdown in the navbar.

The shared navbar stays mounted between these routes. Its spring-driven glass lens follows a horizontal pointer drag, commits the destination on release, and cancels safely. Normal links still support keyboard activation, browser back/forward, and opening in another tab. QR scanning is a separate action. CSS materials adapt to dark mode, reduced transparency, increased contrast, and unsupported backdrop filtering.

Settings persist theme (light/dark/system), reduced motion, reduced transparency, and menu-content language. Notification controls use the existing subscription endpoints and distinguish browser permission from an actual push subscription. Live push delivery needs configured VAPID credentials and device permission.

The order provider retains cart lines, selected options, store, table, reservation context, order type, and pickup time across consumer routes and reloads using session storage. Drafts expire after 12 hours without being saved. Storage failure falls back to memory. Changing the store clears the old cart and table/reservation context. Pricing and payment authorization remain server-controlled.

## Verification

Local result: production build passed; TypeScript passed; eight Chrome browser tests passed. Lint reports image, font, and pre-existing hook warnings.

Build and test with PowerShell:

```powershell
$env:SELFORDER_BUILD_DIR='.next-ui'
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm.cmd run build
npm.cmd run test:ui
```

The browser suite uses a fixture catalog and mocked API responses; it does not submit live payments. Coverage includes widths 320/390/768/1440, page navigation, search, quantity updates, reload persistence, store/table isolation, settings persistence, drag navigation, keyboard navigation, empty cart, pickup validation, and a scrollable payment panel on a short dark-mode screen. Screenshots are generated in `artifacts/ui/` (ignored by git).

Physical iPhone/Safari, live push delivery, Supabase/Midtrans, authenticated dashboard screens, and deployment need separate live verification. Liquid Glass is a web interpretation of Apple's guidance, not the native iOS rendering API.

References: https://developer.apple.com/design/human-interface-guidelines/materials and https://developer.apple.com/design/human-interface-guidelines/tab-bars .
