# Luu integration

Source: `mascot/LUUJAAA-Mascot-Studio-V2.html`. The character remains an inline SVG using the original body, joints, bandana, face, proportions, filters, and rig geometry. Studio buttons, sliders, event log, simulation controls, and their DOM dependencies are not shipped.

## Selected placements

| Place | Pose | Reason |
| --- | --- | --- |
| Offline / service recovery | Drained | Explains interruption with tired eyes, grayscale character and small motion; application colors stay navy/white. |
| Customer / kiosk search with a nonempty query and no matches | Confused | Gives context for a search that needs changing. |
| Closed customer store / kiosk branch | Sleeping | Explains that ordering is paused, with the original sleeping rig and next opening information when supplied by the API. |
| Kiosk payment confirmation | Celebrating | Appears only when the existing server-verified flow confirms payment; pending payment has no success mascot. |

No mascot is added to navigation, ordinary cards, tables, buttons, profile, or every modal. Those surfaces already explain their function without another illustration. No pose gallery or user-facing pose selector is included.

## Components and generation

`src/components/LuuMascot.tsx` exposes `pose`, `size`, and an optional accessible `label`. It is decorative by default. React `useId` prefixes every SVG ID and filter reference independently, and server-rendered markup already contains complete pose geometry. It respects the app's reduced-motion preference and the system setting. The rig stops animation offscreen or in a hidden document and releases listeners, observers, and animation frames on unmount.

```tsx
<LuuMascot pose="thinking" size={180} />
```

`scripts/extract-luu.mjs` extracts original geometry and just the five selected poses. It generates `src/lib/mascot/luu-art.json` and `luu-runtime.js`; their type interface is `luu-runtime.d.ts`. Edit the source/extractor rather than hand-editing generated geometry.

`scripts/build-offline.mjs` combines the same artwork/runtime, shared monitor, and `src/lib/offline/` template/CSS/controller/game into `public/offline.html`, then updates the content-derived revision in `public/offline-worker.js`. No CDN, external font, image download, or runtime source-studio request is required. `npm run generate:luu` regenerates both paths; the production prebuild and isolated test build do this automatically.

## Implementation file map

- Mascot: `scripts/extract-luu.mjs`, `src/components/LuuMascot.tsx`, `src/lib/mascot/*`.
- Page placement: `src/components/MenuLoading.tsx`, `src/app/menu/MenuPageContent.tsx`, `src/components/kiosk/KioskExperience.tsx`.
- Recovery host: `src/components/ConnectivityGuard.tsx`, `src/components/RecoveryScreen.tsx`, `src/contexts/OfflineCoverContext.ts`, `src/lib/connection-monitor.js`, `src/lib/connection-monitor.d.ts`.
- Offline document: `src/lib/offline/recovery.template.html`, `recovery.css`, `recovery.js`, `game.js`; `scripts/build-offline.mjs`, `public/offline.html`, `public/offline-worker.js`.
- Build integration: `package.json`, `scripts/build-kiosk-test.mjs`.
- Tests: `tests/offline/connection.test.mjs`, `luu.test.mjs`, `worker.test.mjs`; `tests/ui/luu.spec.ts`, `offline.spec.ts`; `tests/kiosk/browser/flow.spec.ts`.
- Documentation: this file and `docs/OFFLINE_RECOVERY.md`.

Earlier validation screenshots are generated under `artifacts/ui/`: `luu-reference.png`, `luu-drained.png`, `luu-thinking.png`, `offline-mobile.png`, `logo-loading.png`, and `luu-sleeping.png`. The reference and extracted Drained geometry are compared directly by browser tests, including body, arms, legs, and eyes.

## Animated brand logo and real loading

The supplied `mascot/logo/LUUJAAA-Animated-Logo (1).html` uses an embedded PNG with nine clipped layers and Web Animations, not vector SVG lettering. `scripts/extract-logo.mjs` preserves that artwork, the original clipping polygons and entrance/exit keyframes, removes studio controls, and generates a local 1086 px lossless WebP (resized from the supplied 2172 px image), `logo-runtime.js`, and `logo.css`. No vector recreation or new logo design is substituted.

`LuuLogo.tsx` renders a complete static image on the server and starts the original animation at fixed **1x** after local image decoding. All logo placements autoplay and repeat the source entrance/hold/exit sequence, including headers, dashboard, kiosk, and offline recovery. Loading loops only while data is pending, then unmounts immediately. The artwork keeps its alpha channel and the wrapper has a transparent background. Reduced motion shows the complete still logo. Hidden documents stop playback; unmount cancels animations, delayed sequences and listeners. No studio UI or adjustable speed is exposed.

`SiteBrandHeader.tsx` supplies an upper-left logo on customer, account, and other standard routes. Kiosk uses its own header; desktop dashboard uses its sidebar and mobile dashboard uses the shared header. The offline document embeds the same compressed image and rig, so its logo needs no extra request. The layout reserves space rather than overlaying controls.

Loading now shows only the animated wordmark, without the cow. Thinking remains available in the reusable rig for later use. Screen-reader status messages track actual requests: **Memuat informasi toko** while fetching stores, then **Memuat menu dan ketersediaan** while fetching the selected store, categories, and items. No invented percentage or mandatory splash delay is added. Menu route Suspense and kiosk initial loading also use the logo. Errors still lead to the existing access or recovery UI.

Additional files: `scripts/extract-logo.mjs`, `public/brand/luujaaa-logo.webp`, `src/lib/mascot/logo-runtime.js`, `logo-runtime.d.ts`, `logo.css`, `src/components/LuuLogo.tsx`, `SiteBrandHeader.tsx`, `src/app/brand.css`, `src/app/menu/loading.tsx`, root layout, menu/search/cart Suspense pages, dashboard sidebar, and `tests/ui/brand.spec.ts`.

The root redirect retains its HTTP redirect status: loading boundaries are scoped to the menu route, not the root layout. The kiosk-host root rewrite also omits the shared header so the kiosk header is the only logo bar.

Validation for this update: TypeScript and isolated production build passed; 11 offline unit tests and 23 UI browser tests passed. A global-loading redirect regression was found and fixed by scoping the route boundary to menu. The final build passed all 12 kiosk tests (including real HTTP root redirects) and a repeat of all 3 brand/loading tests. The first build ran out of Windows memory; retrying with a 2048 MB old-space limit completed successfully. Existing lint warnings remain. Live deployment and physical Safari/kiosk hardware were not tested.
