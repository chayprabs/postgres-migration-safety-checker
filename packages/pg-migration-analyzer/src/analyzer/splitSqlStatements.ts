import type { MigrationStatement } from "../types";
import { classifyStatement, normalizeSqlForClassification } from "./classifyStatement";

type SourcePosition = {
  column: number;
  line: number;
};

export type SqlSourceIndex = {
  byteToCodeUnitOffsets: number[];
  codeUnitToByteOffsets: number[];
  lineStartOffsets: number[];
};

function isWhitespace(character: string) {
  return /\s/.test(character);
}

function isIdentifierStart(character: string) {
  return /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string) {
  return /[A-Za-z0-9_]/.test(character);
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

function pushLineStartOffsets(sql: string) {
  const lineStartOffsets = [0];
  let cursor = 0;

  while (cursor < sql.length) {
    const character = sql[cursor] ?? "";
    const nextCharacter = sql[cursor + 1] ?? "";

    if (character === "\r" && nextCharacter === "\n") {
      lineStartOffsets.push(cursor + 2);
      cursor += 2;
      continue;
    }

    if (character === "\n" || character === "\r") {
      lineStartOffsets.push(cursor + 1);
    }

    cursor += 1;
  }

  return lineStartOffsets;
}

export function buildSqlSourceIndex(sql: string): SqlSourceIndex {
  const encoder = new TextEncoder();
  const codeUnitToByteOffsets = new Array<number>(sql.length + 1).fill(0);
  const byteToCodeUnitOffsets: number[] = [0];
  let byteOffset = 0;
  let cursor = 0;

  while (cursor < sql.length) {
    const codePoint = sql.codePointAt(cursor);

    if (codePoint === undefined) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    const codeUnitLength = character.length;
    const byteLength = encoder.encode(character).length;

    for (let offset = 0; offset < codeUnitLength; offset += 1) {
      codeUnitToByteOffsets[cursor + offset] = byteOffset;
    }

    for (let offset = 0; offset < byteLength; offset += 1) {
      byteToCodeUnitOffsets[byteOffset + offset] = cursor;
    }

    byteOffset += byteLength;
    cursor += codeUnitLength;
    codeUnitToByteOffsets[cursor] = byteOffset;
    byteToCodeUnitOffsets[byteOffset] = cursor;
  }

  return {
    byteToCodeUnitOffsets,
    codeUnitToByteOffsets,
    lineStartOffsets: pushLineStartOffsets(sql),
  };
}

export function locateSourcePosition(
  index: SqlSourceIndex,
  offset: number,
): SourcePosition {
  const safeOffset = Math.max(0, Math.min(offset, index.codeUnitToByteOffsets.length - 1));
  let low = 0;
  let high = index.lineStartOffsets.length - 1;
  let lineIndex = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const middleOffset = index.lineStartOffsets[middle] ?? 0;

    if (middleOffset <= safeOffset) {
      lineIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const lineStartOffset = index.lineStartOffsets[lineIndex] ?? 0;

  return {
    line: lineIndex + 1,
    column: safeOffset - lineStartOffset + 1,
  };
}

export function byteOffsetToCodeUnitOffset(index: SqlSourceIndex, byteOffset: number) {
  const safeOffset = Math.max(0, Math.min(byteOffset, index.byteToCodeUnitOffsets.length - 1));
  return index.byteToCodeUnitOffsets[safeOffset] ?? 0;
}

function createStatement(
  sql: string,
  index: SqlSourceIndex,
  startOffset: number,
  endOffset: number,
  statementIndex: number,
): MigrationStatement | null {
  const raw = sql.slice(startOffset, endOffset).trimEnd();
  const normalized = normalizeSqlForClassification(raw);

  if (normalized.length === 0) {
    return null;
  }

  const start = locateSourcePosition(index, startOffset);
  const end = locateSourcePosition(index, Math.max(startOffset, endOffset - 1));
  const classification = classifyStatement(raw);

  return {
    index: statementIndex,
    raw,
    normalized,
    startOffset,
    endOffset,
    lineStart: start.line,
    lineEnd: end.line,
    columnStart: start.column,
    columnEnd: end.column,
    kind: classification.kind,
    targetObject: classification.targetObject,
    transactionalBehavior: classification.transactionalBehavior,
    tags: classification.tags,
  };
}

export function splitSqlStatements(sql: string): MigrationStatement[] {
  const sourceIndex = buildSqlSourceIndex(sql);
  const statements: MigrationStatement[] = [];
  let cursor = 0;
  let blockCommentDepth = 0;
  let currentStatementStart: number | null = null;
  let currentStatementEnd: number | null = null;
  let dollarTag: string | null = null;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;

  function updateStatementEnd(nextOffset: number) {
    if (currentStatementStart !== null) {
      currentStatementEnd = nextOffset;
    }
  }

  function ensureStatementStart(offset: number) {
    if (currentStatementStart === null) {
      currentStatementStart = offset;
    }
  }

  function finalizeStatement(boundaryOffset: number) {
    if (currentStatementStart === null) {
      return;
    }

    const statement = createStatement(
      sql,
      sourceIndex,
      currentStatementStart,
      currentStatementEnd ?? boundaryOffset,
      statements.length,
    );

    if (statement) {
      statements.push(statement);
    }

    currentStatementStart = null;
    currentStatementEnd = null;
  }

  while (cursor < sql.length) {
    const character = sql[cursor] ?? "";
    const nextCharacter = sql[cursor + 1] ?? "";

    if (inLineComment) {
      updateStatementEnd(cursor + 1);

      if (character === "\n") {
        inLineComment = false;
      }

      cursor += 1;
      continue;
    }

    if (blockCommentDepth > 0) {
      updateStatementEnd(cursor + 1);

      if (character === "/" && nextCharacter === "*") {
        blockCommentDepth += 1;
        updateStatementEnd(cursor + 2);
        cursor += 2;
        continue;
      }

      if (character === "*" && nextCharacter === "/") {
        blockCommentDepth -= 1;
        updateStatementEnd(cursor + 2);
        cursor += 2;
        continue;
      }

      cursor += 1;
      continue;
    }

    if (dollarTag) {
      ensureStatementStart(cursor);

      if (sql.startsWith(dollarTag, cursor)) {
        updateStatementEnd(cursor + dollarTag.length);
        cursor += dollarTag.length;
        dollarTag = null;
        continue;
      }

      updateStatementEnd(cursor + 1);
      cursor += 1;
      continue;
    }

    if (inSingleQuote) {
      ensureStatementStart(cursor);
      updateStatementEnd(cursor + 1);

      if (character === "'" && nextCharacter === "'") {
        updateStatementEnd(cursor + 2);
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
      ensureStatementStart(cursor);
      updateStatementEnd(cursor + 1);

      if (character === '"' && nextCharacter === '"') {
        updateStatementEnd(cursor + 2);
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
      if (currentStatementStart !== null) {
        updateStatementEnd(cursor + 2);
      }

      inLineComment = true;
      cursor += 2;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      if (currentStatementStart !== null) {
        updateStatementEnd(cursor + 2);
      }

      blockCommentDepth = 1;
      cursor += 2;
      continue;
    }

    const tag = character === "$" ? readDollarQuoteTag(sql, cursor) : null;

    if (tag) {
      ensureStatementStart(cursor);
      updateStatementEnd(cursor + tag.length);
      dollarTag = tag;
      cursor += tag.length;
      continue;
    }

    if (character === "'") {
      ensureStatementStart(cursor);
      updateStatementEnd(cursor + 1);
      inSingleQuote = true;
      cursor += 1;
      continue;
    }

    if (character === '"') {
      ensureStatementStart(cursor);
      updateStatementEnd(cursor + 1);
      inDoubleQuote = true;
      cursor += 1;
      continue;
    }

    if (character === ";") {
      finalizeStatement(cursor);
      cursor += 1;
      continue;
    }

    if (!isWhitespace(character)) {
      ensureStatementStart(cursor);
      updateStatementEnd(cursor + 1);
    }

    cursor += 1;
  }

  finalizeStatement(sql.length);

  return statements;
}
