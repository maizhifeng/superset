import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import CloseIcon from "@mui/icons-material/Close";
import FlipIcon from "@mui/icons-material/Flip";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import dayjs from "dayjs";
import api, { getMetricFormatMap } from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { extractQueryFields } from "@/utils/query/extractQueryFields";
import { formatMetricValue } from "@/utils/formatNumber";
import type { MetricFormatMap } from "@/utils/formatNumber";
import type { SimpleFilter, QueryObject } from "@/utils/query/types";
import type { QueryResult, ChartData } from "@/types/api";

interface GameOption {
  papp_id: string;
  papp_name: string;
  上线时间: string;
  cch_name?: string;
}

interface SelectedGame extends GameOption {
  dateRange: { start: string; end: string };
}

const PERIODS = [
  { label: "上线后 7 天", days: 7 },
  { label: "上线后 14 天", days: 14 },
  { label: "上线后 30 天", days: 30 },
  { label: "上线后 60 天", days: 60 },
  { label: "上线后 90 天", days: 90 },
];

function fmtValue(key: string, value: unknown, formatMap?: MetricFormatMap): string {
  return formatMetricValue(key, value, formatMap);
}

const extractName = (val: string) => val.replace(/\s*\([^)]*\)$/, '').trim();

interface CompareModalProps {
  open: boolean;
  chartId: number | null;
  onClose: () => void;
  chartData?: Record<string, unknown>;
  chartMeta?: ChartData;
}

// Hardcoded actual column names from the dataset
const COL = {
  papp_name: "主游戏",
  papp_id: "主游戏[ID]",
  report_date_calc: "日期",
  cch_name: "渠道商",
  cch_name_id: "渠道商[ID]",
  channel_name: "媒体",
  ad_real_cost: "ad_real_cost",
  n_unum: "n_unum",
};

