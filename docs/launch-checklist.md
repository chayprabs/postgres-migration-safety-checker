# Launch Checklist

## Environment and metadata

- Set `NEXT_PUBLIC_SITE_URL` to the real production origin.
- Confirm canonical metadata, Open Graph metadata, `robots.txt`, and
  `sitemap.xml` all use the production URL.

## Verification commands

- Run `pnpm lint`
- Run `pnpm typecheck`
- Run `pnpm test`
- Run `pnpm build`
- Run `pnpm test:e2e`
- Run `pnpm exec playwright install chromium` first if Playwright browsers are
  missing locally.

## Manual product checks

- Manually test the example workflows on the PostgreSQL checker page.
- Confirm a user can paste SQL, upload a `.sql` file, and run analysis without
  login.
- Confirm the large-input warnings and manual confirmation states appear at the
  documented thresholds.
- Confirm parser fallback still returns helpful findings on malformed SQL.
- Confirm secret detection and redaction mode work.
- Confirm local save requires explicit confirmation before storing SQL.
- Confirm reports omit SQL snippets by default.
- Confirm there is no raw SQL in analytics payloads, URLs, or copied settings
  links.
- Confirm the privacy page is linked from the main navigation and footer.
- Confirm the docs pages link back to the tool and to related docs.

## Cross-device checks

- Test mobile layouts and the mobile action bar.
- Test dark mode.
- Test keyboard shortcuts and focus behavior.

## Search and discovery

- Test `robots.txt`
- Test `sitemap.xml`
- Confirm the PostgreSQL checker page and docs pages render crawlable content.
- Submit the production sitemap to Google Search Console after launch.

## Deployment

- Deploy to Vercel or your chosen Next.js hosting platform.
- Smoke-test the production deployment after release.

## Launch distribution

- Create launch posts for the product and the PostgreSQL checker.
- Share the supporting docs pages alongside the tool launch.
