export type SchemaTable = {
  name: string;
  columns: Set<string>;
};

export type SchemaIndex = {
  tables: Map<string, SchemaTable>;
};

function normalizeIdentifier(value: string) {
  return value.replace(/"/g, "").trim().toLowerCase();
}

function parseTableName(match: RegExpMatchArray) {
  const schema = match[1] ? normalizeIdentifier(match[1]) : "public";
  const table = normalizeIdentifier(match[2] ?? match[1] ?? "");

  return `${schema}.${table}`;
}

export function parseSchemaSql(schemaSql: string): SchemaIndex {
  const tables = new Map<string, SchemaTable>();
  const createTablePattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([\w]+)"?\.)?"?([\w]+)"?\s*\(([\s\S]*?)\)\s*;/gi;

  let match: RegExpExecArray | null;

  while ((match = createTablePattern.exec(schemaSql)) !== null) {
    const tableName = parseTableName(match);
    const body = match[3] ?? "";
    const columns = new Set<string>();

    for (const line of body.split(",")) {
      const columnMatch = line.trim().match(/^"?([\w]+)"?\s+/i);

      if (columnMatch?.[1]) {
        columns.add(normalizeIdentifier(columnMatch[1]));
      }
    }

    tables.set(tableName, {
      name: tableName,
      columns,
    });
  }

  return { tables };
}

export function schemaHasTable(schema: SchemaIndex, relationName?: string) {
  if (!relationName) {
    return true;
  }

  const normalized = normalizeIdentifier(relationName).replace(/\s+/g, "");

  if (tablesHas(schema, normalized)) {
    return true;
  }

  if (!normalized.includes(".") && tablesHas(schema, `public.${normalized}`)) {
    return true;
  }

  return false;
}

function tablesHas(schema: SchemaIndex, key: string) {
  return schema.tables.has(key);
}

export function schemaHasColumn(
  schema: SchemaIndex,
  relationName: string | undefined,
  columnName: string | undefined,
) {
  if (!relationName || !columnName) {
    return true;
  }

  const tableKey = normalizeIdentifier(relationName).includes(".")
    ? normalizeIdentifier(relationName)
    : `public.${normalizeIdentifier(relationName)}`;
  const table = schema.tables.get(tableKey);

  if (!table) {
    return false;
  }

  return table.columns.has(normalizeIdentifier(columnName));
}
