import type { LockLevel } from "../types";
import {
  LOCK_LEVELS as RULE_LOCK_LEVELS,
  LOCK_MATRIX,
} from "../analyzer/rules/lockMatrix";

export type LockLevelDefinition = {
  level: LockLevel;
  description: string;
  conflictsWith: LockLevel[];
  typicalOperations: string[];
  docsHref: string;
  blocksReads: boolean;
  blocksWrites: boolean;
};

export const LOCK_LEVEL_DEFINITIONS = RULE_LOCK_LEVELS.map((level) => {
  const entry = LOCK_MATRIX[level];

  return {
    level,
    description: entry.description,
    conflictsWith: entry.conflictsWith,
    typicalOperations: entry.commonCommands,
    docsHref: entry.docsLink.href,
    blocksReads: entry.blocksReads,
    blocksWrites: entry.blocksWrites,
  };
}) satisfies readonly LockLevelDefinition[];

export const LOCK_LEVELS = RULE_LOCK_LEVELS;
