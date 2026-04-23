# Privacy and Telemetry

## Product promise

Authos is a browser-first developer tools website. The PostgreSQL Migration
Safety Checker is intentionally designed so migration SQL can be pasted,
uploaded, analyzed, redacted, exported, and optionally saved locally without
being uploaded to Authos.

Telemetry must preserve that promise.

## Telemetry defaults

- Production sends nothing unless both `NEXT_PUBLIC_ANALYTICS_VENDOR` and
  `NEXT_PUBLIC_ANALYTICS_KEY` are configured.
- Development logs sanitized events only.
- Development also exposes an in-product `Analytics debug` panel that shows the
  exact sanitized payloads emitted by the adapter.
- The runtime sanitizer strips dangerous keys and projects every event into a
  smaller allowlisted payload shape before anything is logged or sent.

## Exact event names

- `tool_page_opened`
- `sample_loaded`
- `analysis_completed`
- `analysis_failed`
- `report_exported`
- `local_save_saved`
- `local_save_opened`
- `redaction_mode_enabled`
- `settings_link_copied`

## Allowed fields

Only these fields may appear in emitted payloads:

- `toolId`
- `timestamp`
- `statementCountBucket`
  Values: `0`, `1`, `2-5`, `6-20`, `21+`
- `inputSizeBucket`
  Values: `empty`, `small`, `medium`, `large`, `huge`
- `findingCountBucket`
  Values: `0`, `1`, `2-5`, `6-20`, `21+`
- `severityCounts`
- `categoriesPresent`
- `postgresVersion`
- `frameworkPreset`
- `tableSizeProfile`
- `parserMode`
  Values: `parser`, `fallback`, `error`
- `analysisDurationBucket`
  Values: `<100ms`, `100-499ms`, `500-1999ms`, `2000-4999ms`, `5000ms+`
- `exportActionType`
  Values: `copy-markdown`, `download-markdown`, `download-html`,
  `download-json`, `print`
- `redactionModeEnabled`
- `sampleUsed`

## Forbidden fields

Telemetry must never contain:

- Raw SQL
- Uploaded file content
- Uploaded filename
- Table names
- Column names
- Constraint names
- Index names
- Secret previews
- Report text
- User clipboard content
- Full error stacks containing SQL
- Statement previews or report snippets
- Object names from findings or statements

## Runtime sanitizer behavior

The adapter drops obvious dangerous keys such as:

- `sql`
- `rawSql`
- `normalizedSql`
- `statementText`
- `statementPreview`
- `snippet`
- `preview`
- `sourceFilename`
- `filename`
- `uploadedFilename`
- `fileContent`
- `tableName`
- `columnName`
- `constraintName`
- `indexName`
- `objectName`
- `secretPreview`
- `reportText`
- `clipboardText`
- `stack`
- `errorStack`

After dangerous keys are removed, each event is projected into an allowlisted
schema so unexpected extra fields are discarded too.

## Bucket thresholds

### Statement and finding count buckets

- `0`
- `1`
- `2-5`
- `6-20`
- `21+`

### Input size bucket thresholds

Measured in SQL character count before emission:

- `empty`: `0`
- `small`: `1-500`
- `medium`: `501-3000`
- `large`: `3001-12000`
- `huge`: `12001+`

### Analysis duration bucket thresholds

- `<100ms`
- `100-499ms`
- `500-1999ms`
- `2000-4999ms`
- `5000ms+`

## Vendor hook

The adapter currently supports an optional browser hook vendor:

- `NEXT_PUBLIC_ANALYTICS_VENDOR=window-hook`
- `NEXT_PUBLIC_ANALYTICS_KEY=<public key>`

When configured, the adapter will call:

- `window.__AUTHOS_ANALYTICS__?.track(eventName, sanitizedPayload)`

If the env vars are missing, production remains a no-op.

## How to verify no SQL is sent

1. Run the app in development with `pnpm dev`.
2. Open the PostgreSQL Migration Safety Checker.
3. Paste migration SQL that includes recognizable schema names or fake secrets.
4. Trigger page open, sample load, analysis, export, local save, redaction mode,
   and settings-link actions.
5. Expand the in-product `Analytics debug` panel.
6. Confirm the payloads contain only buckets, settings, counts, booleans, and
   event metadata.
7. Open the browser console and confirm the development logs match the
   sanitized payloads in the panel.
8. Search the emitted payloads for pasted SQL, table names, filenames, secrets,
   snippets, or report text. None should appear.

## Guardrails for future changes

- Never pass raw SQL into the analytics adapter, even if the sanitizer would
  remove it later.
- Never log thrown error stacks from analysis failures if they might contain SQL.
- Keep telemetry fields coarse and product-oriented.
- Update this document whenever a new analytics event or field is introduced.
