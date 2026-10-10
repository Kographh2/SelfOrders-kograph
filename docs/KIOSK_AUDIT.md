# Codebase audit and implementation decisions

Audit date: 2026-10-10. Initial Git worktree was clean. The project is an existing
Next.js 15.5 App Router app with React 19, Tailwind, Framer Motion, Supabase service
role APIs, custom JWT sessions and `midtrans-client`. There is no Prisma folder in
this checkout despite the original AGENTS overview mentioning one.

## Architecture map

| Area | Existing implementation and KIOSK decision |
| --- | --- |
| Routing | `src/app`, root redirects to menu, dashboard layout checks staff. Add `/kiosk` and an exact-host middleware rewrite only. |
| Customer menu | `MenuPageContent`, categories/items APIs, schedule helpers, option groups and cart. Reuse data contracts and helpers; separate touchscreen composition preserves existing pages. |
| Branches | `stores`, store hours/timezone, staff `store_id`, `hasStoreAccess`. KIOSK station mapping is server-owned; no automatic first-store fallback. |
| Orders | `/api/orders` calls `create_order_atomic`, then applies policies/promos/rewards. KIOSK wraps the atomic function instead of invoking that multi-step public checkout. |
| Stock | FEATURES migration locks/decrements menu stock; ADVANCED order-item triggers reserve ingredients. KIOSK uses the same transaction/rollback and release triggers. |
| Queue/kitchen | `get_next_order_number`, existing order tables and branch realtime subscription. No parallel queue. Confirmed KIOSK order requires server-verified paid status. |
| Cashier | POS scans cash codes and requires shifts; dashboard order endpoints use staff/store authorization. KIOSK is digital-only and cannot change an issued payment to cash. |
| Payments | Shared Snap server helper balances item totals, browser helper loads SDK, webhook/status routes reconcile payments. KIOSK uses these SDK helpers plus a durable creation lock and shared atomic settlement RPC. |
| Authentication | Supabase browser session exchanged for custom JWT in `/api/auth/login`; staff roles come from DB. Fixed missing proof of session in this exchange. KIOSK uses a separate signed guest cookie. |
| Policies | Published branch/global documents and versioned acceptances. KIOSK displays documents in a focus-trapped dialog and records matching versions inside order transaction. |
| Other modules | Wallet/top-up/withdrawals, rewards/promos, reservations/Telegram Gateway, split bills, reports/forecast, inventory/purchasing/food cost, attendance, refunds, customer care, audit logs, printer bridge, PWA/push. Existing UI and business flows retained. |

The review inventoried all application source files and route/table dependencies,
and examined transaction, authentication, stock, branch, menu and dashboard paths
in depth. This is not a claim that every legacy module has exhaustive behavioral
or penetration-test coverage.

## Findings addressed

1. **UID-only JWT issuance:** `/api/auth/login` previously looked up an arbitrary
   UID through service role, without validating an access token owned by the caller.
   It now requires `Authorization: Bearer <Supabase access token>` and matching
   `auth.getUser(token).id`. All AuthContext exchange call sites pass the actual
   access token, including refresh/anonymous/signup paths. Authentication now fails
   closed if `JWT_SECRET` is absent rather than signing with a public fallback.
   No login UI was changed. Rotate the existing JWT secret at rollout if previously
   issued sessions cannot be trusted; that intentionally requires users to log in again.
2. **Missing durable checkout idempotency:** existing public order creation does
   not deduplicate network retries. New KIOSK RPC has advisory/unique locks and a
   payload hash. It does not alter legacy checkout behavior.
3. **Concurrent Snap initialization:** reusing an already saved token alone does
   not protect two simultaneous initial requests. KIOSK claims initialization in
   the DB before contacting Midtrans and never retries an ambiguous provider call.
4. **Split order/payment updates and late callbacks:** KIOSK settlement is a single
   locked RPC with amount validation and forward-safe state handling. Existing
   unrelated webhook namespaces retain their behavior.
5. **Shared dashboard actions:** generic order/cash routes could otherwise process
   an unpaid KIOSK order or allow competing cash/Snap payment. KIOSK-specific guards
   and cash rejection close those paths without changing other order types.
6. **Shared-device privacy:** KIOSK does not bind orders to the existing account or
   persistent customer session. It has separate HttpOnly credentials and explicit
   idle/reset behavior with no customer contact data collection.

## Remaining audit limits

- Existing pages emit lint warnings about native images, custom fonts and hook
  dependencies. These are warnings, not new KIOSK failures, and their UI was not
  rewritten as part of this feature.
- The original legacy order endpoint, wallet, split/refund and reservation flows
  are not converted wholesale to the new KIOSK transaction wrapper.
- Database changes are tested against the checked-in schema/migrations, not an
  inspected live Supabase schema. Existing deployment drift must be checked before
  applying migrations. Do not replace deployed schema with a fresh `schema.sql`.
- Existing RLS and direct Supabase client access outside the KIOSK service-role
  path require a separate full security review. Local endpoint tests do not certify
  the entire application's security posture.
- Dependency installation reported 13 npm advisories (3 moderate, 10 high). A
  forced/breaking dependency upgrade was not applied to unrelated modules. Review
  the dependency graph separately before production rollout.

See [KIOSK.md](KIOSK.md) for deployment ordering, station setup, reconciliation,
DNS/TLS, test commands, and the live acceptance checklist.
