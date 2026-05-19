export const POSTGRES_ANALYSIS_LIMITATIONS = [
  "Actual row count",
  "Existing indexes or constraints",
  "Real lock wait conditions",
  "Replication lag",
  "Application deploy order",
  "Database extensions and exact function volatility",
  "Optional schema paste only reflects CREATE TABLE text you provide (not live catalog state)",
  "Schema-aware findings use medium confidence when pasted DDL may be incomplete",
] as const;
