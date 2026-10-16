# Offline and error recovery

The navy/white recovery screen includes a retry action and an untimed, shuffled six-pair food memory game. Touch and keyboard work, matched cards stay revealed, mismatches close after one second, and restart cancels pending game timers. No external font, image, script, or API is needed to play. Theme follows the stored app preference or system setting.

- While the app is open, `ConnectivityGuard` responds to the browser offline event. The underlying page stays mounted but hidden/inert. The recovery document is embedded in the application bundle, so this also works without service-worker support.
- `/offline` opens the recovery screen directly. `public/offline.html` is the self-contained fallback for full document navigation and reloads. The existing push worker now precaches only this document and handles navigation network failures, a 12-second navigation timeout, and HTTP 5xx. Existing push handlers remain in place; worker registration no longer depends on PushManager support.
- Menu catalog load failures and Next.js route/root error boundaries use the same recovery screen. Ordinary field validation, declined payments, API authorization failures, and empty stores keep their own flows.
- Reconnection does not interrupt the game. Retry probes `/api/connection` with no caching and an eight-second timeout; only an affirmative response navigates back to the same-origin original path/query/hash. This checks app reachability, not database or payment-provider health. A continued error can still show recovery again.
- No background payment/order retries, request queues, API caches, or authenticated page caches are added. The legacy `selforder-v1` cache is removed during activation; unrelated caches are untouched. Draft order retention continues to use the existing session storage behavior.

Offline reload support requires an earlier online visit that successfully installs the worker and caches the fallback. A first-ever visit without internet cannot load a web app. Service workers require HTTPS (or localhost); browser storage eviction may remove the fallback. Physical Safari/iPhone and live deployment require separate verification.

Checks: `node --test tests/offline/*.test.mjs`, `npm run typecheck`, production build with `SELFORDER_BUILD_DIR=.next-ui`, then `npm run test:ui`. Browser cases include a service-worker-blocked offline event, keyboard/card completion/restart, failed and successful retry, retained table query, and actual offline reload/new document navigation with service workers enabled. API fixtures are used for catalog recovery; no live orders or payments are submitted.

Local result (2026-10-16): production build and TypeScript passed; 3 worker tests and all 14 Chrome browser tests passed. The mobile recovery screenshot is `artifacts/ui/offline-mobile.png`. Existing image/font/hook lint warnings remain. No live deployment or physical iPhone/Safari check was performed.
