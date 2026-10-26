# Luujaaa.id public identity and content

## Apply the database update

Run the complete `MIGRATION_PUBLIC_CONTENT_20261026.sql` after the existing feature/security migrations. It requires the tables from `MIGRATION_SELFORDER_OPERATIONS.sql` and reports that prerequisite explicitly if missing. It adds service-role-only public settings, plus a seed ledger that protects owner edits and deleted FAQs when the migration is rerun.

The migration initially publishes three global documents (ordering terms, privacy, and cancellation/refund), eight FAQs, and configurable help introduction/contact instructions. Existing documents of each global type are preserved. Branch documents continue to override global documents. The text describes the implemented workflow without promising fixed refund deadlines, instant payment confirmation, or unimplemented offline ordering. Review it against actual branch practices and complete contact details before release.

Owners can edit **Dashboard → Kebijakan & FAQ → Global**. Document changes create versions; FAQs now support editing, ordering, draft/published status, and deletion. A branch admin can edit their branch, but cannot modify/delete global material. Public responses exclude drafts. Stored policy acceptances remain versioned.

## Public settings and Google

**Dashboard → Pengaturan → Publik & Google** is owner-only. It controls search title/description, canonical HTTPS origin, Google verification token, indexing permission, public business/contact details, help heading/introduction, and support instructions. Database writes must succeed before the UI confirms a save. Missing schema retains safe default branding, while indexing stays disabled.

After deployment:

1. Set the actual public HTTPS origin. The display name `Luujaaa.id` does not purchase, configure, or verify a domain.
2. Fill accurate public contact details and enable indexing when the site is ready.
3. Verify the domain in Google Search Console. The form accepts only the verification token for the HTML meta-tag method. DNS verification is done at the domain provider.
4. Submit `/sitemap.xml` and request indexing for `/menu`, `/help`, and `/about`.

The app supplies metadata, canonical URLs, Open Graph/Twitter descriptions, WebSite structured data, favicon, `robots.txt`, and a public-only sitemap. Sitemap/robots follow the saved setting and stay disabled in Vercel previews. Nonpublic routes and private-context queries receive `X-Robots-Tag: noindex, nofollow`; API/auth checks remain the actual access controls. No orders, account data, dashboard paths, or payment URLs are added to the sitemap. The help page renders published global content on the server, then resolves the selected branch in the browser.

Google controls crawling/indexing; implementation or sitemap submission does not guarantee immediate appearance. Official guidance: [request recrawling](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [crawling and indexing FAQ](https://developers.google.com/search/help/crawling-index-faq). No Google account, domain/DNS, or production database was changed by this implementation.

## App assets and UI

`scripts/build-app-icons.mjs` uses the supplied `mascot/icon/Winking Cow L Mascot Icon.png` directly to generate PNG app icons, Apple Touch icon, favicons, legacy SVG wrappers, and a separate opaque/padded maskable icon. `public/manifest.json` uses **Luujaaa.id** and retains the `/menu` installation identity. Notification/install/account labels use the new name; internal storage keys, JWT issuer, and recovery protocol remain compatible.

`src/app/public-ui.css` and the navy Tailwind palette align help, payment return, payment sheet, form fields, and legacy dark-mode surfaces. Help uses readable cards and plain-text policies, without the previous blue gradient. Payment return shows a neutral processing spinner rather than an unverified success icon.

Loading shows only the looping transparent wordmark visually. Actual request-stage messages remain available to screen readers; the cow mascot no longer appears in loading. Offline Drained, closed-store Sleeping, search Confused, and server-confirmed kiosk Celebrating remain in their contextual placements.

## Main files

- Assets: `scripts/build-app-icons.mjs`, `public/manifest.json`, `public/icon-*.png`, `public/apple-touch-icon.png`, `public/favicon*`, existing public notification/identity labels.
- Configuration: `src/lib/public-site-config.ts`, `public-site.ts`, `src/app/api/public-site/route.ts`, `src/components/PublicSiteSettings.tsx`, dashboard settings.
- Discovery: root metadata/layout, menu metadata, `src/app/about/page.tsx`, `robots.ts`, `sitemap.ts`, and middleware noindex headers.
- Content: new SQL migration; `src/app/help/page.tsx`, `HelpContent.tsx`, dashboard policies, and policies API.
- UI: `src/app/public-ui.css`, `tailwind.config.js`, payment return/sheet, `MenuLoading.tsx`.
- Tests: `tests/security/public-site.test.mjs`, updated database regression suite, `tests/ui/public-pages.spec.ts`, and owner browser settings/FAQ coverage.

## Local validation

- Isolated production build (`scripts/build-kiosk-test.mjs`, 2048 MB heap): passed compilation, type checking, lint, and page generation. Existing image/font/hook lint warnings remain.
- Database/security: 15 database regression tests, 4 public-site/policies tests, and 11 API security tests passed. The new migration was applied in the local test database; reruns preserve edited settings/FAQ and deleted FAQ, and public writes are denied.
- Offline: 11 tests passed, including regenerated fallback/cache consistency.
- UI browser suite: 26 tests passed, including light/dark help and payment at 320 px, text contrast, icon/manifest/robots responses, loading wordmark, mascot states, and offline recovery.
- Kiosk/owner browser coverage: all 14 distinct scenarios passed across the full run and targeted rerun. The first run passed 12 existing scenarios; two new owner tests had locator failures. After correcting the selectors, all 5 settings tests passed, including saving public settings, rejecting failed saves, and editing an existing FAQ into a draft. No application change was needed for those locator failures.
- Whitespace validation: `git diff --check` passed.

Browser tests use local fixtures, not real payments or production services. Live migration, deployment, Google verification/indexing, physical installed-app icon refresh, and Safari/mobile hardware remain separate checks.
