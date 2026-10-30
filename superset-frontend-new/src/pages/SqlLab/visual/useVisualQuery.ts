import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format as formatSql } from "sql-formatter";
import type { TableMetadata } from "@/types/api";
import { formatterDialect, supportsDateUnit } from "./dialects";
import { classifyColumn, type ColumnCategory } from "./operators";
import {
  buildSql,
  defaultMetricLabel,
  validateModelForRun,
} from "./sqlBuilder";
import {
  isAggregated,
  stageView,
  tableMetaKey,
  type VisualQueryModel,
  type VisualRef,
  type VisualStageView,
} from "./types";

export interface UseVisualQueryOptions {
  model: VisualQueryModel;
  backend?: string;
  databaseId: number | "";
  /** Fetches table metadata (cached upstream); resolves null on failure. */
  fetchTableMetadata: (
    databaseId: number | "",
    schema: string,
    table: string,
  ) => Promise<TableMetadata | null>;
  /** Shared metadata cache keyed by tableMetaKey(). */
  tableMetas: Record<string, TableMetadata>;
}

export interface ColumnOption {
  name: string;
  category: ColumnCategory;
}

/** 阶段输出列（聚合 = 分组+指标；明细 = 选择的字段；未选择时未知）。 */
export function stageOutputColumns(view: VisualStageView): ColumnOption[] {
  if (isAggregated(view)) {
    const options: ColumnOption[] = [];
    for (const dim of view.groupBy) {
      const ref = dim.ref;
      options.push({
        name:
          ref.kind === "expression"
            ? (view.expressions.find((e) => e.id === ref.expressionId)?.name ??
              "表达式")
            : ref.column,
        category: "other",
      });
    }
    for (const metric of view.metrics) {
      options.push({
        name: metric.label.trim() || defaultMetricLabel(metric),
        category: "number",
      });
    }
    return options;
  }
  return view.columns.map((column) => {
    const ref = column.source;
    return {
      name:
        column.alias?.trim() ||
        (ref.kind === "expression"
          ? (view.expressions.find((e) => e.id === ref.expressionId)?.name ??
            "表达式")
          : ref.column),
      category: "other" as const,
    };
  });
}

export function useVisualQuery({
  model,
  backend,
  databaseId,
  fetchTableMetadata,
  tableMetas,
}: UseVisualQueryOptions) {
  const effectiveDb = model.databaseId || databaseId;
  const failedRef = useRef<Set<string>>(new Set());
  const [retryTick, setRetryTick] = useState(0);
  const [metaError, setMetaError] = useState<string | null>(null);

  const stageViews = useMemo(
    () => (model.stages ?? []).map((stage) => stageView(model, stage)),
    [model],
  );

  // 所有物理表 (模式, 表)：各阶段的表来源 + 关联表（关联可跨模式，同库）。
  const neededScopes = useMemo(() => {
    const scopes: { schema: string; table: string }[] = [];
    for (const view of stageViews) {
      if (view.table && view.schema) {
        scopes.push({ schema: view.schema, table: view.table });
      }
      for (const join of view.joins) {
        scopes.push({ schema: join.schema ?? model.schema, table: join.table });
      }
    }
    return Array.from(
      new Map(
        scopes
          .filter((scope) => scope.table)
          .map((scope) => [
            tableMetaKey(effectiveDb, scope.schema, scope.table),
            scope,
          ]),
      ).values(),
    );
  }, [stageViews, model.schema, effectiveDb]);
  const neededKey = neededScopes
    .map((scope) => tableMetaKey(effectiveDb, scope.schema, scope.table))
    .join("|");

  useEffect(() => {
    if (neededScopes.length === 0) return;
    const missing = neededScopes.filter(
      (scope) =>
        !tableMetas[tableMetaKey(effectiveDb, scope.schema, scope.table)] &&
        !failedRef.current.has(
          tableMetaKey(effectiveDb, scope.schema, scope.table),
        ),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map((scope) =>
        fetchTableMetadata(effectiveDb, scope.schema, scope.table).then(
          (meta) => {
            if (!meta) {
              failedRef.current.add(
                tableMetaKey(effectiveDb, scope.schema, scope.table),
              );
            }
            return meta;
          },
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      setMetaError(
        results.every((r) => r === null) ? "无法加载表结构，请重试" : null,
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededKey, effectiveDb, tableMetas, fetchTableMetadata, retryTick]);

  const retryMeta = useCallback(() => {
    failedRef.current.clear();
    setMetaError(null);
    setRetryTick((t) => t + 1);
  }, []);

  // 阶段 → 输出列（供下游阶段作为“表”来选取字段）。
  const outputsByName = useMemo(() => {
    const map = new Map<string, ColumnOption[]>();
    for (const stage of model.stages ?? []) {
      map.set(stage.name, stageOutputColumns(stageView(model, stage)));
    }
    return map;
  }, [model]);

  const metaForTable = useCallback(
    (table: string, schema?: string): TableMetadata | undefined =>
      tableMetas[tableMetaKey(effectiveDb, schema ?? model.schema, table)],
    [tableMetas, effectiveDb, model.schema],
  );

  const fetchTableMeta = useCallback(
    (schema: string, table: string) =>
      fetchTableMetadata(effectiveDb, schema, table),
    [fetchTableMetadata, effectiveDb],
  );

  const columnsForTable = useCallback(
    (table: string, schema?: string): ColumnOption[] => {
      const effectiveSchema = schema ?? model.schema;
      if (effectiveSchema === "") {
        // 阶段来源（CTE）：列出上游阶段的输出列。
        return outputsByName.get(table) ?? [];
      }
      const meta = metaForTable(table, effectiveSchema);
      if (!meta) return [];
      return meta.columns.map((column) => ({
        name: column.name,
        category: classifyColumn(column.type, column.longType),
      }));
    },
    [metaForTable, outputsByName, model.schema],
  );

  const refCategory = useCallback(
    (view: VisualStageView, ref: VisualRef): ColumnCategory => {
      if (ref.kind === "expression") return "other";
      const schema = ref.joinId
        ? (view.joins.find((j) => j.id === ref.joinId)?.schema ?? model.schema)
        : view.schema;
      if (!schema) return "other";
      const table = ref.joinId
        ? (view.joins.find((j) => j.id === ref.joinId)?.table ?? "")
        : view.table;
      if (!table) return "other";
      const column = columnsForTable(table, schema).find(
        (c) => c.name === ref.column,
      );
      return column?.category ?? "other";
    },
    [columnsForTable, model.schema],
  );

  const generatedSql = useMemo(
    () => buildSql(model, backend, tableMetas),
    [model, backend, tableMetas],
  );

  const formattedSql = useMemo(() => {
    if (!generatedSql) return "";
    try {
      return formatSql(generatedSql, {
        language: formatterDialect(backend),
        keywordCase: "upper",
      });
    } catch {
      return generatedSql;
    }
  }, [generatedSql, backend]);

  const blockReason = useMemo(() => validateModelForRun(model), [model]);
  const dateUnitSupported = supportsDateUnit(backend);

  const isLoadingMeta = neededScopes.some(
    (scope) =>
      !tableMetas[tableMetaKey(effectiveDb, scope.schema, scope.table)],
  );

  return {
    stageViews,
    generatedSql,
    formattedSql,
    blockReason,
    runnable: blockReason === null && stageViews.some((v) => v.table),
    dateUnitSupported,
    metaError,
    retryMeta,
    metaForTable,
    fetchTableMeta,
    columnsForTable,
    refCategory,
    outputsByName,
    isLoadingMeta,
    effectiveDb,
  };
}
