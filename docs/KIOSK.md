# KIOSK Self-Order

KIOSK runs inside this Next.js application at `/kiosk`. The exact host
`kiosk.kographh.web.id` rewrites `/` to `/kiosk`; existing routes, APIs, assets,
and the main domain retain their existing behavior. There is no second project,
repository, database, or deployment.

## Setup order

1. Apply existing schema and migrations through `MIGRATION_SELFORDER_OPERATIONS.sql`
   if not already applied. Apply **`MIGRATION_SELFORDER_KIOSK.sql` before deploying
   this application version**. The shared payment routes now read KIOSK columns.
   Run migrations using Supabase SQL Editor with an authorized database role.
2. Copy the variable names in `.env.kiosk.example` to the existing local/Vercel
   configuration; replace every placeholder. Obtain branch UUIDs from the existing
   `stores` table. Example structure (not usable production data):

   ```env
   KIOSK_HOSTNAME=kiosk.kographh.web.id
   KIOSK_DEFAULT_STATION=counter-01
   KIOSK_STATIONS={"counter-01":{"storeId":"REAL_BRANCH_UUID","name":"Konter utama"},"counter-02":{"storeId":"ANOTHER_REAL_BRANCH_UUID","name":"Konter lantai dua"}}
   KIOSK_SESSION_SECRET=<random-private-secret-at-least-32-characters>
   CRON_SECRET=<different-random-private-secret>
   ```

   Open `/kiosk?station=counter-02` for another configured station. With no query,
   the default station is used. An unknown station or missing configuration fails
   closed instead of choosing the first branch. Station names/IDs are routing
   identifiers, not device credentials. Lock the installed restaurant browser to
   its intended URL through the operating system's kiosk/assigned-access mode.
   The API ignores client-supplied branch IDs and signs the selected server mapping
   into a 30-minute HttpOnly cookie. Use one active browser tab per terminal.
3. Keep existing Supabase credentials and Midtrans keys. Set both
   `MIDTRANS_IS_PRODUCTION` and `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` to the same
   environment. Test sandbox first. QRIS/GoPay/ShopeePay availability also depends
   on the merchant account. The KIOSK deliberately exposes digital checkout only;
   cash/POS for existing non-KIOSK orders remains available.
4. Run `npm run dev`; open `http://localhost:3000/kiosk`. Use published categories,
   visible menu items, valid options/stock, store hours, and active tables from
   the existing management pages. No production fixture menu is installed.

## Vercel, DNS and SSL

1. In **the existing Vercel project**, open Settings → Domains and add
   `kiosk.kographh.web.id` to the same production deployment. Configure it as a
   domain serving the project, not a redirect to the main site.
2. At the authoritative DNS provider for `kographh.web.id`, create a CNAME with
   name `kiosk` and the **exact target displayed by that Vercel project's domain
   settings**. Do not copy an arbitrary IP or assume an older generic CNAME.
   Remove conflicting records for this name if present; preserve other records.
3. Complete ownership verification if requested. Wait until Vercel reports valid
   configuration and its automatically provisioned TLS certificate is ready.
   If DNS is proxied, initially use DNS-only while validating the Vercel domain.
4. Deploy the existing application with the variables above. Check `/` and
   `/kiosk` on the KIOSK hostname and confirm the main domain still redirects to
   the existing menu. Query strings are preserved by the rewrite.
5. Keep the merchant webhook pointing to the existing public HTTPS endpoint
   `/api/payment/notification` on this deployment. No session cookie is required
   by the webhook; a valid Midtrans signature is required for KIOSK settlement.
   Check redirects/allowlists in the Midtrans dashboard if they are configured.

A wildcard is **not required** for this single subdomain. For future wildcard
hosts, Vercel requires its nameserver configuration for wildcard certificate
verification; merely adding a wildcard DNS record does not provision a Vercel
domain or add application routing. This implementation matches one configured
hostname, not arbitrary subdomains.

