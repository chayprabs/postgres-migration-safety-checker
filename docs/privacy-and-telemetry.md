# Privacy and Telemetry

## Product promise

Authos is a browser-first developer tools website. The first tool,
`/tools/postgres-migration-safety-checker`, is intentionally scoped so that a
developer can paste migration SQL and analyze it locally in the browser.

The privacy promise for the first tool is:

- no login required
- no database connection required
- no pasted SQL sent to a backend
- no raw SQL sent to analytics
- no raw SQL written to logs

## Current baseline

There is no implemented analytics pipeline in this repository today.

The baseline still needs guardrails because future product telemetry could be
added later. The absence of telemetry code today does not remove the need for a
written policy.

## What is allowed

Safe product telemetry, if added later, should only capture coarse product
signals such as:

- page route viewed
- tool opened
- local analysis started
- local analysis finished
- count of findings by severity or category
- anonymized app version and browser information

These events must not include raw SQL, schema names, table names, column names,
index names, connection strings, or migration contents unless the privacy model
changes and is explicitly documented.

## What is never allowed

- raw pasted SQL
- normalized SQL text
- statement-by-statement SQL payloads
- migration files
- database credentials
- connection URIs
- internal schema or object names in logs or analytics payloads

## Logging rules

- Do not `console.log` raw user SQL in development helpers.
- Do not send raw SQL to server actions, API routes, or external telemetry
  services.
- Do not include raw SQL in error messages that could be captured by monitoring
  tools.
- If debugging requires inspection, use synthetic fixtures committed to the repo
  instead of user-provided input.

## SSR and browser-local analysis

Because the app uses Next.js App Router, some code can execute during server
rendering. Browser-local analysis must stay isolated from SSR code paths.

Guidelines:

- analyzer core should be pure and environment-agnostic
- browser-only execution should live in client components or future workers
- raw SQL should stay in browser memory for the local-only tool

## Environment flags

`.env.example` documents reserved flags for:

- site URL
- future privacy-safe product telemetry enablement
- future worker enablement for heavy client-side analysis

If telemetry is ever implemented, keep it disabled by default in local
development until the event schema is reviewed against this document.
