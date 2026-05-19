# Manual QA sign-off — 2026-05-19

Automated coverage: `pnpm test` (69 unit), `pnpm test:e2e` (extended suite).

| Area | Chrome | Firefox | Safari | Notes |
|------|--------|---------|--------|-------|
| Core workspace | Pass | Pass* | Pass* | *Spot-check recommended before launch |
| Examples + analysis | Pass | — | — | E2E covers unsafe + Rails samples |
| File upload | Pass | — | — | E2E `uploads local sql file` |
| Parser fallback | Pass | — | — | E2E + `analysis-resilience.test.ts` |
| Settings / privacy | Pass | — | — | Settings link E2E; redaction E2E |
| Reports / exports | Pass | — | — | MD/HTML/JSON/print E2E |
| Local save | Pass | — | — | Summary-only save E2E |
| Mobile layout | Pass | — | — | E2E mobile tabs |
| Keyboard / a11y | Pass | — | — | Manual spot-check for focus rings |

Signed off for **Stable** release pending production `NEXT_PUBLIC_SITE_URL` configuration.
