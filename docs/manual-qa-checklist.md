# Manual QA Checklist

## Browsers

- [ ] Verify the PostgreSQL Migration Safety Checker in desktop Chrome.
- [ ] Verify the PostgreSQL Migration Safety Checker in desktop Firefox.
- [ ] Verify the PostgreSQL Migration Safety Checker in desktop Safari where available.

## Core Workspace

- [ ] Confirm the page header, local-first privacy messaging, and SQL editor load correctly.
- [ ] Load each major example type and confirm findings, risk score, and safe rewrites render.
- [ ] Upload a local `.sql` file and confirm the editor loads it without network calls.
- [ ] Confirm the parser fallback notice appears for malformed or partially unsupported SQL.
- [ ] Paste invalid SQL and confirm the tool still provides a safe fallback path instead of crashing.
- [ ] Paste a very large SQL input and confirm the page remains responsive enough to review.

## Settings And Privacy

- [ ] Switch PostgreSQL versions and verify version-specific notes and findings update appropriately.
- [ ] Switch framework presets and verify framework-specific transaction guidance updates.
- [ ] Toggle redaction mode and confirm previews and exports mask likely secrets while the editor remains unchanged.
- [ ] Save a local analysis, reopen it, and confirm the browser-only privacy copy matches the observed behavior.
- [ ] Copy a settings link after pasting unique SQL and confirm the URL does not contain raw SQL or secrets.
- [ ] Confirm local history remains opt-in and that raw SQL is not auto-saved.

## Reports And Exports

- [ ] Copy the Markdown report and confirm the success state appears.
- [ ] Download Markdown, HTML, and JSON reports and confirm the files open successfully.
- [ ] Print the report and confirm the printable view opens correctly.

## Accessibility And Interaction

- [ ] Verify keyboard shortcuts such as analyze, command menu, findings search, and copy report.
- [ ] Navigate the findings list and detail view with the keyboard only.
- [ ] Confirm focus states are visible across controls, dialogs, and tabs.

## Visual Coverage

- [ ] Verify the checker in a mobile viewport, including the fixed action bar and results tabs.
- [ ] Verify light mode.
- [ ] Verify dark mode, including editor contrast and status messages.
