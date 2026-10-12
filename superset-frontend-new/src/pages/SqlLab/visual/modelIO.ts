import type { VisualQueryModel, VisualStage, VisualStageSource } from "./types";
import { DEFAULT_LIMIT } from "./types";

export const VISUAL_MARKER = "-- superset-viz:";

const FIRST_LINE_RE = new RegExp(
  `^\\s*${VISUAL_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\{[^\\n]*\\})\\s*(?:\\r?\\n)?`,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateStage(
  raw: unknown,
  index: number,
  fallbackSchema: string,
): VisualStage | null {
  if (!isRecord(raw)) return null;
  const sourceRaw = isRecord(raw.source) ? raw.source : null;

  let source: VisualStageSource;
  if (
    sourceRaw &&
    sourceRaw.kind === "stage" &&
    typeof sourceRaw.stageId === "string"
  ) {
    source = { kind: "stage", stageId: sourceRaw.stageId };
  } else {
    const table =
      sourceRaw && typeof sourceRaw.table === "string"
        ? sourceRaw.table
        : typeof raw.table === "string"
          ? raw.table
          : "";
    const schema =
      sourceRaw && typeof sourceRaw.schema === "string"
        ? sourceRaw.schema
        : typeof raw.schema === "string"
          ? raw.schema
          : fallbackSchema;
    source = { kind: "table", schema, table };
  }

  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name
      : `stage_${index + 1}`;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `${name}_${index}`;
  const limit = num(raw.limit, DEFAULT_LIMIT);

  return {
    id,
    name,
    source,
    joins: records(raw.joins) as unknown as VisualStage["joins"],
    columns: records(raw.columns) as unknown as VisualStage["columns"],
    expressions: records(
      raw.expressions,
    ) as unknown as VisualStage["expressions"],
    filters: records(raw.filters) as unknown as VisualStage["filters"],
    groupBy: records(raw.groupBy) as unknown as VisualStage["groupBy"],
    metrics: records(raw.metrics) as unknown as VisualStage["metrics"],
    having: records(raw.having) as unknown as VisualStage["having"],
    sorts: records(raw.sorts) as unknown as VisualStage["sorts"],
    limit: limit > 0 ? limit : DEFAULT_LIMIT,
  };
}

/**
 * Shallow structural validation. Supports both the current multi-stage model
 * (`stages: [...]`) and the legacy flat model (`table`, `joins`, ...), which is
 * wrapped into a single `stage_1` so old saved queries keep working.
 * Unknown extra fields are dropped; malformed core fields make the model
 * unusable, returning null.
 */
export function validateModel(value: unknown): VisualQueryModel | null {
  if (!isRecord(value)) return null;
  if (value.v !== 1) return null;
  const databaseId = num(value.databaseId, 0);
  const schema = typeof value.schema === "string" ? value.schema : "";

  if (Array.isArray(value.stages) && value.stages.length > 0) {
    const stages = value.stages
      .map((stage, index) => validateStage(stage, index, schema))
      .filter((stage): stage is VisualStage => stage !== null);
    if (stages.length === 0) return null;
    return { v: 1, databaseId, schema, stages };
  }

  // 兼容旧版扁平模型：包装为单一阶段。
  if (typeof value.table === "string" && value.table.trim() !== "") {
    const stage = validateStage(
      {
        ...value,
        name: "stage_1",
        source: { kind: "table", table: value.table },
      },
      0,
      schema,
    );
    if (!stage) return null;
    return { v: 1, databaseId, schema, stages: [stage] };
  }
  return null;
}

/** Prepends the model comment to the SQL body. */
export function embedModel(sql: string, model: VisualQueryModel): string {
  const body = stripVisualComment(sql);
  return `${VISUAL_MARKER} ${JSON.stringify(model)}\n${body}`;
}

/** Removes the leading model comment, if present. */
export function stripVisualComment(sql: string): string {
  return sql.replace(FIRST_LINE_RE, "");
}

export function hasVisualComment(sql: string): boolean {
  return FIRST_LINE_RE.test(sql);
}

/** Extracts the embedded model and the remaining SQL body. */
export function extractModel(
  sql: string,
): { model: VisualQueryModel; body: string } | null {
  const match = sql.match(FIRST_LINE_RE);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }
  const model = validateModel(parsed);
  if (!model) return null;
  return { model, body: sql.slice(match[0].length) };
}

function normalizeSql(sql: string): string {
  return (
    sql
      // Quoting differs per dialect (double quotes / backticks / brackets) and
      // depends on metadata being loaded (numeric literals); ignore all quote
      // characters so the comparison does not produce false "modified" alarms.
      .replace(/['"`[\]]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([(),])\s*/g, "$1")
      .trim()
      .toLowerCase()
  );
}

/**
 * True when the SQL body still matches the SQL generated from the model
 * (whitespace/case-insensitive), i.e. the user has not hand-edited it.
 */
export function isModelSqlUnmodified(
  sql: string,
  generatedSql: string,
): boolean {
  return normalizeSql(stripVisualComment(sql)) === normalizeSql(generatedSql);
}
