import type {
  ChartData,
  ChartDataPayload,
  ChartDataRow,
  FormData,
} from "@/types/api";
import api from "@/api";
import { buildQueryObject } from "@/utils/query/extractQueryFields";
import type { ChartDataResponseResult } from "@/utils/query/types";
import { getChartDataUrl } from "@/api/chartData";
import {
  fetchWideData,
  MAX_PIVOT_FETCH_ROWS,
  MAX_WIDE_FETCH_ROWS,
} from "@/api/wideData";
import type { WideDataRequest, WideFilter } from "@/types/pivot";
import { isFederatedDataset } from "@/config/federatedDatasets";

/**
 * Shared engine for building and executing the chart-data request for one
 * chart, used by the dashboard chart sheet (initial load, refresh, filter
 * change) and the chart editor.  Centralizes the detail + total + subtotal
 * query plan and the response parsing that used to be duplicated inline.
 *
 * The plan for a pivot chart is:
 *   1. detail query  -> displayed cells
 *   2. total query   -> grand-total row(s), grouped by the column dimensions
 *      so dataset-defined metrics (e.g. ratios) are recomputed per definition
 *   3. one subtotal query per row-dimension level below the top
 *
 * For federated pivot datasets the day-granularity "wide" table is fetched
 * instead and re-aggregated client-side by the layout builder.
 */

/** Adhoc filter shape understood by the dashboard/editor buildAdhocFilters. */
export interface FilterSpec {
  subject?: string;
  operator?: string;
  comparator?: unknown;
  col?: string;
  op?: string;
  val?: unknown;
}

/** Normalize a filter spec into the wide-table predicate shape. */
export function toWideFilters(specs: FilterSpec[]): WideFilter[] {
  return specs
    .map((f) => ({
      col: f.subject ?? f.col ?? "",
      op: f.operator ?? f.op ?? "",
      val: f.comparator ?? f.val,
    }))
    .filter((f) => Boolean(f.col));
}

/** Result returned by {@link fetchChartData} for a single chart. */
export interface ChartDataResult {
  data: ChartDataPayload;
  totalRow: ChartDataRow | null;
  pivotTotalRows?: ChartDataRow[];
  pivotSubtotalRows?: ChartDataRow[][];
  hasMore?: boolean;
}

const PAGE_SIZE = 50;

interface BuildPlanOptions {
  isPivot: boolean;
  page?: number;
  pageSize?: number;
}

/** Build the query plan (detail/total/subtotal) for a non-wide chart fetch. */
function buildQueryPlan(
  fd: FormData,
  vizType: string,
  adhocFilters: FilterSpec[],
  { isPivot, page, pageSize = PAGE_SIZE }: BuildPlanOptions,
): {
  queries: ReturnType<typeof buildQueryObject>[];
  hasMoreProbe: boolean;
} {
  const query = buildQueryObject(fd, vizType);
  if (isPivot) {
    query.row_limit = MAX_PIVOT_FETCH_ROWS;
  } else if (page != null) {
    query.row_limit = pageSize + 1;
    query.row_offset = page * pageSize;
  }
  if (adhocFilters.length > 0) {
    query.filters = adhocFilters.map((f) => ({
      col: f.subject ?? f.col ?? "",
      op: f.operator ?? f.op ?? "",
      val: (f.comparator ?? f.val) as string | string[],
    }));
  }

  const queries: ReturnType<typeof buildQueryObject>[] = [query];

  const totalQuery = buildQueryObject(fd, vizType);
  if (isPivot) {
    // Group by the column dimensions only, so dataset-defined metrics (e.g.
    // ratios) are recomputed per their definition for the totals row instead
    // of summing the displayed cells.
    totalQuery.columns = Array.isArray(fd.groupbyColumns)
      ? [...fd.groupbyColumns]
      : [];
  } else {
    totalQuery.groupby = [];
    totalQuery.columns = [];
  }
  delete totalQuery.row_limit;
  delete totalQuery.orderby;
  delete totalQuery.timeseries_limit_metric;
  if (adhocFilters.length > 0) {
    totalQuery.filters = adhocFilters.map((f) => ({
      col: f.subject ?? f.col ?? "",
      op: f.operator ?? f.op ?? "",
      val: (f.comparator ?? f.val) as string | string[],
    }));
  }
  queries.push(totalQuery);

  const rowDims = Array.isArray(fd.groupbyRows)
    ? fd.groupbyRows
    : Array.isArray(fd.groupby)
      ? fd.groupby
      : [];
  const colDims = Array.isArray(fd.groupbyColumns) ? fd.groupbyColumns : [];
  for (let level = 0; level < rowDims.length - 1; level += 1) {
    const subtotalQuery = buildQueryObject(fd, vizType);
    subtotalQuery.groupby = [];
    subtotalQuery.columns = [...rowDims.slice(0, level + 1), ...colDims];
    delete subtotalQuery.row_limit;
    delete subtotalQuery.orderby;
    delete subtotalQuery.timeseries_limit_metric;
    if (adhocFilters.length > 0) {
      subtotalQuery.filters = adhocFilters.map((f) => ({
        col: f.subject ?? f.col ?? "",
        op: f.operator ?? f.op ?? "",
        val: (f.comparator ?? f.val) as string | string[],
      }));
    }
    queries.push(subtotalQuery);
  }

  return { queries, hasMoreProbe: page != null && !isPivot };
}

