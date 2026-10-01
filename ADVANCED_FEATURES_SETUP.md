# Advanced SelfOrder features

Run `MIGRATION_SELFORDER_ADVANCED.sql` in the Supabase SQL editor after the existing migrations. The migration adds menu metadata/schedules, recipes and ingredient stock, reservations, split bills, audit logs, and Telegram inbox tables.

## Payments and reservations

Reservation DP uses the existing Midtrans Snap credentials and notification URL `/api/payment/notification`; configure that same notification URL in Midtrans. Set the per-person DP on `stores.reservation_deposit_per_guest` (default is Rp20,000). Supabase Auth Phone provider/SMS delivery must be enabled for OTP. The booking flow assigns an available active table and holds it through the reservation window; the private URL is a high-entropy bearer link and should only be shared with the booking customer. Public table QR links are diverted to reservation information when that table has an upcoming booking.

## Telegram multi-branch inbox

Set server-only `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` in the deployment environment. The owner can activate and inspect the webhook from Dashboard > Chat Telegram; the server registers `https://YOUR_HOST/api/integrations/telegram/webhook` and passes the same secret as Telegram's `secret_token`. Set `TELEGRAM_WEBHOOK_URL` only to override the domain detected from the dashboard request. `/start` lists active branches with their address, then topic buttons route customer messages to the branch inbox in Dashboard → Chat Telegram. Replies are sent by the one shared bot; staff can only read/reply to their assigned branch. The owner activity log includes bot commands, branch/topic selections, customer messages, staff replies, and webhook activation. Telegram's native inline-keyboard colors are controlled by each user's Telegram theme, not the bot API; the connected dashboard uses the navy SelfOrder theme.

## Thermal ESC/POS printer

The kitchen page can print new orders automatically through a small local bridge. This bridge targets ESC/POS network printers reachable on the local LAN (TCP, normally port 9100). On the computer attached to/reaching the printer, set `ESC_POS_PRINTER_HOST` to its LAN IP and optionally `ESC_POS_PRINTER_PORT=9100`. Set `SELFORDER_ORIGIN` to the exact dashboard origin (for example `https://your-deployment.example`), then run `npm run print:bridge`. Keep the process running while the kitchen dashboard is open. The browser sends a ticket to `http://127.0.0.1:9123/print`; the bridge binds only to loopback and forwards raw ESC/POS bytes to the configured printer. USB-only printers need a local USB-to-network print service or a QZ Tray/driver adapter; the browser itself cannot silently write to arbitrary USB devices.

All reporting and inventory APIs are scoped to the staff member's assigned branch. Recipes must be configured before stock can be consumed. Orders with a recipe reserve ingredients atomically; failed/unpaid-cancelled orders release that reservation.