export default function CompareModal({ open, chartId, onClose, chartData, chartMeta }: CompareModalProps) {
  const [games, setGames] = useState<GameOption[]>([]);
  const [selectedGames, setSelectedGames] = useState<SelectedGame[]>([]);
  const [primaryPappId, setPrimaryPappId] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [timeGrain, setTimeGrain] = useState("P1D");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [cchNameInput, setCchNameInput] = useState("");
  const [selectedCchNames, setSelectedCchNames] = useState<string[]>([]);
  const [channelInput, setChannelInput] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [chartFormData, setChartFormData] = useState<Record<string, unknown> | null>(null);
  const [chartVizType, setChartVizType] = useState<string | undefined>(undefined);
  const [chartDsId, setChartDsId] = useState<number | null>(null);
  const [chartDsType, setChartDsType] = useState<string>("table");
  const [cchNameValues, setCchNameValues] = useState<string[]>([]);
  const [channelValues, setChannelValues] = useState<string[]>([]);
  const [hoveredCell, setHoveredCell] = useState<{ table: "primary" | "secondary"; row: number } | null>(null);
  const [metricFormatMap, setMetricFormatMap] = useState<MetricFormatMap>({});
  const [intraSecondaryResult, setIntraSecondaryResult] = useState<{ columns: { name: string; type?: string }[]; data: Record<string, unknown>[] } | null>(null);
  const intraSecondaryAggRef = useRef<Record<string, unknown> | null>(null);
  const queryFilterSnapshot = useRef<{ games: SelectedGame[]; cchNames: string[]; channels: string[] } | null>(null);
  const sectionAggregateCacheRef = useRef<Record<string, Record<string, unknown>>>({});
  const scrollRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const syncDisabled = useRef(false);

  const scrollByStep = useCallback((dir: -1 | 1) => {
    const containers = Array.from(scrollRefs.current.values());
    if (containers.length === 0) return;
    syncDisabled.current = true;
    const targetLeft = dir > 0 ? containers[0].scrollWidth : 0;
    for (const el of containers) {
      el.scrollTo({ left: targetLeft, behavior: "smooth" });
    }
    setTimeout(() => { syncDisabled.current = false; }, 350);
  }, []);

  const cchNameOptions = useMemo(() => {
    return cchNameValues.filter((v) => !selectedCchNames.includes(v));
  }, [cchNameValues, selectedCchNames]);

  const channelOptions = useMemo(() => {
    return channelValues.filter((v) => !selectedChannels.includes(v));
  }, [channelValues, selectedChannels]);

  useEffect(() => {
    if (!open) {
      setChartFormData(null);
      setChartVizType(undefined);
      setChartDsId(null);
      setChartDsType("table");
      setQueryResult(null);
      setError(null);
      setSelectedGames([]);
      setSelectedCchNames([]);
      setSelectedChannels([]);
      setCchNameValues([]);
      setChannelValues([]);
      setGames([]);
      setPrimaryPappId(null);
      setMetricFormatMap({});
    setIntraSecondaryResult(null);
    intraSecondaryAggRef.current = null;
      queryFilterSnapshot.current = null;
      sectionAggregateCacheRef.current = {};
      intraSecondaryAggRef.current = null;
      return;
    }
    setLoading(true);
    setError(null);
    let cancelled = false;

    // Fetch column values for filter autocompletes
    const fetchColumnValues = (id: number) => {
      api
        .get<{ result: (string | null)[] }>(
          `/datasource/table/${id}/column/${encodeURIComponent(COL.cch_name_id)}/values/`,
        )
        .then((res) => {
          if (cancelled) return;
          const vals = (res.data.result ?? []).filter((v): v is string => v != null);
          setCchNameValues(vals.sort());
        })
        .catch(() => {});
      api
        .get<{ result: (string | null)[] }>(
          `/datasource/table/${id}/column/${encodeURIComponent(COL.channel_name)}/values/`,
        )
        .then((res) => {
          if (cancelled) return;
          const vals = (res.data.result ?? []).filter((v): v is string => v != null);
          setChannelValues(vals.sort());
        })
        .catch(() => {});
    };

    // Initialise chart form data synchronously from chartMeta
    if (chartId && chartMeta) {
      const raw = chartMeta.params || chartMeta.form_data || "{}";
      const fd = typeof raw === "string" ? JSON.parse(raw) : raw;
      setChartFormData(fd);
      setChartVizType(chartMeta.viz_type);
      if (chartMeta.datasource_type) setChartDsType(chartMeta.datasource_type);
      const dsId =
        chartMeta.datasource_id ??
        (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : null);
      setChartDsId(dsId);
      if (dsId) {
        fetchColumnValues(dsId);
        getMetricFormatMap(dsId).then((m) => { if (!cancelled) setMetricFormatMap(m); }).catch(() => {});
      }
    } else if (chartId) {
      // Fallback: fetch chart metadata from API
      (async () => {
        try {
          const res = await api.get<{ result: ChartData }>(`/chart/${chartId}`);
          const chart = res.data.result;
          const raw = chart.params || chart.form_data || "{}";
          const fd = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (cancelled) return;
          setChartFormData(fd);
          setChartVizType(chart.viz_type);
          if (chart.datasource_type) setChartDsType(chart.datasource_type);
          const dsId =
            chart.datasource_id ??
            (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : null);
          if (cancelled) return;
          setChartDsId(dsId);
          if (dsId) {
            fetchColumnValues(dsId);
            getMetricFormatMap(dsId).then((m) => { if (!cancelled) setMetricFormatMap(m); }).catch(() => {});
          }
        } catch {
          // ignore
        }
      })();
    }

    // Games list — fires in parallel with column value calls
    api
      .get<{ result: { papp_id: number; papp_name: string; 上线时间: string; cch_name?: string }[] }>(
        "/project/papp",
      )
      .then((res) => {
        if (cancelled) return;
        const list = (res.data.result ?? []).map((r) => ({
          papp_id: String(r.papp_id),
          papp_name: r.papp_name ?? "",
          上线时间: r.上线时间 ?? "",
          cch_name: r.cch_name ?? "",
        }));
        setGames(list.filter((g) => g.上线时间));
      })
      .catch((err) => {
        if (!cancelled) setError(parseErrorMessage(err, "加载游戏失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, chartId, chartMeta]);

  const gameOptions = useMemo(
    () =>
      games.filter(
        (g) => !selectedGames.some((sg) => sg.papp_id === g.papp_id),
      ),
    [games, selectedGames],
  );

  const removeGame = useCallback((pappId: string) => {
    setSelectedGames((prev) => prev.filter((g) => g.papp_id !== pappId));
  }, []);

  useEffect(() => {
    setSelectedGames((prev) =>
      prev.map((g) => {
        if (!g.上线时间) return g;
        const start = dayjs(g.上线时间);
        if (!start.isValid()) return g;
        return {
          ...g,
          dateRange: {
            start: start.format("YYYY/MM/DD"),
            end: start.add(periodDays, "day").format("YYYY/MM/DD"),
          },
        };
      }),
    );
  }, [periodDays]);

  const handleQuery = useCallback(async () => {
    if (selectedGames.length === 0 || !chartFormData || !chartDsId) return;
    setLoading(true);
    setQueryResult(null);
    setError(null);
    setIntraSecondaryResult(null);

    try {
      const timeCol =
        (chartFormData.granularity_sqla as string) || COL.report_date_calc;

      const compareDimensions = [COL.papp_name];
      if (selectedCchNames.length > 0) compareDimensions.push(COL.cch_name);
      if (selectedChannels.length > 0) compareDimensions.push(COL.channel_name);
      compareDimensions.push(timeCol);

      const timeGrainSql = timeGrain === "P1D" ? undefined : timeGrain;
      const BATCH = 3;

      // Build detail queries (one per game, full dimensions)
      let detailRows: Record<string, unknown>[] = [];
      let colNames: string[] = [];

      for (let i = 0; i < selectedGames.length; i += BATCH) {
        const batch = selectedGames.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(async (game) => {
            const q: QueryObject = {
              result_type: "full",
              metrics: extractQueryFields(chartFormData, chartVizType).metrics,
              groupby: compareDimensions,
              columns: [],
              filters: [
                { col: COL.papp_id, op: "IN", val: [`${game.papp_name} (${game.papp_id})`] },
                ...(selectedCchNames.length > 0 ? [{ col: COL.cch_name_id, op: "IN", val: selectedCchNames }] : []),
                ...(selectedChannels.length > 0 ? [{ col: COL.channel_name, op: "IN", val: selectedChannels }] : []),
              ],
              granularity: (chartFormData.granularity_sqla as string) || undefined,
            };
            if (timeCol) {
              q.orderby = [[timeCol, true]];
              (q.filters as SimpleFilter[]).push({ col: timeCol, op: ">=", val: game.dateRange.start });
              (q.filters as SimpleFilter[]).push({ col: timeCol, op: "<=", val: game.dateRange.end });
            }
            if (timeGrainSql && timeCol) {
              q.granularity = timeCol;
              q.extras = { time_grain_sqla: timeGrainSql };
            }
            const payload = {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [q],
              result_format: "json",
              result_type: "full" as const,
              force: true,
            };
            const res = await api.post("/chart/data", payload);
            const results = (Array.isArray(res.data?.result) ? res.data.result : []) as Record<string, unknown>[];
            const rows: Record<string, unknown>[] = [];
            for (const r of results) {
              const data = r.data as Record<string, unknown>[] | undefined;
              if (data && Array.isArray(data)) rows.push(...data);
            }
            return rows;
          }),
        );
        for (const rows of batchResults) {
          detailRows.push(...rows);
        }
      }

      // Get colnames from first result, filter out internal fields
      if (detailRows.length > 0) {
        colNames = Object.keys(detailRows[0]).filter((k) => k !== "id" && k !== "treePath");
      }

      // Intra-project secondary query: when 1 game + at least 1 filter level
      // Must run BEFORE the detailRows early return so the secondary can still show data
      // even when the primary filter matches nothing.
      let secondaryResult: { columns: { name: string; type?: string }[]; data: Record<string, unknown>[] } | null = null;
      if (selectedGames.length === 1 && selectedCchNames.length <= 1 && selectedChannels.length <= 1 && (selectedCchNames.length > 0 || selectedChannels.length > 0)) {
        const game = selectedGames[0];
        const sharedMetrics = extractQueryFields(chartFormData, chartVizType).metrics;
        const baseFilters: SimpleFilter[] = [{ col: COL.papp_id, op: "IN", val: [`${game.papp_name} (${game.papp_id})`] }];
        if (timeCol) {
          baseFilters.push({ col: timeCol, op: ">=", val: game.dateRange.start });
          baseFilters.push({ col: timeCol, op: "<=", val: game.dateRange.end });
        }

        if (selectedChannels.length > 0) {
          const secFilters = [...baseFilters];
          if (selectedCchNames.length > 0) secFilters.push({ col: COL.cch_name_id, op: "IN", val: selectedCchNames });
          secFilters.push({ col: COL.channel_name, op: "NOT IN", val: selectedChannels });
          const secGroupby = [COL.papp_name, COL.cch_name];
          if (timeCol) secGroupby.push(timeCol);
          const secQuery1: Record<string, unknown> = {
            result_type: "full" as const,
            metrics: sharedMetrics,
            groupby: secGroupby,
            columns: [],
            filters: secFilters,
            orderby: timeCol ? [[timeCol, true]] : undefined,
            granularity: timeGrainSql && timeCol ? timeCol : undefined,
            extras: timeGrainSql && timeCol ? { time_grain_sqla: timeGrainSql } as Record<string, unknown> : undefined,
          };
          try {
            const res = await api.post("/chart/data", {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [secQuery1],
              result_format: "json" as const, result_type: "full" as const, force: true,
            });
            const results = (Array.isArray(res.data?.result) ? res.data.result : []) as Record<string, unknown>[];
            for (const r of results) {
              const data = r.data as Record<string, unknown>[] | undefined;
              if (data && Array.isArray(data) && data.length > 0) {
                secondaryResult = {
                  columns: Object.keys(data[0]).filter((k) => k !== "id").map((name) => {
                    let dn = name;
                    if (name === timeCol) dn = timeGrain === "P1W" ? "周" : timeGrain === "P1M" ? "月" : "日期";
                    const m = name.match(/^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/);
                    if (m) dn = m[2];
                    return { name, type: "VARCHAR" as const, displayName: dn };
                  }),
                  data,
                };
                break;
              }
            }
          } catch { /* secondary failed silently */ }
        } else if (selectedCchNames.length > 0) {
          const secFilters = [...baseFilters];
          secFilters.push({ col: COL.cch_name_id, op: "NOT IN", val: selectedCchNames });
          const secGroupby = [COL.papp_name];
          if (timeCol) secGroupby.push(timeCol);
          const secQuery2: Record<string, unknown> = {
            result_type: "full" as const,
            metrics: sharedMetrics,
            groupby: secGroupby,
            columns: [],
            filters: secFilters,
            orderby: timeCol ? [[timeCol, true]] : undefined,
            granularity: timeGrainSql && timeCol ? timeCol : undefined,
            extras: timeGrainSql && timeCol ? { time_grain_sqla: timeGrainSql } as Record<string, unknown> : undefined,
          };
          try {
            const res = await api.post("/chart/data", {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [secQuery2],
              result_format: "json" as const, result_type: "full" as const, force: true,
            });
            const results = (Array.isArray(res.data?.result) ? res.data.result : []) as Record<string, unknown>[];
            for (const r of results) {
              const data = r.data as Record<string, unknown>[] | undefined;
              if (data && Array.isArray(data) && data.length > 0) {
                secondaryResult = {
                  columns: Object.keys(data[0]).filter((k) => k !== "id").map((name) => {
                    let dn = name;
                    if (name === timeCol) dn = timeGrain === "P1W" ? "周" : timeGrain === "P1M" ? "月" : "日期";
                    const m = name.match(/^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/);
                    if (m) dn = m[2];
                    return { name, type: "VARCHAR" as const, displayName: dn };
                  }),
                  data,
                };
                break;
              }
            }
          } catch { /* secondary failed silently */ }
        }
        // Secondary aggregate query (without timeCol — one total row)
        if (secondaryResult && secondaryResult.data.length > 0) {
          try {
            const aggFilters: SimpleFilter[] = [{ col: COL.papp_id, op: "IN", val: [`${game.papp_name} (${game.papp_id})`] }];
            if (selectedChannels.length > 0) {
              if (selectedCchNames.length > 0) aggFilters.push({ col: COL.cch_name_id, op: "IN", val: selectedCchNames });
              aggFilters.push({ col: COL.channel_name, op: "NOT IN", val: selectedChannels });
            } else if (selectedCchNames.length > 0) {
              aggFilters.push({ col: COL.cch_name_id, op: "NOT IN", val: selectedCchNames });
            }
            if (timeCol) {
              aggFilters.push({ col: timeCol, op: ">=", val: game.dateRange.start });
              aggFilters.push({ col: timeCol, op: "<=", val: game.dateRange.end });
            }
            const aggRes = await api.post("/chart/data", {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [{ result_type: "full" as const, metrics: sharedMetrics, groupby: [COL.papp_name], columns: [], filters: aggFilters }],
              result_format: "json" as const, result_type: "full" as const, force: true,
            });
            const aggResults = (Array.isArray(aggRes.data?.result) ? aggRes.data.result : []) as Record<string, unknown>[];
            for (const r of aggResults) {
              const data = r.data as Record<string, unknown>[] | undefined;
              if (data && data.length > 0) { intraSecondaryAggRef.current = data[0]; break; }
            }
          } catch { /* secondary agg failed */ }
        }
        // Format time column in secondary data and sort by date (same logic as primary)
        if (secondaryResult && timeCol && secondaryResult.data.length > 0) {
          for (const row of secondaryResult.data) {
            const raw = row[timeCol];
            if (raw != null && typeof raw === "number") {
              let formatted: string;
              if (timeGrain === "P1W") {
                const start = new Date(Number.isFinite(raw) ? raw : 0);
                if (!isNaN(start.getTime())) {
                  const end = new Date(start);
                  end.setDate(end.getDate() + 6);
                  formatted = `${String(start.getMonth() + 1).padStart(2, "0")}/${String(start.getDate()).padStart(2, "0")}-${String(end.getMonth() + 1).padStart(2, "0")}/${String(end.getDate()).padStart(2, "0")}`;
                } else { formatted = String(raw); }
              } else if (timeGrain === "P1M") {
                const d = new Date(Number.isFinite(raw) ? raw : 0);
                formatted = !isNaN(d.getTime()) ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}` : String(raw);
              } else {
                const d = new Date(Number.isFinite(raw) ? raw : 0);
                formatted = !isNaN(d.getTime()) ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}` : String(raw);
              }
              row[timeCol] = formatted;
            }
          }
          secondaryResult.data.sort((a, b) => {
            const va = a[timeCol];
            const vb = b[timeCol];
            if (typeof va === "number" && typeof vb === "number") return va - vb;
            return String(va).localeCompare(String(vb));
          });
        }
      }
      setIntraSecondaryResult(secondaryResult);

      if (detailRows.length === 0) {
        setQueryResult({ status: "success", columns: [], data: [] });
        setLoading(false);
        return;
      }

      // Format time column
      for (const row of detailRows) {
        const raw = row[timeCol];
        if (raw != null) {
          let formatted: string;
          if (timeGrain === "P1W") {
            const start = new Date(typeof raw === "number" ? raw : String(raw));
            if (!isNaN(start.getTime())) {
              const end = new Date(start);
              end.setDate(end.getDate() + 6);
              formatted = `${String(start.getMonth() + 1).padStart(2, "0")}/${String(start.getDate()).padStart(2, "0")}-${String(end.getMonth() + 1).padStart(2, "0")}/${String(end.getDate()).padStart(2, "0")}`;
            } else { formatted = String(raw); }
          } else if (timeGrain === "P1M") {
            const d = new Date(typeof raw === "number" ? raw : String(raw));
            if (!isNaN(d.getTime())) { formatted = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`; } else { formatted = String(raw); }
          } else {
            const ts = typeof raw === "number" ? raw : Number(raw);
            const d = new Date(Number.isFinite(ts) ? ts : String(raw));
            if (!isNaN(d.getTime())) { formatted = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`; } else { formatted = String(raw); }
          }
          row[timeCol] = formatted;
        }
      }

      // Fetch aggregate per game — bare query, no form_data to avoid granularity leak
      let aggRows: Record<string, unknown>[] = [];
      for (let i = 0; i < selectedGames.length; i += BATCH) {
        const batch = selectedGames.slice(i, i + BATCH);
        const batchAggs = await Promise.all(
          batch.map(async (game) => {
            const filters: SimpleFilter[] = [{ col: COL.papp_id, op: "IN", val: [`${game.papp_name} (${game.papp_id})`] }];
            if (selectedCchNames.length > 0) filters.push({ col: COL.cch_name_id, op: "IN", val: selectedCchNames });
            if (selectedChannels.length > 0) filters.push({ col: COL.channel_name, op: "IN", val: selectedChannels });
            if (timeCol) {
              filters.push({ col: timeCol, op: ">=", val: game.dateRange.start });
              filters.push({ col: timeCol, op: "<=", val: game.dateRange.end });
            }
            const payload = {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [{
                result_type: "full",
                metrics: extractQueryFields(chartFormData, chartVizType).metrics,
                groupby: [COL.papp_name],
                columns: [],
                filters,
              }],
              result_format: "json",
              result_type: "full" as const,
              force: true,
            };
            try {
              const res = await api.post("/chart/data", payload);
              const results = (Array.isArray(res.data?.result) ? res.data.result : []) as Record<string, unknown>[];
              const rows: Record<string, unknown>[] = [];
              for (const r of results) {
                const data = r.data as Record<string, unknown>[] | undefined;
                if (data && Array.isArray(data)) rows.push(...data);
              }
              return rows;
            } catch { return [] as Record<string, unknown>[]; }
          }),
        );
        for (const rows of batchAggs) aggRows.push(...rows);
      }

      // Build tree rows: aggregate rows (parents) + detail rows (children)
      const treeRows: Record<string, unknown>[] = [];
      let rowId = 0;
      const pappNameMap = new Map<string, string>();
      for (const g of selectedGames) pappNameMap.set(g.papp_name, g.papp_id);

      // Add parent rows from aggregate
      for (const aggRow of aggRows) {
        const pname = String(aggRow[COL.papp_name] ?? "");
        treeRows.push({ ...aggRow, id: `p_${rowId++}`, treePath: [pname] });
      }

      // Add child rows from detail data
      for (const detRow of detailRows) {
        const pname = String(detRow[COL.papp_name] ?? "");
        const cch = selectedCchNames.length > 0 ? String(detRow[COL.cch_name] ?? "") : "";
        const tval = String(detRow[timeCol] ?? "");
        treeRows.push({ ...detRow, id: `c_${rowId++}`, treePath: [pname, cch || tval, cch ? tval : undefined].filter(Boolean) });
      }

      const columns = colNames.map((name: string) => {
        let displayName = name;
        if (name === timeCol) {
          displayName = timeGrain === "P1W" ? "周" : timeGrain === "P1M" ? "月" : "日期";
        }
        const match = name.match(/^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/);
        if (match) displayName = match[2];
        return { name, type: "VARCHAR", displayName };
      });

      // Per-section aggregate queries (for cross-comparison sections)
      const sectionAggs: Record<string, Record<string, unknown>> = {};
      const sharedMetrics = extractQueryFields(chartFormData, chartVizType).metrics;
      const timeFilters: SimpleFilter[] = timeCol && selectedGames[0] ? [
        { col: timeCol, op: ">=", val: selectedGames[0].dateRange.start },
        { col: timeCol, op: "<=", val: selectedGames[0].dateRange.end },
      ] : [];
      const gameFilter: SimpleFilter | null = selectedGames.length > 0 ? {
        col: COL.papp_id, op: "IN",
        val: selectedGames.map((g) => `${g.papp_name} (${g.papp_id})`),
      } : null;
      // Build per-section aggregate queries
      if (selectedCchNames.length > 1) {
        for (const cch of selectedCchNames) {
          const filters: SimpleFilter[] = timeFilters;
          if (gameFilter) filters.push(gameFilter);
          filters.push({ col: COL.cch_name_id, op: "IN", val: [cch] });
          if (selectedChannels.length > 0) filters.push({ col: COL.channel_name, op: "IN", val: selectedChannels });
          try {
            const res = await api.post("/chart/data", {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [{ result_type: "full" as const, metrics: sharedMetrics, groupby: [COL.cch_name], columns: [], filters }],
              result_format: "json" as const, result_type: "full" as const, force: true,
            });
            const results = (Array.isArray(res.data?.result) ? res.data.result : []) as Record<string, unknown>[];
            for (const r of results) {
              const data = r.data as Record<string, unknown>[] | undefined;
              if (data && data.length > 0) { sectionAggs[extractName(cch)] = data[0]; break; }
            }
          } catch { /* aggregate query failed */ }
        }
      } else if (selectedChannels.length > 1) {
        for (const ch of selectedChannels) {
          const filters: SimpleFilter[] = timeFilters;
          if (gameFilter) filters.push(gameFilter);
          if (selectedCchNames.length > 0) filters.push({ col: COL.cch_name_id, op: "IN", val: selectedCchNames });
          filters.push({ col: COL.channel_name, op: "IN", val: [ch] });
          try {
            const res = await api.post("/chart/data", {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [{ result_type: "full" as const, metrics: sharedMetrics, groupby: [COL.channel_name], columns: [], filters }],
              result_format: "json" as const, result_type: "full" as const, force: true,
            });
            const results = (Array.isArray(res.data?.result) ? res.data.result : []) as Record<string, unknown>[];
            for (const r of results) {
              const data = r.data as Record<string, unknown>[] | undefined;
              if (data && data.length > 0) { sectionAggs[ch] = data[0]; break; }
            }
          } catch { /* aggregate query failed */ }
        }
      } else if (selectedGames.length > 1) {
        for (const g of selectedGames) {
          const filters: SimpleFilter[] = timeFilters;
          filters.push({ col: COL.papp_id, op: "IN", val: [`${g.papp_name} (${g.papp_id})`] });
          if (selectedCchNames.length > 0) filters.push({ col: COL.cch_name_id, op: "IN", val: selectedCchNames });
          if (selectedChannels.length > 0) filters.push({ col: COL.channel_name, op: "IN", val: selectedChannels });
          try {
            const res = await api.post("/chart/data", {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [{ result_type: "full" as const, metrics: sharedMetrics, groupby: [COL.papp_name], columns: [], filters }],
              result_format: "json" as const, result_type: "full" as const, force: true,
            });
            const results = (Array.isArray(res.data?.result) ? res.data.result : []) as Record<string, unknown>[];
            for (const r of results) {
              const data = r.data as Record<string, unknown>[] | undefined;
              if (data && data.length > 0) { sectionAggs[g.papp_name] = data[0]; break; }
            }
          } catch { /* aggregate query failed */ }
        }
      }
      sectionAggregateCacheRef.current = sectionAggs;

      setQueryResult({ status: "success", columns, data: treeRows });
      queryFilterSnapshot.current = {
        games: selectedGames.map((g) => ({ ...g })),
        cchNames: [...selectedCchNames],
        channels: [...selectedChannels],
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: Record<string, unknown> } };
      const respData = axiosErr?.response?.data || {};
      const serverMsg = (respData as Record<string, unknown>).message || (respData as Record<string, unknown>).error || JSON.stringify(respData);
      setError(typeof serverMsg === "string" ? serverMsg : "查询失败");
    } finally {
      setLoading(false);
    }
  }, [selectedGames, chartFormData, chartDsId, chartVizType, selectedCchNames, selectedChannels, timeGrain, cchNameOptions, channelOptions, metricFormatMap]);

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") onClose();
      }}
      maxWidth="xl"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(4px)",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
          },
        },
        paper: {
          sx: {
            borderRadius: 3,
            height: "95vh",
            maxWidth: 1600,
            boxShadow: "0 8px 40px rgba(0, 0, 0, 0.24)",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          bgcolor: "grey.50",
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 3,
          py: 1.5,
        }}
      >
        <FlipIcon sx={{ fontSize: 22, color: "primary.main" }} />
        <Typography variant="body1" sx={{ fontWeight: 600, flex: 1, fontSize: "1.1rem" }}>
          周期对比
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {PERIODS.map((p) => (
            <Chip
              key={p.days}
              label={p.label}
              size="small"
              variant={periodDays === p.days ? "filled" : "outlined"}
              color={periodDays === p.days ? "primary" : "default"}
              onClick={() => setPeriodDays(p.days)}
              sx={{ cursor: "pointer" }}
            />
          ))}
        </Box>
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          {["P1D", "P1W", "P1M"].map((g) => (
            <Chip
              key={g}
              label={g === "P1D" ? "日" : g === "P1W" ? "周" : "月"}
              size="small"
              variant={timeGrain === g ? "filled" : "outlined"}
              color={timeGrain === g ? "secondary" : "default"}
              onClick={() => setTimeGrain(g)}
              sx={{ cursor: "pointer", minWidth: 28 }}
            />
          ))}
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={handleQuery}
          disabled={selectedGames.length === 0 || loading || !chartFormData}
          title=""
          sx={{ ml: 1 }}
        >
          {loading ? "..." : "查询"}
        </Button>
        <IconButton size="small" onClick={() => scrollByStep(-1)} title="向左滚动">
          <ChevronLeft />
        </IconButton>
        <IconButton size="small" onClick={() => scrollByStep(1)} title="向右滚动">
          <ChevronRight />
        </IconButton>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3, pt: "12px !important", overflow: "hidden" }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
          <Box sx={{ position: "relative" }}>
            <Autocomplete
              multiple
              value={selectedGames}
              inputValue={inputValue}
              onInputChange={(_, v) => setInputValue(v)}
              options={gameOptions}
              getOptionLabel={(o) => `${o.papp_name}${o.cch_name ? ` - ${o.cch_name}` : ""} (${o.papp_id})`}
            onChange={(_, value) => {
              setSelectedGames(
                value.map((g: GameOption | SelectedGame) => {
                  if ("dateRange" in g && g.dateRange) return g as SelectedGame;
                  const sg = g as GameOption;
                  const start = dayjs(sg.上线时间);
                  if (!start.isValid()) return sg as unknown as SelectedGame;
                  return {
                    ...sg,
                    dateRange: {
                      start: start.format("YYYY/MM/DD"),
                      end: start.add(periodDays, "day").format("YYYY/MM/DD"),
                    },
                  } as SelectedGame;
                }),
              );
              const newIds = value.map((v: GameOption) => v.papp_id);
              if (newIds.length > 0 && !newIds.includes(primaryPappId ?? "")) {
                setPrimaryPappId(newIds[0]);
              }
              if (newIds.length === 0) setPrimaryPappId(null);
            }}
            filterSelectedOptions
            disableCloseOnSelect
            openOnFocus
            autoHighlight
            noOptionsText="无匹配"
            sx={{
              minWidth: 250,
              maxWidth: 400,
              "& .MuiInputBase-root": { minHeight: 36 },
              "& .MuiInputBase-input": {
                py: 0.5,
                fontSize: "0.8125rem",
                minWidth: 60,
              },
            }}
            slotProps={{
              chip: { size: "small", sx: { height: 20 } },
              popper: {
                sx: {
                  "& .MuiAutocomplete-listbox .MuiAutocomplete-option": {
                    minHeight: 28,
                    fontSize: "0.8125rem",
                  },
                  "& .MuiPaper-root": {
                    border: "1px solid",
                    borderColor: "divider",
                  },
                },
              },
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="选择要对比的游戏"
                placeholder={selectedGames.length > 0 ? "" : "按游戏名称或 ID 搜索"}
                size="small"
              />
            )}
          />
          {selectedGames.length > 1 && (
            <Box sx={{ position: "absolute", top: -8, right: -8, px: 0.75, py: 0.15, borderRadius: "3px", bgcolor: "#d32f2f", color: "#fff", fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
              <Box sx={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff", mr: 0.5, verticalAlign: "middle" }} />
              外对比
            </Box>
          )}
          </Box>
          <Box sx={{ position: "relative" }}>
          <Autocomplete
            multiple
            value={selectedCchNames}
            inputValue={cchNameInput}
            onInputChange={(_, v) => setCchNameInput(v)}
            options={cchNameOptions}
            onChange={(_, value) => setSelectedCchNames(value)}
            filterSelectedOptions
            disableCloseOnSelect
            size="small"
            sx={{ minWidth: 200, maxWidth: 300 }}
            noOptionsText="无选项"
            renderInput={(params) => (
              <TextField {...params} label={COL.cch_name_id} placeholder="选择渠道商" />
            )}
          />
          {(() => {
            if (selectedCchNames.length > 1) {
              return <Box sx={{ position: "absolute", top: -8, right: -8, px: 0.75, py: 0.15, borderRadius: "3px", bgcolor: "#d32f2f", color: "#fff", fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
                <Box sx={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff", mr: 0.5, verticalAlign: "middle" }} />
                外对比
              </Box>;
            }
            if (selectedGames.length === 1 && selectedCchNames.length === 1 && selectedChannels.length <= 1) {
              return <Box sx={{ position: "absolute", top: -8, right: -8, px: 0.75, py: 0.15, borderRadius: "3px", bgcolor: "#0288d1", color: "#fff", fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
                <Box sx={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff", mr: 0.5, verticalAlign: "middle" }} />
                内对比
              </Box>;
            }
            return null;
          })()}
          </Box>
          <Box sx={{ position: "relative" }}>
          <Autocomplete
            multiple
            value={selectedChannels}
            inputValue={channelInput}
            onInputChange={(_, v) => setChannelInput(v)}
            options={channelOptions}
            onChange={(_, value) => setSelectedChannels(value)}
            filterSelectedOptions
            disableCloseOnSelect
            size="small"
            sx={{ minWidth: 200, maxWidth: 300 }}
            noOptionsText="无选项"
            renderInput={(params) => (
              <TextField {...params} label={COL.channel_name} placeholder="选择媒体" />
            )}
          />
          {(() => {
            if (selectedChannels.length > 1) {
              return <Box sx={{ position: "absolute", top: -8, right: -8, px: 0.75, py: 0.15, borderRadius: "3px", bgcolor: "#d32f2f", color: "#fff", fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
                <Box sx={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff", mr: 0.5, verticalAlign: "middle" }} />
                外对比
              </Box>;
            }
            if (selectedGames.length === 1 && selectedChannels.length === 1 && selectedCchNames.length <= 1) {
              return <Box sx={{ position: "absolute", top: -8, right: -8, px: 0.75, py: 0.15, borderRadius: "3px", bgcolor: "#0288d1", color: "#fff", fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
                <Box sx={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff", mr: 0.5, verticalAlign: "middle" }} />
                内对比
              </Box>;
            }
            return null;
          })()}
          </Box>
          {(() => {
            const isIntra = selectedGames.length === 1 && selectedCchNames.length <= 1 && selectedChannels.length <= 1 && (selectedCchNames.length > 0 || selectedChannels.length > 0);
            const isInter = selectedCchNames.length > 1 || selectedChannels.length > 1 || selectedGames.length > 1;
            if (!isIntra && !isInter) return null;
            const sectionCount = selectedGames.length > 1 ? selectedGames.length : (selectedCchNames.length > 1 ? selectedCchNames.length : selectedChannels.length);
            const showWarning = isInter && sectionCount > 4;
            return (
              <>
              <Box sx={{ ml: "auto", alignSelf: "center", color: "text.secondary", fontSize: "0.8125rem", whiteSpace: "nowrap", px: 1, py: 0.25, borderRadius: "4px", bgcolor: isIntra ? "rgba(2,136,209,0.06)" : "rgba(211,47,47,0.06)", border: "1px dashed", borderColor: isIntra ? "rgba(2,136,209,0.3)" : "rgba(211,47,47,0.3)" }}>
                {isIntra ? "选定为主表，其他为次表" : `维度组合独立分表 (${sectionCount}项)`}
              </Box>
              {showWarning && (
                <Box sx={{ alignSelf: "center", px: 1, py: 0.15, borderRadius: "3px", bgcolor: "rgba(245,124,0,0.12)", border: "1px solid", borderColor: "rgba(245,124,0,0.4)", color: "#e65100", fontSize: "0.7rem", whiteSpace: "nowrap", fontWeight: 600 }}>
                  ⚠ 项目较多，可能影响性能
                </Box>
              )}
              </>
            );
          })()}
        </Box>

        {selectedGames.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "nowrap", gap: 0.5, overflowX: "auto", minHeight: 0, pb: 0.5 }}>
            {selectedGames.map((g) => (
              <Chip
                key={g.papp_id}
                icon={g.papp_id === primaryPappId ? <Box component="span" sx={{ fontSize: 10, ml: 0.25 }}>★</Box> : undefined}
                label={`${g.papp_name}${g.cch_name ? ` - ${g.cch_name}` : ""} (${g.dateRange.start} ~ ${g.dateRange.end})`}
                onDelete={() => removeGame(g.papp_id)}
                onClick={() => setPrimaryPappId(g.papp_id)}
                size="small"
                color={g.papp_id === primaryPappId ? "primary" : "default"}
                variant={g.papp_id === primaryPappId ? "filled" : "outlined"}
                sx={{ fontSize: "0.7rem", "& .MuiChip-label": { px: 0.75 } }}
              />
            ))}
          </Box>
        )}

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        {queryResult && (() => {
          const columns = queryResult.columns;

          if (queryResult.data.length === 0) {
            return (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">选定周期未找到数据</Typography>
              </Box>
            );
          }

          const cellSx = (colIdx: number, zSticky: number) => {
            const base = { px: 0.75, py: 0.25, textAlign: "center", fontSize: "0.75rem", whiteSpace: "nowrap", border: "none", outline: "1px solid", outlineColor: "divider" };
            const left = colStickyLeft[colIdx];
            if (left === undefined) return base;
            return { ...base, position: "sticky" as const, left, zIndex: zSticky, bgcolor: "background.paper" };
          };
          const thSx = (colIdx: number) => {
            const base = cellSx(colIdx, 5);
            const left = colStickyLeft[colIdx];
            return { ...base, position: "sticky" as const, top: 0, zIndex: 6, bgcolor: "grey.50", fontWeight: 700, ...(left !== undefined ? { left, zIndex: 7 } : {}) };
          };
          const groupSx = (colIdx: number) => ({ ...cellSx(colIdx, 4), fontWeight: colIdx === 0 ? 700 : 400 } as const);
          const dataSx = (colIdx: number) => cellSx(colIdx, 1);

          // Calculate column widths based on content type
          const colWidths = columns.map((col) => {
            const n = col.name;
            const dn = (col as any).displayName;
            if (n === COL.papp_name) return 180;
            if (dn === "月" || dn === "周" || dn === "日期") return 110;
            if (n === COL.ad_real_cost || n === COL.n_unum) return 80;
            if (n.startsWith("ltv_") || n.startsWith("roi_")) return 70;
            return 72;
          });

          const isDimCol = (n: string, displayName: string) =>
            n === COL.papp_name || n === COL.cch_name || n === COL.cch_name_id || n === COL.channel_name || displayName === "月" || displayName === "周" || displayName === "日期";

          // Compute sticky left offsets for dimension columns
          const colStickyLeft = columns.map((col, i) => {
            const dn = (col as any).displayName ?? col.name;
            if (!isDimCol(col.name, dn)) return undefined;
            let left = 0;
            for (let j = 0; j < i; j++) {
              if (isDimCol(columns[j].name, (columns[j] as any).displayName ?? columns[j].name)) {
                left += colWidths[j];
              }
            }
            return left;
          });

          const colGroup = <colgroup>{colWidths.map((w, i) => <col key={i} width={w} />)}</colgroup>;

          let rowCounter = 0;
          const renderGroup = (groupKey: string, rows: Record<string, unknown>[], tableName: "primary" | "secondary") => {
            const isPrimary = tableName === "primary";
            const parent = rows[0];
            const children = rows.slice(1);
            return (
              <Fragment key={groupKey}>
                {/* Aggregate header row */}
                <TableRow sx={{ bgcolor: isPrimary ? "#e3f2fd" : "#f5f5f5", position: "sticky", top: isPrimary ? "28px" : 0, zIndex: isPrimary ? 3 : 2, "&:hover": { backgroundColor: isPrimary ? "#bbdefb" : "#e0e0e0" } }}
                  onMouseEnter={() => setHoveredCell({ table: tableName, row: rowCounter++ })}
                  onMouseLeave={() => setHoveredCell(null)}
                >
                  {(() => {
                    // Count dimension columns to span "合计" across all of them
                    const dimColCount = columns.filter((c) => isDimCol(c.name, (c as any).displayName ?? c.name)).length;
                    let dimColIdx = 0;
                    return columns.map((col, ci) => {
                      const dn = (col as { displayName?: string }).displayName ?? col.name;
                      if (!isDimCol(col.name, dn)) {
                        // Metric column: show aggregated value
                        return (
                          <TableCell key={col.name} colSpan={1} sx={{ ...groupSx(ci), fontWeight: 700 }}>
                            {fmtValue(col.name, parent?.[col.name] ?? "", metricFormatMap)}
                          </TableCell>
                        );
                      }
                      const isFirstDim = dimColIdx === 0;
                      dimColIdx++;
                      if (isFirstDim) {
                        // First dimension column: show "合计" spanning all dim cols
                        return (
                          <TableCell key={col.name} colSpan={dimColCount} sx={{ ...groupSx(ci), fontWeight: 700 }}>
                            合计
                          </TableCell>
                        );
                      }
                      // Other dimension columns: skip
                      return null;
                    });
                  })()}
                </TableRow>
                {/* Detail rows */}
                {children.map((row, ri) => {
                  const localIdx = rowCounter++;
                  const shouldHighlight = hoveredCell && hoveredCell.table !== tableName && hoveredCell.row === localIdx;
                  return (
                    <TableRow key={`${groupKey}-${ri}`} sx={{ bgcolor: shouldHighlight ? (isPrimary ? "#90caf9" : "#e0e0e0") : (isPrimary ? "#e3f2fd" : "#fafafa") }}
                      onMouseEnter={() => setHoveredCell({ table: tableName, row: localIdx })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {columns.map((col, ci) => (<TableCell key={col.name} sx={dataSx(ci)}>{fmtValue(col.name, row[col.name], metricFormatMap)}</TableCell>))}
                    </TableRow>
                  );
                })}
              </Fragment>
            );
          };

          const onScroll = (sourceKey: string, el: HTMLDivElement) => {
            if (syncDisabled.current) return;
            const isHZSource = sourceKey.startsWith("_hz_");
            for (const [key, other] of scrollRefs.current) {
              if (key === sourceKey) continue;
              const isHZTarget = key.startsWith("_hz_");
              // Horizontal scrollbar divs: only sync scrollLeft (no scrollTop)
              if (isHZSource || isHZTarget) {
                if (other.scrollLeft !== el.scrollLeft) other.scrollLeft = el.scrollLeft;
              } else {
                if (other.scrollLeft !== el.scrollLeft) other.scrollLeft = el.scrollLeft;
                if (other.scrollTop !== el.scrollTop) other.scrollTop = el.scrollTop;
              }
            }
          };

          const totalWidth = colWidths.reduce((a, b) => a + b, 0);

          // Unified scrollable table container with floating horizontal scrollbar
          // When sections > 1, each gets equal height via flex
          const renderScrollableTable = (tblKey: string, header: React.ReactNode, sections: React.ReactNode[]) => (
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {header}
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
                {sections.length === 1 ? (
                  <Box
                    ref={(el: HTMLDivElement | null) => { if (el) scrollRefs.current.set(tblKey, el); else scrollRefs.current.delete(tblKey); }}
                    sx={{ flex: 1, overflow: "auto", minWidth: 0 }}
                    onScroll={(e: React.UIEvent<HTMLDivElement>) => onScroll(tblKey, e.currentTarget)}
                  >
                    {sections[0]}
                  </Box>
                ) : (
                  sections.map((section, i) => (
                    <Box
                      key={i}
                      sx={{ flex: "1 1 50%", overflow: "auto", minWidth: 0, minHeight: 0, borderTop: i > 0 ? "2px solid" : "none", borderColor: "primary.light" }}
                      ref={(el: HTMLDivElement | null) => { if (el) scrollRefs.current.set(tblKey + "_sec" + i, el); else scrollRefs.current.delete(tblKey + "_sec" + i); }}
                      onScroll={(e: React.UIEvent<HTMLDivElement>) => onScroll(tblKey + "_sec" + i, e.currentTarget)}
                    >
                      {section}
                    </Box>
                  ))
                )}
              </Box>
              <Box
                ref={(el: HTMLDivElement | null) => { if (el) scrollRefs.current.set(tblKey + "_hz", el); else scrollRefs.current.delete(tblKey + "_hz"); }}
                sx={{ overflowX: "auto", overflowY: "hidden", bgcolor: "background.paper", position: "sticky", bottom: 0, zIndex: 2 }}
                onScroll={(e: React.UIEvent<HTMLDivElement>) => onScroll(tblKey + "_hz", e.currentTarget)}
              >
                <Box sx={{ width: totalWidth, height: 1 }} />
              </Box>
            </Box>
          );

          // Unified table component
          const renderSection = (groupKey: string, rows: Record<string, unknown>[], tableName: string): React.ReactNode => (
            <Box key={groupKey} sx={{ ...(tableName !== "primary" ? { borderTop: "2px solid", borderTopColor: "primary.light" } : {}) }}>
              <Table size="small" sx={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
                {colGroup}
                {(tableName === "primary" || tableName === "intra_secondary") && (
                  <TableHead>
                    <TableRow>
                      {columns.map((col, ci) => (
                        <TableCell key={col.name} sx={thSx(ci)}>{(col as any).displayName ?? col.name}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                )}
                <TableBody>
                  {(() => { rowCounter = 0; return <>{renderGroup(groupKey, rows, tableName as "primary" | "secondary")}</>; })()}
                </TableBody>
              </Table>
            </Box>
          );

          // Build secondary tree rows (if intra-project was active at query time)
          let intraSecondaryRows: Record<string, unknown>[] = [];
          if (intraSecondaryResult && intraSecondaryResult.data.length > 0) {
            const apiAgg = intraSecondaryAggRef.current;
            const aggRow: Record<string, unknown> = {};
            if (apiAgg) {
              Object.assign(aggRow, apiAgg);
              aggRow[COL.papp_name] = "其余渠道汇总";
              aggRow[COL.cch_name] = "其余渠道";
              aggRow[COL.channel_name] = "其余媒体";
            }
            if (!apiAgg) {
              for (const col of columns) {
                const isDim = isDimCol(col.name, (col as any).displayName ?? col.name);
                if (!isDim) {
                  let sum = 0, hasVal = false;
                  for (const r of intraSecondaryResult.data) {
                    const v = r[col.name];
                    if (typeof v === "number") { sum += v; hasVal = true; }
                  }
                  aggRow[col.name] = hasVal ? sum : "";
                }
              }
              for (const col of columns) {
                const dn = (col as any).displayName ?? col.name;
                if (dn === "日期" || dn === "周" || dn === "月") { aggRow[col.name] = "汇总"; break; }
              }
            }
            if (!apiAgg) {
              // Set dimension labels for manual agg
              aggRow[COL.papp_name] = "其余渠道汇总";
              aggRow[COL.cch_name] = "其余渠道";
              aggRow[COL.channel_name] = "其余媒体";
            }
            const detailRows = intraSecondaryResult.data.map((r) => {
              const row: Record<string, unknown> = {};
              for (const col of columns) {
                const dn = (col as any).displayName ?? col.name;
                const isTime = dn === "日期" || dn === "周" || dn === "月";
                const raw = r[col.name];
                if (raw != null) {
                  row[col.name] = isTime && typeof raw === "number"
                    ? (() => { const d = new Date(Number.isFinite(raw) ? raw : 0); return !isNaN(d.getTime()) ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}` : String(raw); })()
                    : raw;
                } else if (col.name === COL.cch_name || col.name === COL.cch_name_id) {
                  row[col.name] = "其余渠道";
                } else if (col.name === COL.channel_name) {
                  row[col.name] = "其余媒体";
                } else {
                  row[col.name] = "";
                }
              }
              return row;
            });
            intraSecondaryRows = [aggRow, ...detailRows];
          }

          // Determine comparison mode and section data (using query-time filter snapshots)
          const buildSections = () => {
            const snap = queryFilterSnapshot.current;
            if (!snap) return [];
            const data = queryResult.data;
            const snapGames = snap.games;
            const snapCchNames = snap.cchNames;
            const snapChannels = snap.channels;
            const isMultiGame = snapGames.length > 1;
            const isMultiCch = snapCchNames.length > 1;
            const isMultiChannel = snapChannels.length > 1;
            const isIntraSnap = snapGames.length === 1 && snapCchNames.length <= 1 && snapChannels.length <= 1 && (snapCchNames.length > 0 || snapChannels.length > 0);
            const aggCache = sectionAggregateCacheRef.current;

            // Helper: build section from detail rows
            const makeSection = (label: string, filterFn: (row: Record<string, unknown>) => boolean, tableName: string) => {
              const allRows = data.filter(filterFn);
              if (allRows.length === 0) return null;
              const dataAgg = allRows.find((r) => String(r.id ?? "").startsWith("p_"));
              const detailRows = allRows.filter((r) => !String(r.id ?? "").startsWith("p_"));
              if (detailRows.length === 0) return null;
              const sectionAgg = aggCache[label] || dataAgg || null;
              const renderFn = (key: string) => {
                if (sectionAgg) {
                  const rows = [sectionAgg, ...detailRows];
                  return renderSection(key, rows, tableName);
                }
                // Detail-only: wrap in a table with header but no aggregate row
                return (
                  <Box key={key}>
                    <Table size="small" sx={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
                      {colGroup}
                      {(tableName === "primary" || tableName === "intra_secondary") && (
                        <TableHead>
                          <TableRow>
                            {columns.map((col, ci) => (
                              <TableCell key={col.name} sx={thSx(ci)}>{(col as any).displayName ?? col.name}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                      )}
                      <TableBody>
                        {detailRows.map((row, ri) => (
                          <TableRow key={ri} hover>
                            {columns.map((col, ci) => (
                              <TableCell key={col.name} sx={dataSx(ci)}>{fmtValue(col.name, row[col.name], metricFormatMap)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                );
              };
              return { rows: detailRows, render: renderFn };
            };

            // 1) Multi-game + filters: each game is a section
            if (isMultiGame) {
              return snapGames.map((g) => makeSection(g.papp_name, (r) => String(r[COL.papp_name] ?? "") === g.papp_name, "primary"));
            }

            // 2) Single game + multiple cch_names: each cch is a section
            if (isMultiCch) {
              return snapCchNames.map((cch) => makeSection(extractName(cch), (r) => String(r[COL.cch_name] ?? "") === extractName(cch), "primary"));
            }

            // 3) Single game + multiple channels: each channel is a section
            if (isMultiChannel) {
              return snapChannels.map((ch) => makeSection(ch, (r) => String(r[COL.channel_name] ?? "") === ch, "primary"));
            }

            // 4) Single game + single filter: intra-project (primary vs remaining)
            if (isIntraSnap) {
              const game = snapGames[0];
              const gameName = game.papp_name;
              const primaryFilter = (r: Record<string, unknown>) => {
                if (String(r[COL.papp_name] ?? "") !== gameName) return false;
                if (snapCchNames.length === 1 && (r[COL.cch_name] ?? "") !== "" && String(r[COL.cch_name] ?? "") !== extractName(snapCchNames[0])) return false;
                if (snapChannels.length === 1 && (r[COL.channel_name] ?? "") !== "" && String(r[COL.channel_name] ?? "") !== snapChannels[0]) return false;
                return true;
              };
              const primarySection = makeSection(gameName, primaryFilter, "primary");
              let secondarySection: ReturnType<typeof makeSection> | null = null;
              if (intraSecondaryResult && intraSecondaryResult.data.length > 0) {
                secondarySection = {
                  rows: intraSecondaryRows,
                  render: (key: string) => renderSection("intra_secondary_data", intraSecondaryRows, "intra_secondary"),
                };
              }
              return [primarySection, secondarySection].filter(Boolean);
            }

            // 5) Single game + no filters: single section
            return [makeSection(snapGames[0]?.papp_name ?? "", () => true, "primary")];
          };

          const sections = buildSections().filter(Boolean).map((s) => s!);

          if (sections.length === 0) {
            return (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">选定周期未找到数据</Typography>
              </Box>
            );
          }

          return (
            <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                {renderScrollableTable("_primary", null,
                  sections.map((s, i) => (
                    <Box key={i}>{s.render("sec" + i)}</Box>
                  ))
                )}
              </Box>
            </Box>
          );
        })()}

        {queryResult && queryResult.data.length === 0 && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">选定周期未找到数据</Typography>
          </Box>
        )}

        {!queryResult && selectedGames.length > 0 && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              选择游戏并点击"查询"查看对比数据
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
