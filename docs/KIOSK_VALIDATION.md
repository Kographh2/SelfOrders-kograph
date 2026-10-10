# KIOSK validation — 2026-10-10

Implementation is complete in the existing checkout. No live deployment or
production database migration was performed.

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS, including final generated route types |
| `npm run lint` | PASS, zero errors; existing warnings in legacy image/font/hook code |
| `npm run build` | PASS, production compilation, lint/type validation and 66 static pages |
| `npm run build:kiosk:test` | PASS, same production build in isolated `.next-kiosk-test` |
| `npm run test:kiosk` | PASS, 26/26 |
| `npm run test:kiosk:browser` | PASS, 7/7 on Chrome headless, 31 seconds |
| `git diff --check` | PASS; Git only reports Windows LF/CRLF conversion notices |

The separate build folder was added because another development server in the
workspace overwrote `.next` after a successful production build. That server was
not stopped. Final browser validation used `.next-kiosk-test` and the owned test
server on port 3127; Playwright shuts down its own server on completion.

## Tested behavior

**Real SQL, isolated PostgreSQL:** existing schema and all four SelfOrder migration
packs plus KIOSK migration; migration reapplication; request/session idempotency;
branch/table isolation; price mismatch rollback; option prices and kitchen notes;
menu/ingredient stock reservation and release; reservation conflicts; category and
schedule availability; policy acceptance; initialization claim; amount mismatch;
atomic/repeated/out-of-order settlement; unpaid kitchen guard; expiry/cleanup;
history preservation; refund-status compatibility; service-role-only RPC execution.

**Contract/authentication tests:** invalid quantities and input bounds; server price
authority; fee previews; tampered/expired/wrong-audience cookies; CSRF origin checks;
unknown stations; UID-only/invalid/mismatched Supabase exchange rejection; valid
exchange preserving DB role/store; inactive accounts; missing JWT secret rejection.
Supabase identity/profile responses are mocked in these authentication tests.

**Chrome browser/HTTP:**

1. Landscape 1440×1000: dine-in, unavailable menu, required option, note, cart,
   table selection, policy dialog, double-click guard, payment confirmation/reset.
2. Portrait 768×1024: takeaway, search empty state, lost response retry with the
   exact same payload/key, reload recovery and no horizontal overflow.
3. Phone 390×844: required option rejection, no horizontal overflow, idle warning
   and automatic session reset. Wall time changes without freezing native animation.
4. Empty menu, closed branch and unconfigured/error states.
5. A Snap success callback does not confirm payment if server status is pending.
6. A delayed paid polling response cannot restore an earlier customer's screen.
7. Real HTTP hostname rewrite, normal root behavior, signed cookie flags, CSRF,
   unknown station, UID-only login rejection and protected maintenance endpoint.

Browser catalog/order/provider responses use fixtures under `tests/kiosk`; they
are not production defaults. External browser API requests are blocked. Successful
fixtures do not establish live Supabase/Midtrans connectivity. Tests execute SQL
in PGlite, whose single connection does not simulate multi-connection load/deadlocks.

Screenshots generated under the ignored `test-results` directory:

- `kiosk-welcome-landscape.png`
- `kiosk-menu-landscape.png`
- `kiosk-menu-portrait.png`
- `kiosk-payment-pending.png`
- `kiosk-confirmation.png`

Edge could not launch in this Windows environment (`spawn EPERM`); final browser
results are for Chrome only. Real touchscreen hardware, live staff realtime,
printer output, public DNS/TLS and merchant sandbox/production payments still
require deployment acceptance testing.

## File inventory

New application files:

- `src/app/kiosk/page.tsx`
- `src/components/kiosk/KioskExperience.tsx`
- `src/components/kiosk/KioskDialog.tsx`
- `src/components/kiosk/kiosk.module.css`
- `src/app/api/kiosk/{catalog,session,order,payment,maintenance}/route.ts`
- `src/lib/kiosk/{contracts,payment,server}.ts`
- `src/middleware.ts`
- `MIGRATION_SELFORDER_KIOSK.sql`

Modified shared application files:

- `src/app/api/auth/login/route.ts`: verifies the Supabase access token.
- `src/contexts/AuthContext.tsx`: sends that token for each JWT exchange.
- `src/lib/auth.ts`: removes public fallback signing secret.
- `src/app/api/payment/notification/route.ts`: atomic KIOSK settlement branch.
- `src/app/api/payment/cash/route.ts`: prevents competing KIOSK cash payment.

Setup, tests and documentation:

- `.env.kiosk.example`, `docs/KIOSK.md`, `docs/KIOSK_AUDIT.md`, this report.
- `tests/kiosk/{auth,contracts,database,session}.test.mjs` and `tests/kiosk/browser/flow.spec.ts`.
- `playwright.kiosk.config.ts`, `scripts/build-kiosk-test.mjs`.
- Modified `package.json`/`package-lock.json` for dev-only Playwright and PGlite,
  and repeatable test/build commands.
- Modified `next.config.js`, `.gitignore`, `tsconfig.json` for isolated build output.

Next steps are the migration/environment/domain/scheduler steps documented in
[KIOSK.md](KIOSK.md), followed by a real merchant sandbox acceptance test. The
implementation does not claim `kiosk.kographh.web.id` is already deployed or live.
