# SelfOrder operations features (1–12)

Apply `MIGRATION_SELFORDER_OPERATIONS.sql` in the Supabase SQL Editor after the base schema and existing SelfOrder migrations. Take a database backup first and verify the SQL completes before deploying the application. Vercel builds do not apply Supabase migrations automatically. The migration is intended to be re-runnable, but test it against a staging project before production.

## Included

1. Suppliers, purchase orders, receiving with weighted-average ingredient cost, best-before date on received PO lines, and waste movements. Expiry dates are recorded per purchase-order line; existing stock is not yet tracked as separate lots and expiry does not automatically decrement stock.
2. Loyalty reward catalog, points redemption, single-use vouchers applied at checkout, and voucher finalization/refund on payment status changes.
3. Existing cashier shift opening/closing and cash reconciliation are retained; this feature pack does not create duplicate shift tables.
4. Customer refund requests, owner-only decisions, manual refund evidence for non-Snap payments, and Midtrans refund submission/webhook status handling. Midtrans must enable/support refunds for the merchant and payment method; do a sandbox test before enabling in production.
5. Existing customer reviews and tips are surfaced in the customer-care dashboard.
6. QR table requests for waiter, bill, utensils, water, and other service; staff can acknowledge/complete requests.
7. Sales forecast based on up to eight weeks of completed, paid orders. It is advisory and does not automatically purchase or prepare stock.
8. Staff shift schedules and attendance records.
9. Signed-in customer order history and reorder links; guest order tracking/reordering remains available through its existing waiting page.
10. Customer issue reports (late, missing/wrong item, payment, quality, other) with staff triage and resolution notes.
11. Versioned privacy, terms, cancellation/refund documents and FAQ editor/public help page. These are publishing tools/templates, not legal advice; have the actual wording reviewed for the business and jurisdiction.
12. Front-camera selfie captured without mirroring, server timestamp, and one GPS location sample at clock-in/out. GPS is not continuously tracked. Browser camera/location require HTTPS and staff consent. Selfies use a private Supabase Storage bucket and short-lived signed URLs.

## Dashboard

New pages are linked in the sidebar: Purchasing, HPP & Margin, Reward Loyalti, Refund, Layanan Pelanggan, Prediksi & Persiapan, Jadwal & Absensi, and Kebijakan & FAQ. The HPP calculation uses current recipe quantities and current ingredient unit costs, so it is a gross ingredient-cost estimate, not net profit; it excludes labor, packaging, tax, and overhead.

For attendance geofencing, an owner/admin must set the branch coordinates and radius under Jadwal & Absensi. Camera and GPS permissions are granted by each staff member's device/browser. If coordinates are unset, the system records the point-in-time coordinates but cannot calculate distance from the branch.

## Operational checks before production

- Apply the SQL migration and confirm the `attendance-selfies` bucket is private.
- Configure the existing Supabase service-role key only as a server secret; never expose it as a `NEXT_PUBLIC_*` variable.
- Publish reviewed privacy/terms documents before requiring consent at checkout.
- Configure Midtrans webhook URL to the existing payment notification endpoint and test full, partial, rejected, and manual refunds in sandbox.
- Create ingredient recipes and unit costs before relying on food-cost or forecast screens.
- Test branch scoping using owner, admin, cashier, customer, and anonymous checkout accounts.
