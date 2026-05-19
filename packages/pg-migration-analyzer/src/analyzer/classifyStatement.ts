import type { MigrationStatement, StatementKind } from "../types";

export type StatementClassification = Pick<
  MigrationStatement,
  "kind" | "targetObject" | "tags" | "transactionalBehavior"
>;

function isWhitespace(character: string) {
  return /\s/.test(character);
}

function isIdentifierStart(character: string) {
  return /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string) {
  return /[A-Za-z0-9_$]/.test(character);
}

function readDollarQuoteTag(sql: string, start: number) {
  if (sql[start] !== "$") {
    return null;
  }

  if (sql[start + 1] === "$") {
    return "$$";
  }

  let cursor = start + 1;

  if (!isIdentifierStart(sql[cursor] ?? "")) {
    return null;
  }

  cursor += 1;

  while (cursor < sql.length && isIdentifierPart(sql[cursor] ?? "")) {
    cursor += 1;
  }

  if (sql[cursor] !== "$") {
    return null;
  }

  return sql.slice(start, cursor + 1);
}

export function normalizeSqlForClassification(sql: string) {
  const normalizedParts: string[] = [];
  let cursor = 0;
  let dollarTag: string | null = null;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let blockCommentDepth = 0;
  let previousWasWhitespace = false;

  while (cursor < sql.length) {
    const character = sql[cursor] ?? "";
    const nextCharacter = sql[cursor + 1] ?? "";

    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;

        if (!previousWasWhitespace && normalizedParts.length > 0) {
          normalizedParts.push(" ");
          previousWasWhitespace = true;
        }
      }

      cursor += 1;
      continue;
    }

    if (blockCommentDepth > 0) {
      if (character === "/" && nextCharacter === "*") {
        blockCommentDepth += 1;
        cursor += 2;
        continue;
      }

      if (character === "*" && nextCharacter === "/") {
        blockCommentDepth -= 1;
        cursor += 2;

        if (blockCommentDepth === 0 && !previousWasWhitespace && normalizedParts.length > 0) {
          normalizedParts.push(" ");
          previousWasWhitespace = true;
        }

        continue;
      }

      cursor += 1;
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, cursor)) {
        normalizedParts.push(dollarTag);
        cursor += dollarTag.length;
        dollarTag = null;
        previousWasWhitespace = false;
        continue;
      }

      normalizedParts.push(character);
      previousWasWhitespace = false;
      cursor += 1;
      continue;
    }

    if (inSingleQuote) {
      normalizedParts.push(character);
      previousWasWhitespace = false;

      if (character === "'" && nextCharacter === "'") {
        normalizedParts.push(nextCharacter);
        cursor += 2;
        continue;
      }

      if (character === "'") {
        inSingleQuote = false;
      }

      cursor += 1;
      continue;
    }

    if (inDoubleQuote) {
      normalizedParts.push(character);
      previousWasWhitespace = false;

      if (character === '"' && nextCharacter === '"') {
        normalizedParts.push(nextCharacter);
        cursor += 2;
        continue;
      }

      if (character === '"') {
        inDoubleQuote = false;
      }

      cursor += 1;
      continue;
    }

    if (character === "-" && nextCharacter === "-") {
      inLineComment = true;
      cursor += 2;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      blockCommentDepth = 1;
      cursor += 2;
      continue;
    }

    const tag = character === "$" ? readDollarQuoteTag(sql, cursor) : null;

    if (tag) {
      normalizedParts.push(tag);
      cursor += tag.length;
      dollarTag = tag;
      previousWasWhitespace = false;
      continue;
    }

    if (character === "'") {
      inSingleQuote = true;
      normalizedParts.push(character);
      previousWasWhitespace = false;
      cursor += 1;
      continue;
    }

    if (character === '"') {
      inDoubleQuote = true;
      normalizedParts.push(character);
      previousWasWhitespace = false;
      cursor += 1;
      continue;
    }

    if (isWhitespace(character)) {
      if (!previousWasWhitespace && normalizedParts.length > 0) {
        normalizedParts.push(" ");
        previousWasWhitespace = true;
      }

      cursor += 1;
      continue;
    }

    normalizedParts.push(character);
    previousWasWhitespace = false;
    cursor += 1;
  }

  return normalizedParts.join("").trim();
}

function toComparableSql(sql: string) {
  return sql.toUpperCase();
}

function readQuotedIdentifier(sql: string, start: number) {
  if (sql[start] !== '"') {
    return null;
  }

  let cursor = start + 1;

  while (cursor < sql.length) {
    if (sql[cursor] === '"' && sql[cursor + 1] === '"') {
      cursor += 2;
      continue;
    }

    if (sql[cursor] === '"') {
      return {
        value: sql.slice(start, cursor + 1),
        end: cursor + 1,
      };
    }

    cursor += 1;
  }

  return {
    value: sql.slice(start),
    end: sql.length,
  };
}

