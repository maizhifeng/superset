import type { TableMetadata } from "@/types/api";
import type { ColumnCategory } from "../operators";
import type { VisualStageView, VisualRef } from "../types";
import type { ColumnOption } from "../useVisualQuery";

/** Shared context passed down to every visual-builder step component. */
export interface BuilderContext {
  /** 当前阶段的扁平视图（与旧版 model 字段一致）。 */
  model: VisualStageView;
  /** 内层编辑：接收编辑后的阶段视图。 */
  onChange: (view: VisualStageView) => void;
  backend?: string;
  /** Tables of the currently selected schema. */
  tableList: { value: string; type: string }[];
  /** Schemas of the current database (关联表可跨模式，同库)。 */
  schemas: string[];
  /** 全局默认模式：阶段来源为 CTE 时作为关联表模式兜底。 */
  contextSchema: string;
  columnsForTable: (table: string, schema?: string) => ColumnOption[];
  refCategory: (ref: VisualRef) => ColumnCategory;
  metaForTable: (table: string, schema?: string) => TableMetadata | undefined;
  /** Fetches metadata for a candidate table (e.g. the join dialog). */
  fetchTableMeta: (
    schema: string,
    table: string,
  ) => Promise<TableMetadata | null>;
  /** Fetches the table list of another schema in the same database. */
  fetchTableListForSchema: (schema: string) => Promise<string[]>;
  isLoadingMeta: boolean;
  metaError: string | null;
  retryMeta: () => void;
  dateUnitSupported: boolean;
  /* ---- 阶段容器信息（内层步骤一般不需要） ---- */
  stageId: string;
  stageName: string;
  /** 1-based 展示序号。 */
  stageIndex: number;
  stageCount: number;
  isLastStage: boolean;
  /** 可选的上游阶段（仅它之前的阶段）。 */
  upstreamStages: { id: string; name: string; index: number }[];
  onSelectUpstream: (stageId: string) => void;
  /** 阶段来源为上游阶段时，当前引用的上游 id。 */
  sourceStageId?: string;
}

export interface TableOption {
  joinId?: string;
  table: string;
  /** 表所在模式；缺省为查询默认模式。 */
  schema?: string;
  label: string;
}

/** Selectable tables of the current stage: base source plus existing joins. */
export function defaultTableOptions(ctx: BuilderContext): TableOption[] {
  const options: TableOption[] = [];
  if (ctx.model.table) {
    options.push({
      table: ctx.model.table,
      schema: ctx.model.schema,
      label: `${ctx.model.table}（主表）`,
    });
  }
  for (const join of ctx.model.joins) {
    const schema = join.schema ?? ctx.contextSchema;
    const scope =
      schema && schema !== ctx.contextSchema
        ? `${schema}.${join.table}`
        : join.table;
    options.push({
      joinId: join.id,
      table: join.table,
      schema,
      label: `${scope}（关联）`,
    });
  }
  return options;
}
