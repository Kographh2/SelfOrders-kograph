# Luu integration

Source: `mascot/LUUJAAA-Mascot-Studio-V2.html`. The character remains an inline SVG using the original body, joints, bandana, face, proportions, filters, and rig geometry. Studio buttons, sliders, event log, simulation controls, and their DOM dependencies are not shipped.

## Selected placements

| Place | Pose | Reason |
| --- | --- | --- |
| Offline / service recovery | Drained | Explains interruption with tired eyes, grayscale character and small motion; application colors stay navy/white. |
| Catalog loading lasting over 700 ms | Thinking | Explains an actual wait while avoiding flashes during fast requests. |
| Search with a nonempty query and no matches | Confused | Gives context for a search that needs changing. |
| Kiosk payment confirmation | Celebrating | Appears only when the existing server-verified flow confirms payment; pending payment has no success mascot. |

No mascot is added to navigation, ordinary cards, tables, buttons, profile, or every modal. Those surfaces already explain their function without another illustration. No pose gallery or user-facing pose selector is included.

## Components and generation

`src/components/LuuMascot.tsx` exposes `pose`, `size`, and an optional accessible `label`. It is decorative by default. React `useId` prefixes every SVG ID and filter reference independently, and server-rendered markup already contains complete pose geometry. It respects the app's reduced-motion preference and the system setting. The rig stops animation offscreen or in a hidden document and releases listeners, observers, and animation frames on unmount.

```tsx
<LuuMascot pose="thinking" size={180} />
```

`scripts/extract-luu.mjs` extracts original geometry and just the four selected poses. It generates `src/lib/mascot/luu-art.json` and `luu-runtime.js`; their type interface is `luu-runtime.d.ts`. Edit the source/extractor rather than hand-editing generated geometry.

`scripts/build-offline.mjs` combines the same artwork/runtime, shared monitor, and `src/lib/offline/` template/CSS/controller/game into `public/offline.html`, then updates the content-derived revision in `public/offline-worker.js`. No CDN, external font, image download, or runtime source-studio request is required. `npm run generate:luu` regenerates both paths; the production prebuild and isolated test build do this automatically.

## Implementation file map

- Mascot: `scripts/extract-luu.mjs`, `src/components/LuuMascot.tsx`, `src/lib/mascot/*`.
- Page placement: `src/components/MenuLoading.tsx`, `src/app/menu/MenuPageContent.tsx`, `src/components/kiosk/KioskExperience.tsx`.
- Recovery host: `src/components/ConnectivityGuard.tsx`, `src/components/RecoveryScreen.tsx`, `src/contexts/OfflineCoverContext.ts`, `src/lib/connection-monitor.js`, `src/lib/connection-monitor.d.ts`.
- Offline document: `src/lib/offline/recovery.template.html`, `recovery.css`, `recovery.js`, `game.js`; `scripts/build-offline.mjs`, `public/offline.html`, `public/offline-worker.js`.
- Build integration: `package.json`, `scripts/build-kiosk-test.mjs`.
- Tests: `tests/offline/connection.test.mjs`, `luu.test.mjs`, `worker.test.mjs`; `tests/ui/luu.spec.ts`, `offline.spec.ts`; `tests/kiosk/browser/flow.spec.ts`.
- Documentation: this file and `docs/OFFLINE_RECOVERY.md`.

Validation screenshots are generated under `artifacts/ui/`: `luu-reference.png`, `luu-drained.png`, `luu-thinking.png`, and `offline-mobile.png`. The reference and extracted Drained geometry are compared directly by browser tests, including body, arms, legs, and eyes.
