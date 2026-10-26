# Luu offline recovery

The recovery experience uses the original Luu Drained SVG: grayscale character, tired eyes, subtle movement, and the application's navy/white identity. It includes a clear connection status, a disabled-while-checking retry button, last-check time, optional saved draft details, and an optional six-pair memory game. All artwork, CSS, animation, and game code are local and included in one document. Keyboard navigation, reduced motion, dark mode, and narrow screens are supported.

## Connection and recovery

- `ConnectivityGuard` debounces an offline event for 600 ms and keeps the existing page mounted but hidden and inert. Verified recovery removes the cover without reloading, preserving typed input and React state. Page-level recovery monitors pause while covered by this global screen.
- `createConnectionMonitor` separates offline, checking, unavailable, and online. Browser connection status is a hint; recovery requires two affirmative, uncached `/api/connection` responses, 900 ms apart. A check has a six-second timeout, a single in-flight promise, a 2.5-second minimum retry interval, and automatic backoff of 5/10/20/30 seconds. Timers pause in hidden documents; disposal aborts work and removes listeners.
- HTTP failures, captive-portal HTML, and timeouts are unavailable states unless the browser also reports offline. API authorization failures are not globally intercepted. Catalog 401/403 responses retain an access message on the page.
- Catalog recovery additionally reloads the actual catalog before dismissing. Standalone recovery verifies the destination document before navigation. A heartbeat alone does not establish database or payment-provider health. Generic application error boundaries require manual retry because reachability cannot prove a JavaScript fault is repaired.
- The embedded document delegates checks to its React host, preventing duplicate polling. The standalone document owns its monitor. Messages validate sender and origin; listeners, animation frames, timers, and observers are cleaned up. Underlying controls are inert while recovery is open, and focus is restored afterward.

## Real saved data only

The recovery document reads the existing `selforder_order_draft` session-storage format. Only a valid version-1 draft less than 12 hours old exposes the read-only saved-items section, including its saved timestamp and notes. No draft means no saved-data action. These items are not confirmed orders; prices and availability must be checked online. Active-page input survives a temporary offline cover; a hard reload only restores fields already persisted by the existing order provider, not arbitrary forms.

The existing push worker continues to cache only the self-contained recovery document. It handles navigation failures, a 12-second navigation timeout, and HTTP 5xx. Its cache revision is derived from the complete generated document, so changed artwork or recovery code installs a new cache. API calls, mutations, authenticated pages, and RSC requests are not cached or replayed. No background payment submission or optimistic payment success was added.

Offline reload requires a previous online visit that installed the worker and cached the document. A first-ever offline visit, unsupported service worker, or evicted browser storage cannot provide that cached page. The already-mounted app still embeds the recovery document without requiring a worker.

## Regeneration and checks

Run `npm run generate:luu` after changing the source mascot, extraction script, connection monitor, or recovery sources. Production builds and the isolated browser-test build regenerate automatically.

```powershell
node --test --test-isolation=none tests/offline/*.test.mjs
node scripts/build-kiosk-test.mjs
$env:SELFORDER_BUILD_DIR='.next-kiosk-test'
npm.cmd run test:ui
npm.cmd run test:kiosk:browser
```

Unit coverage includes timeout/abort, single-flight checks, unstable reconnection, page verification, HTTP access/server failures, SVG SSR/unique IDs, animation cleanup, cache revision, and service-worker routing. Browser coverage includes the original Drained geometry comparison, empty/saved drafts, repeated disconnection without losing input, delayed Thinking, access denial, timeout, nested recovery, and real service-worker offline navigation. Kiosk tests distinguish server-confirmed payment from pending payment.

These are local tests with fixture APIs and Chrome. Live database/payment integrations, deployment, physical kiosk hardware, and Safari/iPhone require separate validation. See `LUU_MASCOT.md` for placement and implementation files.

## Local validation, 2026-10-26

- Isolated production build: passed, including TypeScript and lint checks. Existing image/font/hook lint warnings remain.
- Offline unit and worker suite: 11 passed, including missing cached-document behavior.
- Chrome UI suite: 20 passed (1.5 minutes), including 320/390/768/1440 px layouts, keyboard focus after recovery, stored notes, offline reload, timeout, access denial, and single-monitor behavior.
- Chrome kiosk suite: 12 passed (59.6 seconds), including confirmed-payment Celebrating, absence of that pose while payment is pending, QR handoff, scan acknowledgement, ten-second reset, virtual keyboard, and late-response isolation.
- `git diff --check`: passed.
