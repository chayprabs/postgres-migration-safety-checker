export const POSTGRES_ANALYSIS_LIMITATIONS = [
  "Actual row count",
  "Existing indexes or constraints",
  "Real lock wait conditions",
  "Replication lag",
  "Application deploy order",
  "Database extensions and exact function volatility",
] as const;
