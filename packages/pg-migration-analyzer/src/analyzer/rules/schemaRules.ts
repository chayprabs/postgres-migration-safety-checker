import { POSTGRES_DOCS } from "../docsLinks";
import { schemaHasTable } from "../../schema/parseSchema";
import type { AnalyzerRule } from "./types";

export const PGM040_ALTER_UNKNOWN_TABLE: AnalyzerRule = {
  id: "PGM040_ALTER_UNKNOWN_TABLE",
  title: "ALTER TABLE targets a relation not present in pasted schema",
  category: "syntax",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.alterTable],
  evaluate(context) {
    const schemaIndex = context.schemaIndex;
    if (!schemaIndex) {
      return [];
    }

    return context.statements
      .filter(
        (statement) =>
          statement.kind === "alter-table" &&
          statement.targetObject &&
          !schemaHasTable(schemaIndex, statement.targetObject),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM040_ALTER_UNKNOWN_TABLE, {
          statement,
          confidence: "medium",
          summary: `ALTER TABLE references ${statement.targetObject}, which was not found in the optional schema context.`,
          whyItMatters:
            "If the relation name is wrong or the schema context is incomplete, the migration may fail at deploy time or target the wrong table.",
          recommendedAction:
            "Verify the table name against production schema, or paste a fuller schema context before reviewing.",
          tags: ["schema-context", "alter-table"],
        }),
      );
  },
};

export const PGM041_CREATE_INDEX_UNKNOWN_TABLE: AnalyzerRule = {
  id: "PGM041_CREATE_INDEX_UNKNOWN_TABLE",
  title: "CREATE INDEX targets a relation not present in pasted schema",
  category: "syntax",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.createIndex],
  evaluate(context) {
    const schemaIndex = context.schemaIndex;
    if (!schemaIndex) {
      return [];
    }

    return context.statements
      .filter(
        (statement) =>
          statement.kind === "create-index" &&
          statement.targetObject &&
          !schemaHasTable(schemaIndex, statement.targetObject),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM041_CREATE_INDEX_UNKNOWN_TABLE, {
          statement,
          confidence: "medium",
          summary: `CREATE INDEX references ${statement.targetObject}, which was not found in the optional schema context.`,
          whyItMatters:
            "Index migrations against a mistyped or not-yet-created table fail late and can block deploy pipelines.",
          recommendedAction:
            "Confirm the indexed table exists in the target environment or expand the pasted schema context.",
          tags: ["schema-context", "create-index"],
        }),
      );
  },
};
