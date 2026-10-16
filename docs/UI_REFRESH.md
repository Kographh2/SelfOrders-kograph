# Consumer pages and Liquid Glass navigation

Navigation now opens real routes: `/menu`, `/search`, `/cart`, and `/profile`. `/settings` is accessible from the profile. The profile has identity, order/wallet/reward shortcuts, account information, staff dashboard access, help, and explicit logout confirmation. There is no account dropdown in the navbar.

The shared navbar stays mounted between these routes. A subtle selection stays visible at rest. On pointer contact the glass lens appears and expands, follows a horizontal drag, then fades after release; cancellation, pointer exit, and window blur clear the pressed state. The destination commits on drag release. Keyboard links support the pressed feedback too. Reduced-motion preferences remove the spring expansion. Normal links still support keyboard activation, browser back/forward, and opening in another tab. QR scanning is a separate action. CSS materials adapt to dark mode, reduced transparency, increased contrast, and unsupported backdrop filtering.

Settings persist theme (light/dark/system), reduced motion, reduced transparency, and menu-content language. Notification controls use the existing subscription endpoints and distinguish browser permission from an actual push subscription. Live push delivery needs configured VAPID credentials and device permission.

The order provider retains cart lines, selected options, store, table, reservation context, order type, and pickup time across consumer routes and reloads using session storage. Drafts expire after 12 hours without being saved. Storage failure falls back to memory. Changing the store clears the old cart and table/reservation context. Pricing and payment authorization remain server-controlled.

## Verification

Local result: production build passed; TypeScript passed; all eleven Chrome browser tests passed (eight consumer flow cases and three advertising cases). Lint reports image, font, and pre-existing hook warnings.

Build and test with PowerShell:

```powershell
$env:SELFORDER_BUILD_DIR='.next-ui'
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm.cmd run build
npm.cmd run test:ui
```

The browser suite uses a fixture catalog and mocked API responses; it does not submit live payments. Coverage includes widths 320/390/768/1440, navy colors and sans-serif headings, compact header height, page navigation, search, quantity updates, reload persistence, store/table isolation, settings persistence, pressed glass appearance and release, drag cancellation, keyboard navigation, empty cart, pickup validation, and a scrollable payment panel on a short dark-mode screen. Screenshots are generated in `artifacts/ui/` (ignored by git).

Physical iPhone/Safari, live push delivery, Supabase/Midtrans, authenticated dashboard screens, and deployment need separate live verification. Liquid Glass is a web interpretation of Apple's guidance, not the native iOS rendering API.

References: https://developer.apple.com/design/human-interface-guidelines/materials and https://developer.apple.com/design/human-interface-guidelines/tab-bars .
