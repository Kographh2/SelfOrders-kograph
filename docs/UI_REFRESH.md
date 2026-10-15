# Responsive UI refresh

The refresh updates shared typography, focus states, mobile form sizing, dark-theme text contrast, and reduced motion. The menu uses quieter opaque cards, a separated action row, larger quantity controls, and a floating glass navigation dock. The dashboard shell reserves mobile toolbar space and constrains its content width; its desktop sidebar stays within the viewport. Cart and payment sheets support viewport height, safe areas, Escape, focus containment, and focus restoration.

Glass is a CSS adaptation, not Apple's native rendering API. Reference: https://developer.apple.com/design/human-interface-guidelines/materials . Glass is limited to navigation and its account panel, with opaque fallbacks for unsupported blur, reduced transparency, and increased contrast.

## Local verification

- TypeScript: passed.
- Production build: isolated `.next-ui` output; lint warnings remain in existing image/font/hook code.
- Browser suite: `npm run test:ui` against the isolated build. Uses mocked catalog and API responses, not live payments.
- Widths: 320, 390, 768, 1440 CSS pixels. Checks horizontal overflow, add/remove quantity, cart, account Escape/focus, search empty state.
- Dark/reduced-motion short screen: 390 x 568, verifies payment CTA can be scrolled into view.
- Screenshots: `artifacts/ui/` (generated, ignored by git).

Build before running the suite in PowerShell:

```powershell
$env:SELFORDER_BUILD_DIR='.next-ui'
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm.cmd run build
npm.cmd run test:ui
```

Chrome verification does not establish physical iPhone/Safari compatibility. Authenticated dashboard screens, live Supabase/Midtrans, and deployment have not been browser-verified in this UI pass. Existing kiosk styling and business/payment contracts are retained.