function readIdentifier(sql: string, start: number) {
  const character = sql[start] ?? "";

  if (character === '"') {
    return readQuotedIdentifier(sql, start);
  }

  if (!isIdentifierStart(character)) {
    return null;
  }

  let cursor = start + 1;

  while (cursor < sql.length && isIdentifierPart(sql[cursor] ?? "")) {
    cursor += 1;
  }

  return {
    value: sql.slice(start, cursor),
    end: cursor,
  };
}

function skipSpaces(sql: string, start: number) {
  let cursor = start;

  while (cursor < sql.length && isWhitespace(sql[cursor] ?? "")) {
    cursor += 1;
  }

  return cursor;
}

function readQualifiedIdentifier(sql: string, start: number) {
  let cursor = skipSpaces(sql, start);
  const segments: string[] = [];
  let token = readIdentifier(sql, cursor);

  if (!token) {
    return null;
  }

  segments.push(token.value);
  cursor = token.end;

  while (true) {
    cursor = skipSpaces(sql, cursor);

    if (sql[cursor] !== ".") {
      break;
    }

    cursor += 1;
    cursor = skipSpaces(sql, cursor);
    token = readIdentifier(sql, cursor);

    if (!token) {
      break;
    }

    segments.push(token.value);
    cursor = token.end;
  }

  return {
    end: cursor,
    value: segments.join("."),
  };
}

function readIdentifierAfterKeywords(sql: string, keywords: string[]) {
  let cursor = 0;

  for (const keyword of keywords) {
    const comparable = toComparableSql(sql.slice(cursor));

    if (!comparable.startsWith(keyword)) {
      return null;
    }

    cursor += keyword.length;
    cursor = skipSpaces(sql, cursor);
  }

  return readQualifiedIdentifier(sql, cursor);
}

function pickTargetObject(normalizedSql: string, kind: StatementKind) {
  switch (kind) {
    case "alter-table": {
      const match = normalizedSql.match(
        /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(.+?)(?:\s+ADD|\s+ALTER|\s+DROP|\s+RENAME|\s+SET|\s+VALIDATE|\s+ATTACH|\s+DETACH|\s+OWNER|\s+NO|\s+ENABLE|\s+DISABLE|\s+INHERIT|\s+OF|\s+CLUSTER|\s+USING|\s+RESET|\s*$)/i,
      );

      return match?.[1]?.trim();
    }
    case "create-index": {
      const match = normalizedSql.match(
        /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(.+?)(?:\s+ON\s+)/i,
      );

      return match?.[1]?.trim();
    }
    case "drop-index": {
      const match = normalizedSql.match(
        /^DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(.+?)(?:\s+CASCADE|\s+RESTRICT|\s*$)/i,
      );

      return match?.[1]?.trim();
    }
    case "drop-table": {
      const match = normalizedSql.match(
        /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(.+?)(?:\s+CASCADE|\s+RESTRICT|\s*$)/i,
      );

      return match?.[1]?.trim();
    }
    case "truncate": {
      const match = normalizedSql.match(
        /^TRUNCATE\s+(?:TABLE\s+)?(.+?)(?:\s+RESTART|\s+CONTINUE|\s+CASCADE|\s+RESTRICT|\s*$)/i,
      );

      return match?.[1]?.trim();
    }
    case "rename": {
      const match = normalizedSql.match(
        /\bRENAME\s+(?:COLUMN|CONSTRAINT|TO)?\s*(.+?)\s+TO\b/i,
      );

      return match?.[1]?.trim();
    }
    case "create-type":
      return readIdentifierAfterKeywords(normalizedSql, ["CREATE", "TYPE"])?.value;
    case "alter-type":
      return readIdentifierAfterKeywords(normalizedSql, ["ALTER", "TYPE"])?.value;
    case "create-trigger":
      return readIdentifierAfterKeywords(normalizedSql, ["CREATE", "TRIGGER"])?.value;
    case "create-extension":
      return readIdentifierAfterKeywords(normalizedSql, ["CREATE", "EXTENSION"])?.value;
    case "reindex": {
      const match = normalizedSql.match(
        /^REINDEX\s+(?:\(.*?\)\s+)?(?:INDEX|TABLE|SCHEMA|DATABASE|SYSTEM)\s+(.+?)(?:\s*$)/i,
      );

      return match?.[1]?.trim();
    }
    case "refresh-materialized-view": {
      const match = normalizedSql.match(
        /^REFRESH\s+MATERIALIZED\s+VIEW\s+(?:CONCURRENTLY\s+)?(.+?)(?:\s+WITH|\s*$)/i,
      );

      return match?.[1]?.trim();
    }
    default:
      return undefined;
  }
}