/** Parse a chart-data POST response into the result shape above. */
export function parseChartDataResponse(
  results: ChartDataResponseResult[],
  isPivot: boolean,
  page?: number,
  pageSize = PAGE_SIZE,
): ChartDataResult {
  const data = (results[0] || {}) as ChartDataPayload;
  const totalRaw = results[1] as ChartDataResponseResult | undefined;
  const totalRow: ChartDataRow | null =
    totalRaw?.data &&
    Array.isArray(totalRaw.data) &&
    totalRaw.data.length > 0
      ? totalRaw.data[0]
      : null;

  const pivotTotalRows: ChartDataRow[] | undefined =
    isPivot && totalRaw?.data && Array.isArray(totalRaw.data)
      ? totalRaw.data
      : undefined;
  const pivotSubtotalRows: ChartDataRow[][] | undefined = isPivot
    ? results
        .slice(2)
        .map((r) => (r?.data && Array.isArray(r.data) ? r.data : null))
        .filter((v): v is ChartDataRow[] => v !== null)
    : undefined;

  let hasMore: boolean | undefined;
  if (isPivot) {
    hasMore = false;
  } else if (page != null && data && Array.isArray(data.data)) {
    hasMore = data.data.length > pageSize;
    if (hasMore) data.data = data.data.slice(0, pageSize);
  }

  return { data, totalRow, pivotTotalRows, pivotSubtotalRows, hasMore };
}

/** Build the wide-data request body for federated pivot charts. */
export function buildWideRequest(
  dsId: number,
  dsType: string | undefined,
  fd: FormData,
  metrics: unknown[],
  adhocFilters: FilterSpec[],
  force?: boolean,
): WideDataRequest {
  const columns = Array.from(
    new Set([
      ...(Array.isArray(fd.groupbyRows) ? fd.groupbyRows : []),
      ...(Array.isArray(fd.groupbyColumns) ? fd.groupbyColumns : []),
    ]),
  );
  const body: WideDataRequest = {
    datasource: { id: dsId, type: dsType || "table" },
    columns,
    metrics,
    filters: toWideFilters(adhocFilters),
    row_limit: MAX_WIDE_FETCH_ROWS,
  };
  if (force) body.force = true;
  return body;
}

export interface FetchChartDataOptions {
  /** Abort signal forwarded to the underlying axios request. */
  signal?: AbortSignal;
  /** Include the resolved form_data in the POST body (editor/refresh uses it). */
  includeFormData?: boolean;
}

/**
 * Fetch chart data for one chart.  Resolves to an empty payload (never
 * throws) so the dashboard/editor render an empty state on failure.
 */
export async function fetchChartData(
  chart: ChartData | undefined,
  metaMap: Record<number, ChartData>,
  buildAdhocFilters: (dsId: number) => FilterSpec[],
  opts: { force?: boolean; page?: number } & FetchChartDataOptions = {},
): Promise<ChartDataResult> {
  const empty: ChartDataResult = { data: {}, totalRow: null };
  if (!chart) return empty;
  let fd: FormData, dsId: number;
  try {
    const raw = chart.params || chart.form_data || "{}";
    fd = typeof raw === "string" ? (JSON.parse(raw) as FormData) : raw;
    const parsedDsId =
      chart.datasource_id ||
      (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
    dsId = parsedDsId;
    if (!dsId) return empty;
  } catch {
    return empty;
  }

  const vizType = chart.viz_type;
  const query = buildQueryObject(fd, vizType);
  if (!query.metrics || query.metrics.length === 0) return empty;

  const isPivot = vizType === "pivot_table_v2";
  const isFed = isFederatedDataset(dsId);
  const adhocFilters = buildAdhocFilters(dsId);

  if (isPivot && isFed) {
    // Wide-table path: fetch the day-granularity table once and re-aggregate
    // client-side for any row/column layout, so layout changes need no
    // backend round-trip.
    const wideBody = buildWideRequest(
      dsId,
      chart.datasource_type || undefined,
      fd,
      query.metrics ?? [],
      adhocFilters,
      opts.force,
    );
    const data = await fetchWideData(wideBody, opts.signal);
    return { data, totalRow: null, hasMore: false };
  }

  const { queries } = buildQueryPlan(fd, vizType, adhocFilters, {
    isPivot,
    page: opts.page,
  });
  const body: {
    datasource: { id: number; type: string };
    queries: typeof queries;
    result_format: string;
    result_type: string;
    force?: boolean;
    form_data?: FormData;
  } = {
    datasource: { id: dsId, type: chart.datasource_type || "table" },
    queries,
    result_format: "json",
    result_type: "full",
  };
  if (opts.force) body.force = true;
  if (opts.includeFormData) body.form_data = fd;
  const chartDataUrl = getChartDataUrl(dsId);
  const postRes = await api.post(chartDataUrl, body, { signal: opts.signal });
  const results = (
    Array.isArray(postRes.data?.result) ? postRes.data.result : []
  ) as ChartDataResponseResult[];
  const parsed = parseChartDataResponse(results, isPivot, opts.page);

  // Client-side computed columns: sum from detail rows for accuracy. Skip for
  // federated datasets — the backend already returns the correct cross-database
  // grand total for these columns, and the detail rows here are paginated
  // (first page only) which would otherwise undercount the total.
  if (
    !isFed &&
    parsed.totalRow &&
    parsed.data?.data &&
    Array.isArray(parsed.data.data) &&
    parsed.data.data.length > 0
  ) {
    const computedCols = ["分成后流水"];
    for (const col of computedCols) {
      if (col in parsed.totalRow && parsed.data.data.some((r) => col in r)) {
        const sum = parsed.data.data.reduce((acc, r) => {
          const v = Number(r[col]);
          return acc + (Number.isFinite(v) ? v : 0);
        }, 0);
        parsed.totalRow[col] = sum;
      }
    }
  }

  return parsed;
}