References verified during implementation:
- [Vercel custom domain setup](https://vercel.com/docs/domains/set-up-custom-domain)
- [Vercel adding domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Next.js 15 middleware](https://nextjs.org/docs/15/pages/api-reference/file-conventions/middleware)
- [Midtrans Snap integration](https://docs.midtrans.com/docs/snap-snap-integration-guide)

## Transaction lifecycle

- Welcome → Menu → Cart → Checkout → Payment → Confirmation. Both dine-in and
  takeaway are supported. Takeaway maps to existing `order_type=pickup`, without
  a scheduled `pickup_at`, and includes an explicit KIOSK takeaway note.
- Categories, photos, descriptions, options, allergens, prices, stock, tax and
  service rates come from the existing branch records. Broken/missing images use
  a neutral fallback, never a fabricated product photo.
- The browser stores only an in-progress checkout payload/key in sessionStorage
  for recovery. No customer account, phone or email is requested. Cookie credentials
  are HttpOnly, Secure in production, SameSite=Strict, host-only, and scoped to
  `/api/kiosk`. Mutation requests require a same-origin `Origin` header.
- `create_kiosk_order` uses a per-session database advisory lock and unique session
  and request indexes. Same-key retries return the same order; a changed payload
  cannot create another order within that session. It calls existing
  `create_order_atomic` in the same transaction, preserving branch queue numbers,
  menu-option validation, stock reservations and ingredient triggers.
  Chosen option labels are copied from the authoritative snapshot into item notes
  for the existing kitchen screen and ESC/POS tickets, without modifying their UI.
  Table, reservation, category/schedule and policy checks happen before commit. A changed
  total or policy causes full rollback; the customer must review again.
- Snap initialization uses a database compare-and-set from `idle` to `creating`.
  Only one worker contacts Midtrans. Success saves the same token for reopening.
  The order UUID is the Midtrans order ID; no suffix-based duplicate attempt is
  generated. A timeout/ambiguous result remains `uncertain` (or `creating` if the
  worker was interrupted). It is **not automatically recreated**.
- Webhook and explicit status checks share `settle_kiosk_payment`: exact amount
  validation against rounded database total, locked atomic order/payment updates,
  repeat-event protection, and no reset from preparing/ready back to confirmed.
  Browser Snap callbacks only request server verification; they never mark paid.
- Cash confirmation for a KIOSK order is rejected. Database guards prevent staff
  routes from processing an unpaid KIOSK order or cancelling an issued payment
  while it is still pending. KIOSK records cannot be deleted through generic staff
  actions because their idempotency/payment history must survive retries. Refund
  callbacks still require a matching existing refund request; there is no customer
  refund-request UI on this shared terminal. Contact staff for reconciliation.
- Existing cashier/orders/kitchen pages read the same `orders`, `order_items`,
  `payments` and `store_id`. No duplicate queue or kitchen is created. The KIOSK
  polls its own order every five seconds. Existing kitchen realtime still requires
  the Supabase publication/settings that the original project uses.

## Timeout and reconciliation

Menu/cart/checkout idle timeout is two minutes; payment is ten minutes; confirmation
is one minute. A 30-second warning allows continuation. Reset closes Snap and clears
the checkout payload, cart and cookie. It does **not** cancel an issued provider
transaction. The UI asks the customer to retain the queue number and contact staff.

Schedule authenticated GET requests to `/api/kiosk/maintenance` every five minutes
using `Authorization: Bearer <CRON_SECRET>`. Use your existing scheduler, or add a
Vercel Cron entry to the same project if its plan supports that frequency:

```json
{"crons":[{"path":"/api/kiosk/maintenance","schedule":"*/5 * * * *"}]}
```

Merge this with any existing deployment config. Vercel sends the configured cron
secret. No schedule is silently deployed by this change. The handler expires drafts
older than 30 minutes **only if no Snap call was claimed**, releasing stock via
existing triggers. It reconciles up to 20 issued payments per run and rotates the
batch. Provider pending/unknown responses do not release stock.

For an uncertain payment, staff should find the same UUID in Midtrans and verify
its amount and final status. Do not reset `kiosk_payment_state`, switch to cash or
create another provider reference before reconciliation. Transactions that cannot
be found or late settlements after stock release require staff review; the handler
returns `needsReview`. A crashed creation attempt may require a verified provider
cancellation/manual repair. This conservative tradeoff avoids duplicate charging.

## Verification

Commands:

```text
npm run typecheck
npm run lint
npm run build
npm run test:kiosk
npm run build:kiosk:test
npm run test:kiosk:browser
```

Database tests execute the real schema plus existing and KIOSK migrations in
in-memory PostgreSQL/PGlite. Only Supabase-owned auth/storage namespaces are
stubbed. PGlite serializes statements: retries/claim invariants are checked, but
multi-connection PostgreSQL deadlock/load testing still belongs in staging.

Browser tests run a production build in `.next-kiosk-test`, separate from the
development server's `.next`, with an isolated Chrome profile. Run
`npm run build:kiosk:test` before the browser suite. Override
`KIOSK_TEST_BROWSER=msedge` if desired. UI flows mock only backend/provider responses;
they never contact the live database or charge a merchant account. HTTP checks for
hostname routing, cookies, missing CSRF headers and missing authentication exercise
real route handlers. Screenshots/traces are under ignored `test-results/`.

Before restaurant rollout, apply the migration to staging, configure a real station,
run a real Midtrans sandbox payment, check the cashier/kitchen queue and inventory,
verify duplicate/replayed webhook behavior, test terminal refresh/network loss and
the maintenance scheduler, then verify DNS/TLS on the deployed hostname. Production
database, merchant settlement, real touch hardware, and public DNS/TLS are not
established by local fixture tests.