function getTransactionalBehavior(normalizedSql: string, kind: StatementKind) {
  const comparableSql = toComparableSql(normalizedSql);

  if (
    (kind === "create-index" || kind === "drop-index" || kind === "reindex") &&
    comparableSql.includes(" CONCURRENTLY ")
  ) {
    return "requires-outside-transaction";
  }

  if (
    kind === "refresh-materialized-view" &&
    comparableSql.includes(" CONCURRENTLY ")
  ) {
    return "requires-outside-transaction";
  }

  if (kind === "vacuum-full") {
    return "requires-outside-transaction";
  }

  return "unknown";
}

function getTags(kind: StatementKind, comparableSql: string) {
  const tags: string[] = [kind];

  if (comparableSql.includes(" CONCURRENTLY ")) {
    tags.push("concurrently");
  }

  if (comparableSql.includes(" NOT VALID")) {
    tags.push("not-valid");
  }

  if (comparableSql.includes(" MATERIALIZED VIEW ")) {
    tags.push("materialized-view");
  }

  if (comparableSql.includes(" DEFAULT ")) {
    tags.push("default");
  }

  return tags;
}

export function classifyStatement(rawSql: string): StatementClassification {
  const normalizedSql = normalizeSqlForClassification(rawSql);
  const comparableSql = toComparableSql(normalizedSql);
  let kind: StatementKind = "unknown";

  if (
    comparableSql.startsWith("ALTER TABLE ") &&
    comparableSql.includes(" RENAME ")
  ) {
    kind = "rename";
  } else if (comparableSql.startsWith("ALTER TABLE ")) {
    kind = "alter-table";
  } else if (
    comparableSql.startsWith("CREATE INDEX ") ||
    comparableSql.startsWith("CREATE UNIQUE INDEX ") ||
    comparableSql.startsWith("CREATE INDEX CONCURRENTLY ") ||
    comparableSql.startsWith("CREATE UNIQUE INDEX CONCURRENTLY ")
  ) {
    kind = "create-index";
  } else if (comparableSql.startsWith("DROP INDEX ")) {
    kind = "drop-index";
  } else if (comparableSql.startsWith("DROP TABLE ")) {
    kind = "drop-table";
  } else if (
    comparableSql.startsWith("TRUNCATE ") ||
    comparableSql.startsWith("TRUNCATE TABLE ")
  ) {
    kind = "truncate";
  } else if (comparableSql.startsWith("RENAME ")) {
    kind = "rename";
  } else if (comparableSql.startsWith("CREATE TYPE ")) {
    kind = "create-type";
  } else if (comparableSql.startsWith("ALTER TYPE ")) {
    kind = "alter-type";
  } else if (comparableSql.startsWith("CREATE TRIGGER ")) {
    kind = "create-trigger";
  } else if (comparableSql.startsWith("CREATE EXTENSION ")) {
    kind = "create-extension";
  } else if (comparableSql.startsWith("REINDEX ")) {
    kind = "reindex";
  } else if (
    comparableSql.startsWith("VACUUM FULL ") ||
    comparableSql.startsWith("VACUUM (FULL")
  ) {
    kind = "vacuum-full";
  } else if (comparableSql.startsWith("CLUSTER ")) {
    kind = "cluster";
  } else if (comparableSql.startsWith("REFRESH MATERIALIZED VIEW ")) {
    kind = "refresh-materialized-view";
  } else if (comparableSql.startsWith("UPDATE ")) {
    kind = "update";
  } else if (comparableSql.startsWith("DELETE ")) {
    kind = "delete";
  } else if (comparableSql.startsWith("INSERT ")) {
    kind = "insert";
  } else if (comparableSql === "BEGIN" || comparableSql.startsWith("BEGIN ")) {
    kind = "begin";
  } else if (
    comparableSql === "COMMIT" ||
    comparableSql.startsWith("COMMIT ") ||
    comparableSql === "END"
  ) {
    kind = "commit";
  } else if (
    comparableSql === "ROLLBACK" ||
    comparableSql.startsWith("ROLLBACK ")
  ) {
    kind = "rollback";
  } else if (comparableSql.startsWith("SET ")) {
    kind = "set";
  }

  return {
    kind,
    targetObject: pickTargetObject(normalizedSql, kind),
    transactionalBehavior: getTransactionalBehavior(normalizedSql, kind),
    tags: getTags(kind, comparableSql),
  };
}
