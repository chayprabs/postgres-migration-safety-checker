# Browser extension

The MV3 extension under `apps/browser-extension` analyzes SQL migration files on GitHub (and GitLab blob URLs) locally in the page.

## Build

```bash
pnpm install
pnpm --filter @pg-migration-checker/browser-extension build
```

## Load unpacked (Chrome)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Choose **Load unpacked**
4. Select `apps/browser-extension` (the folder containing `manifest.json`)

## Usage

Open a `.sql` blob page on GitHub. Use the floating **Analyze migration** panel. Results stay in the browser; the **Open checker** link only shares review settings (not SQL).

## Publish

Package `dist/` and `manifest.json` for Chrome Web Store submission after signing up for a developer account.
