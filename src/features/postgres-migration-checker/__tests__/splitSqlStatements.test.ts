import { describe, expect, it } from "vitest";
import {
  buildSqlSourceIndex,
  locateSourcePosition,
  splitSqlStatements,
} from "../analyzer/splitSqlStatements";

describe("splitSqlStatements", () => {
  it("splits basic semicolon-delimited statements", () => {
    const statements = splitSqlStatements("SELECT 1; SELECT 2;");

    expect(statements).toHaveLength(2);
    expect(statements.map((statement) => statement.raw)).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
  });

  it("keeps semicolons inside single-quoted strings", () => {
    const statements = splitSqlStatements(
      "INSERT INTO logs(message) VALUES ('hello;world'); SELECT 2;",
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]?.raw).toContain("'hello;world'");
  });

  it("keeps semicolons inside double-quoted identifiers", () => {
    const statements = splitSqlStatements(
      'ALTER TABLE "user;events" RENAME TO user_events; SELECT 1;',
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]?.raw).toContain('"user;events"');
  });

  it("keeps semicolons inside dollar-quoted function bodies", () => {
    const statements = splitSqlStatements(`CREATE FUNCTION increment_counter()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1;
  PERFORM 2;
END;
$$;
SELECT 1;`);

    expect(statements).toHaveLength(2);
    expect(statements[0]?.raw).toContain("PERFORM 1;");
    expect(statements[0]?.raw).toContain("PERFORM 2;");
  });

  it("ignores line comments and block comments when splitting", () => {
    const statements = splitSqlStatements(`-- banner comment;
SELECT 1; /* trailing; block comment */
/* standalone; block comment */
SELECT 2`);

    expect(statements).toHaveLength(2);
    expect(statements.map((statement) => statement.raw)).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
  });

  it("captures the final statement even without a trailing semicolon", () => {
    const statements = splitSqlStatements("SELECT now()");

    expect(statements).toHaveLength(1);
    expect(statements[0]?.raw).toBe("SELECT now()");
  });

  it("skips empty statements created by repeated semicolons", () => {
    const statements = splitSqlStatements(";\n;;\nSELECT 1;;\n");

    expect(statements).toHaveLength(1);
    expect(statements[0]?.raw).toBe("SELECT 1");
  });

  it("tracks line and column positions for each statement", () => {
    const sql = "\n  SELECT 1;\n\nALTER TABLE users\n  ADD COLUMN display_name text;\n";
    const statements = splitSqlStatements(sql);
    const index = buildSqlSourceIndex(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({
      lineStart: 2,
      lineEnd: 2,
      columnStart: 3,
      columnEnd: 10,
    });
    expect(statements[1]).toMatchObject({
      lineStart: 4,
      lineEnd: 5,
      columnStart: 1,
      columnEnd: 30,
    });
    expect(
      locateSourcePosition(index, sql.indexOf("display_name")),
    ).toEqual({
      line: 5,
      column: 14,
    });
  });
});
