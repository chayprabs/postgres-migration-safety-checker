# Authos Architecture

## Purpose

Authos is a multi-tool website for developer workflows that benefit from strong
privacy boundaries and explicit product contracts. The current app is still
small, but the structure is designed so additional tools can be added without
turning the codebase into a single pile of shared strings and one-off logic.

## Current layers

### App routes

- `src/app/*` contains public routes, page metadata, and layout composition.
- Routes should stay thin. They assemble product config, feature content, and
  generic UI rather than owning business logic directly.

### Product config

- `src/config/tools.ts` is the source of truth for the tool registry.
- Tool cards, directory pages, future search/filter UIs, and route metadata
  should read from this registry instead of duplicating product copy.

### Shared site code

- `src/components/*` contains generic UI primitives and site-level components.
- `src/lib/site.ts` contains shared site config such as navigation and product
  name/description.

### Feature modules

- `src/features/<feature>` contains feature-specific code.
- The PostgreSQL checker lives under `src/features/postgres-migration-checker`.
- Feature folders can expose types, constants, pure analyzer functions, browser
  worker adapters, and UI content specific to that tool.

## Required conventions

- Feature code lives under `src/features/<feature>`.
- Generic UI lives under `src/components`.
- Analyzer functions are pure and unit-testable.
- Browser-only code is isolated and does not run during SSR.
- Large analysis should eventually run in a Web Worker.
- Raw user SQL must never be sent to analytics or logs.

## Tool registry contract

Each tool entry in `src/config/tools.ts` should define:

- `id`
- `name`
- `slug`
- `shortDescription`
- `longDescription`
- `category`
- `status`
- `href`
- `primaryKeywords`
- `relatedTools`
- `privacyMode`
- `localOnly`
- `iconName`

This registry is intended to support:

- the home page
- the tools directory
- per-tool route metadata
- future navigation/search/filter features
- future sitemap or feed generation

## PostgreSQL checker module layout

The first tool is organized like this:

- `src/features/postgres-migration-checker/types.ts`
- `src/features/postgres-migration-checker/constants/*`
- `src/features/postgres-migration-checker/content.ts`
- `src/features/postgres-migration-checker/index.ts`

The design intent is:

- `types.ts` holds stable analyzer contracts.
- `constants/*` holds reference data and rule identifiers.
- `content.ts` holds feature-specific UI copy that should not live in generic
  site config.
- future parser/analyzer code should live beside these files, not in page
  components.

## Browser and SSR boundaries

The app uses the App Router, so code can execute on the server during rendering.
That means anything touching browser-only APIs should stay in explicit client
components or future worker adapters.

Rules:

- Keep analyzer core logic framework-agnostic and pure.
- Treat browser-specific APIs such as `window`, `Worker`, or file handles as
  adapters around the analyzer, not part of the analyzer itself.
- Avoid importing browser-only code into server components.

## Future analysis execution model

The expected long-term flow for the PostgreSQL checker is:

1. Parse pasted SQL in the browser.
2. Normalize it into `MigrationStatement[]`.
3. Apply `AnalyzerRule[]` through pure functions.
4. Return an `AnalysisResult`.
5. Move heavy parsing and rule evaluation into a Web Worker once the workload is
   large enough.

## How to add another tool

1. Add a new tool entry to `src/config/tools.ts`.
2. Create `src/features/<tool-name>` for types, constants, and logic.
3. Add the route under `src/app/tools/<slug>/page.tsx`.
4. Keep generic UI in `src/components`; only add feature UI inside the feature
   module when it is not reusable.
5. Document privacy and telemetry expectations if the new tool handles sensitive
   input.
