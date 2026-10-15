# Restaurant menu and advertising

## Setup

1. Run `MIGRATION_RESTAURANT_ADS.sql` in the Supabase SQL Editor. It is repeatable and creates the store-scoped `restaurant_ads` table, index, RLS, and service-role permissions.
2. As owner or the assigned branch admin, open **Dashboard > Iklan & Penawaran** (`/dashboard/ads`).
3. Select a branch and create an ad. Supply a title, optional description/image/CTA, display order, and active status. New ads default to inactive.
4. Images may use an HTTPS URL or the existing upload flow (`menu-images` public bucket, JPG/PNG/WebP up to 5 MB). A 16:9 image is recommended. No demo campaign is seeded into production.

## Customer behavior

- The menu displays a single ad dialog containing active ads for the selected branch. Ads are ordered by display order, then creation time.
- The content transitions every five seconds. Controls allow pause/resume, previous/next, Escape, and immediate close. Rotation pauses while the page is hidden or another local menu dialog blocks it. Reduced motion removes slide animation.
- Checking **Jangan tampilkan iklan ini lagi** saves `store_id:id` in `selforder_hidden_ads_v1` in local storage. The current slide remains readable until the next transition or close. Checked ads are skipped afterward; if all are checked the dialog closes on the next timer tick.
- Closing without checking does not permanently dismiss the ads. They can appear on another menu visit. New ad IDs remain eligible. Editing an existing ad respects its existing opt-out; create a new ad for a new campaign.
- Preferences apply to that browser, not an account or every device. Clearing browser storage resets them. If storage is blocked, a message explains that the choice only applies while the page is open.
- Notifications and install prompts wait until the advertising flow is finished. Ads do not load on search, cart, profile, or checkout. Failed or missing ads never prevent menu ordering.

## Menu design

The restaurant presentation uses warm paper/terracotta/charcoal tones, a display-serif headline, real catalog photography, a featured dish, horizontal restaurant selections, category navigation, and explicit add-to-cart buttons. Missing photography uses an illustrated CSS plate or utensil icon. No fabricated ratings, discounts, or preparation times are shown. Pickup time is selected in the dedicated cart page.

## Access and verification

Anonymous visitors receive only active ads from an active branch. Owner/admin management requires JWT authentication and store access. Updates are scoped by both ad ID and store ID. Direct anon/authenticated database access is revoked; the service-role API enforces these checks. URLs reject executable schemes, protocol-relative URLs, credentials, and malformed values.

Local verification: production build and TypeScript passed, 8 ads contract/database tests passed, and 11 Chrome browser tests passed. The database test runs the migration twice in temporary PGlite and checks constraints and role permissions. Browser tests use fixture catalog/ads, cover 320/390/768/1440px, and test five-second rotation, opt-out persistence, new ads, pause/close, short dark screens, storage/API failures, and the existing navigation/cart flow. Screenshots are in `artifacts/ui/`.

Run `npm run test:ads` and `npm run test:ui` (the latter needs the isolated `.next-ui` production build; see `UI_REFRESH.md`). Lint still reports image/font/hook warnings. Live Supabase migration, image upload, real ads publication, iPhone/Safari, and deployment have not been verified in this change.
