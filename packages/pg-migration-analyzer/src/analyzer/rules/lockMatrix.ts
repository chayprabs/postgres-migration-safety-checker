import type { LockInfo, LockLevel } from "../../types";
import { POSTGRES_DOCS } from "../docsLinks";

export type LockMatrixEntry = LockInfo;

export const LOCK_MATRIX: Record<LockLevel, LockMatrixEntry> = {
  "ACCESS SHARE": {
    level: "ACCESS SHARE",
    description:
      "Plain read lock acquired by SELECT. It is the lightest table lock and only conflicts with ACCESS EXCLUSIVE.",
    conflictsWith: ["ACCESS EXCLUSIVE"],
    commonCommands: ["SELECT", "Referenced reads on ordinary tables"],
    blocksReads: false,
    blocksWrites: false,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
  "ROW SHARE": {
    level: "ROW SHARE",
    description:
      "Row-locking read lock used by SELECT ... FOR UPDATE/SHARE. It signals intent to lock rows without blocking ordinary reads.",
    conflictsWith: ["EXCLUSIVE", "ACCESS EXCLUSIVE"],
    commonCommands: ["SELECT ... FOR UPDATE", "SELECT ... FOR SHARE"],
    blocksReads: false,
    blocksWrites: false,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
  "ROW EXCLUSIVE": {
    level: "ROW EXCLUSIVE",
    description:
      "Common write lock for row-changing statements. It allows concurrent writes of the same class but conflicts with stronger schema-oriented locks.",
    conflictsWith: [
      "SHARE",
      "SHARE ROW EXCLUSIVE",
      "EXCLUSIVE",
      "ACCESS EXCLUSIVE",
    ],
    commonCommands: ["INSERT", "UPDATE", "DELETE", "MERGE"],
    blocksReads: false,
    blocksWrites: false,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
  "SHARE UPDATE EXCLUSIVE": {
    level: "SHARE UPDATE EXCLUSIVE",
    description:
      "Schema-maintenance lock that protects a relation from overlapping DDL churn while still allowing many reads and writes.",
    conflictsWith: [
      "SHARE UPDATE EXCLUSIVE",
      "SHARE",
      "SHARE ROW EXCLUSIVE",
      "EXCLUSIVE",
      "ACCESS EXCLUSIVE",
    ],
    commonCommands: [
      "VACUUM",
      "ANALYZE",
      "CREATE INDEX CONCURRENTLY",
      "Selected ALTER TABLE variants",
    ],
    blocksReads: false,
    blocksWrites: false,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
  SHARE: {
    level: "SHARE",
    description:
      "Table lock that allows reads but blocks row-writing statements while the operation runs.",
    conflictsWith: [
      "ROW EXCLUSIVE",
      "SHARE UPDATE EXCLUSIVE",
      "SHARE ROW EXCLUSIVE",
      "EXCLUSIVE",
      "ACCESS EXCLUSIVE",
    ],
    commonCommands: ["CREATE INDEX without CONCURRENTLY"],
    blocksReads: false,
    blocksWrites: true,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
  "SHARE ROW EXCLUSIVE": {
    level: "SHARE ROW EXCLUSIVE",
    description:
      "Self-exclusive schema lock used by trigger creation and some ALTER TABLE forms. It blocks writes and overlapping stronger schema changes.",
    conflictsWith: [
      "ROW EXCLUSIVE",
      "SHARE UPDATE EXCLUSIVE",
      "SHARE",
      "SHARE ROW EXCLUSIVE",
      "EXCLUSIVE",
      "ACCESS EXCLUSIVE",
    ],
    commonCommands: ["CREATE TRIGGER", "Selected ALTER TABLE variants"],
    blocksReads: false,
    blocksWrites: true,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
  EXCLUSIVE: {
    level: "EXCLUSIVE",
    description:
      "Strong lock that still permits plain reads but blocks most other table access, including writers and row-locking readers.",
    conflictsWith: [
      "ROW SHARE",
      "ROW EXCLUSIVE",
      "SHARE UPDATE EXCLUSIVE",
      "SHARE",
      "SHARE ROW EXCLUSIVE",
      "EXCLUSIVE",
      "ACCESS EXCLUSIVE",
    ],
    commonCommands: ["REFRESH MATERIALIZED VIEW CONCURRENTLY"],
    blocksReads: false,
    blocksWrites: true,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
  "ACCESS EXCLUSIVE": {
    level: "ACCESS EXCLUSIVE",
    description:
      "The strongest table lock. It blocks both reads and writes and is the classic downtime-sensitive DDL lock.",
    conflictsWith: [
      "ACCESS SHARE",
      "ROW SHARE",
      "ROW EXCLUSIVE",
      "SHARE UPDATE EXCLUSIVE",
      "SHARE",
      "SHARE ROW EXCLUSIVE",
      "EXCLUSIVE",
      "ACCESS EXCLUSIVE",
    ],
    commonCommands: [
      "DROP TABLE",
      "TRUNCATE",
      "VACUUM FULL",
      "Many ALTER TABLE variants",
    ],
    blocksReads: true,
    blocksWrites: true,
    docsLink: POSTGRES_DOCS.explicitLocking,
  },
};

export const LOCK_LEVELS = Object.keys(LOCK_MATRIX) as LockLevel[];

export function getLockInfo(lockLevel?: LockLevel) {
  return lockLevel ? LOCK_MATRIX[lockLevel] : undefined;
}
