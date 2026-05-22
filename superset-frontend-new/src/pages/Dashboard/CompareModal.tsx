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
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { extractQueryFields, buildQueryObject } from "@/utils/query/extractQueryFields";
import { formatNumber } from "@/utils/formatNumber";
import type { SimpleFilter } from "@/utils/query/types";
import type { QueryResult } from "@/types/api";

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

function fmtValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (key.startsWith("roi_")) return `${value.toFixed(1)}%`;
    return formatNumber(value);
  }
  return String(value);
}

interface CompareModalProps {
  open: boolean;
  chartId: number | null;
  onClose: () => void;
  chartData?: Record<string, unknown>;
}

export default function CompareModal({ open, chartId, onClose, chartData }: CompareModalProps) {
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
      setQueryResult(null);
      setError(null);
      setSelectedCchNames([]);
      setSelectedChannels([]);
      return;
    }
    setLoading(true);
    setError(null);

    const loadMeta = async () => {
      if (chartId) {
        try {
          const res = await api.get<{ result: { params?: string; form_data?: string; datasource_id?: number; viz_type?: string; datasource_type?: string } }>(
            `/chart/${chartId}`,
          );
          const chart = res.data.result;
          const raw = chart.params || chart.form_data || "{}";
          const fd = typeof raw === "string" ? JSON.parse(raw) : raw;
          setChartFormData(fd);
          setChartVizType(chart.viz_type);
          if (chart.datasource_type) setChartDsType(chart.datasource_type);
          const dsId =
            chart.datasource_id ??
            (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : null);
          setChartDsId(dsId);

          // Fetch cch_name values from the dataset column values API
          if (dsId) {
            api.get<{ result: (string | null)[] }>(
              `/datasource/table/${dsId}/column/cch_name/values/`,
            )
              .then((res) => {
                const vals = (res.data.result ?? []).filter((v): v is string => v != null);
                setCchNameValues(vals.sort());
              })
              .catch(() => {});

            api.get<{ result: (string | null)[] }>(
              `/datasource/table/${dsId}/column/channel_name/values/`,
            )
              .then((res) => {
                const vals = (res.data.result ?? []).filter((v): v is string => v != null);
                setChannelValues(vals.sort());
              })
              .catch(() => {});
          }
        } catch {
          // ignore
        }
      }
    };
    loadMeta();

    api
      .get<{ result: { papp_id: number; papp_name: string; 上线时间: string; cch_name?: string }[] }>(
        "/project/papp",
      )
      .then((res) => {
        const list = (res.data.result ?? []).map((r) => ({
          papp_id: String(r.papp_id),
          papp_name: r.papp_name ?? "",
          上线时间: r.上线时间 ?? "",
          cch_name: r.cch_name ?? "",
        }));
        setGames(list.filter((g) => g.上线时间));
      })
      .catch((err) => setError(parseErrorMessage(err, "Failed to load games")))
      .finally(() => setLoading(false));
  }, [open, chartId]);

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
            start: start.format("YYYY-MM-DD"),
            end: start.add(periodDays, "day").format("YYYY-MM-DD"),
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
    try {
      const { groupby } = extractQueryFields(chartFormData, chartVizType);
      let compareDimensions = [...(groupby.length > 0 ? groupby : ["papp_id", "papp_name"])];

      // Ensure order: papp_name, cch_name, channel_name, time_col, ...
      const timeCol =
        (chartFormData.granularity_sqla as string) ||
        (compareDimensions as string[]).find((c: string) => c.endsWith("_date") || c === "report_date_calc") ||
        "report_date_calc";
      // Remove timeCol from current position, then re-add after filter dimensions
      compareDimensions = compareDimensions.filter((c: string) => c !== timeCol && c !== "cch_name" && c !== "channel_name");
      if (selectedCchNames.length > 0) compareDimensions.push("cch_name");
      if (selectedChannels.length > 0) compareDimensions.push("channel_name");
      if (!compareDimensions.includes(timeCol)) compareDimensions.push(timeCol);

      const timeGrainSql = timeGrain === "P1D" ? undefined : timeGrain;
      const BATCH = 3;

      // Build detail queries (one per game, full dimensions)
      let detailRows: Record<string, unknown>[] = [];
      let colNames: string[] = [];

      for (let i = 0; i < selectedGames.length; i += BATCH) {
        const batch = selectedGames.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(async (game) => {
            const q = buildQueryObject(chartFormData, chartVizType);
            q.groupby = compareDimensions;
            q.columns = [];
            q.time_range = "No filter";
            q.adhoc_filters = undefined;
            if (timeGrainSql) {
              q.granularity = timeCol;
              (q as Record<string, unknown>).extras = { time_grain_sqla: timeGrainSql };
            }
            const filters: SimpleFilter[] = [{ col: "papp_id", op: "IN", val: [game.papp_id] }];
            if (selectedCchNames.length > 0) filters.push({ col: "cch_name", op: "IN", val: selectedCchNames });
            if (selectedChannels.length > 0) filters.push({ col: "channel_name", op: "IN", val: selectedChannels });
            if (timeCol) {
              filters.push({ col: timeCol, op: ">=", val: game.dateRange.start });
              filters.push({ col: timeCol, op: "<=", val: game.dateRange.end });
            }
            q.filters = filters;
            const payload = {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [q],
              form_data: chartFormData,
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

      // Fetch aggregate per game (each with its own time range)
      const aggGroupby = ["papp_name"];
      if (selectedCchNames.length > 0) aggGroupby.push("cch_name");
      if (selectedChannels.length > 0) aggGroupby.push("channel_name");
      let aggRows: Record<string, unknown>[] = [];
      for (let i = 0; i < selectedGames.length; i += BATCH) {
        const batch = selectedGames.slice(i, i + BATCH);
        const batchAggs = await Promise.all(
          batch.map(async (game) => {
            const q = buildQueryObject(chartFormData, chartVizType);
            q.groupby = aggGroupby;
            q.columns = [];
            q.time_range = "No filter";
            q.adhoc_filters = undefined;
            const filters: SimpleFilter[] = [{ col: "papp_id", op: "IN", val: [game.papp_id] }];
            if (selectedCchNames.length > 0) filters.push({ col: "cch_name", op: "IN", val: selectedCchNames });
            if (selectedChannels.length > 0) filters.push({ col: "channel_name", op: "IN", val: selectedChannels });
            if (timeCol) {
              filters.push({ col: timeCol, op: ">=", val: game.dateRange.start });
              filters.push({ col: timeCol, op: "<=", val: game.dateRange.end });
            }
            q.filters = filters;
            const payload = {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [q],
              form_data: chartFormData,
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
        const pname = String(aggRow.papp_name ?? "");
        treeRows.push({ ...aggRow, id: `p_${rowId++}`, treePath: [pname] });
      }

      // Add child rows from detail data
      for (const detRow of detailRows) {
        const pname = String(detRow.papp_name ?? "");
        const cch = String(detRow.cch_name ?? "");
        const tval = String(detRow[timeCol] ?? "");
        treeRows.push({ ...detRow, id: `c_${rowId++}`, treePath: [pname, cch || tval, cch ? tval : undefined].filter(Boolean) });
      }

      const columns = colNames.map((name: string) => {
        let displayName = name;
        if (name === timeCol || name === "report_date_calc") {
          displayName = timeGrain === "P1W" ? "周" : timeGrain === "P1M" ? "月" : "日期";
        }
        const match = name.match(/^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/);
        if (match) displayName = match[2];
        return { name, type: "VARCHAR", displayName };
      });

      setQueryResult({ status: "success", columns, data: treeRows });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const serverMsg = axiosErr?.response?.data?.message;
      setError(serverMsg || parseErrorMessage(err, "Query failed"));
    } finally {
      setLoading(false);
    }
  }, [selectedGames, chartFormData, chartDsId, chartVizType, selectedCchNames, selectedChannels, timeGrain, cchNameOptions, channelOptions]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
          Period Comparison
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
          sx={{ ml: 1 }}
        >
          {loading ? "..." : "Query"}
        </Button>
        <IconButton size="small" onClick={() => scrollByStep(-1)} title="Scroll left">
          <ChevronLeft />
        </IconButton>
        <IconButton size="small" onClick={() => scrollByStep(1)} title="Scroll right">
          <ChevronRight />
        </IconButton>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3, pt: "12px !important", overflow: "hidden" }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
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
                    start: start.format("YYYY-MM-DD"),
                    end: start.add(periodDays, "day").format("YYYY-MM-DD"),
                  },
                } as SelectedGame;
              }),
            );
            // Set primary to the first selected game
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
          noOptionsText="No matches"
          sx={{
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
              label="Select games to compare"
              placeholder={selectedGames.length > 0 ? "" : "Search by game name or ID"}
              size="small"
            />
          )}
        />
        {cchNameOptions.length > 0 && (
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
            sx={{ maxWidth: 300 }}
            renderInput={(params) => (
              <TextField {...params} label="cch_name" placeholder="Select cch_name" />
            )}
          />
        )}
        {channelOptions.length > 0 && (
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
            sx={{ maxWidth: 300 }}
            renderInput={(params) => (
              <TextField {...params} label="channel" placeholder="Select channel" />
            )}
          />
        )}
        </Box>

        {selectedGames.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {selectedGames.map((g) => (
              <Chip
                key={g.papp_id}
                icon={g.papp_id === primaryPappId ? <Box component="span" sx={{ fontSize: 12, ml: 0.5 }}>★</Box> : undefined}
                label={`${g.papp_name}${g.cch_name ? ` - ${g.cch_name}` : ""} (${g.dateRange.start} ~ ${g.dateRange.end})`}
                onDelete={() => removeGame(g.papp_id)}
                onClick={() => setPrimaryPappId(g.papp_id)}
                size="small"
                color={g.papp_id === primaryPappId ? "primary" : "default"}
                variant={g.papp_id === primaryPappId ? "filled" : "outlined"}
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
          const primaryGame = selectedGames.find((g) => g.papp_id === primaryPappId);
          const primaryName = primaryGame?.papp_name ?? "";

          // Split data: primary first, secondary sorted
          const primaryRows: Record<string, unknown>[] = [];
          const secondaryRows: Record<string, unknown>[] = [];
          for (const row of queryResult.data) {
            if (String(row.papp_name ?? "") === primaryName) primaryRows.push(row);
            else secondaryRows.push(row);
          }
          // Sort secondary by papp_name
          secondaryRows.sort((a, b) => String(a.papp_name ?? "").localeCompare(String(b.papp_name ?? "")));

          // Group by papp_name
          const groupRows = (rows: Record<string, unknown>[]) => {
            const m = new Map<string, Record<string, unknown>[]>();
            for (const r of rows) {
              const k = String(r.papp_name ?? "");
              (m.get(k) || m.set(k, []).get(k))!.push(r);
            }
            return m;
          };
          const primaryGroups = groupRows(primaryRows);
          const secondaryGroups = groupRows(secondaryRows);

          if (primaryGroups.size === 0 && secondaryGroups.size === 0) {
            return (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">No data found for the selected period</Typography>
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
            if (n === "papp_name") return 180;
            if (n === "cch_name") return 130;
            if (n === "report_date_calc" || (col as any).displayName === "月" || (col as any).displayName === "周" || (col as any).displayName === "日期") return 110;
            if (n === "ad_real_cost" || n === "n_unum") return 80;
            if (n.startsWith("ltv_") || n.startsWith("roi_")) return 70;
            return 72;
          });

          const isDimCol = (n: string, displayName: string) =>
            n === "papp_name" || n === "cch_name" || n === "report_date_calc" || displayName === "月" || displayName === "周" || displayName === "日期";

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
                  {columns.map((col, ci) => (
                    <TableCell key={col.name} sx={{ ...groupSx(ci), fontWeight: col.name === "papp_name" ? 700 : 700 }}>
                      {col.name === "papp_name" ? groupKey : fmtValue(col.name, parent?.[col.name] ?? "")}
                    </TableCell>
                  ))}
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
                      {columns.map((col, ci) => (<TableCell key={col.name} sx={dataSx(ci)}>{fmtValue(col.name, row[col.name])}</TableCell>))}
                    </TableRow>
                  );
                })}
              </Fragment>
            );
          };

          const onScroll = (sourceKey: string, el: HTMLDivElement) => {
            if (syncDisabled.current) return;
            for (const [key, other] of scrollRefs.current) {
              if (key !== sourceKey) {
                if (other.scrollLeft !== el.scrollLeft) other.scrollLeft = el.scrollLeft;
                if (other.scrollTop !== el.scrollTop) other.scrollTop = el.scrollTop;
              }
            }
          };

          const renderSection = (groupKey: string, rows: Record<string, unknown>[], tableName: "primary" | "secondary"): React.ReactNode => (
            <Box
              key={groupKey}
              ref={(el: HTMLDivElement | null) => { if (el) scrollRefs.current.set(groupKey, el); else scrollRefs.current.delete(groupKey); }}
              sx={{ flex: 1, overflow: "auto", ...(tableName !== "primary" ? { borderTop: "2px solid", borderTopColor: "primary.light" } : {}) }}
              onScroll={(e: React.UIEvent<HTMLDivElement>) => onScroll(groupKey, e.currentTarget)}
            >
              <Table size="small" sx={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
                {colGroup}
                {tableName === "primary" && (
                  <TableHead>
                    <TableRow>
                      {columns.map((col, ci) => (
                        <TableCell key={col.name} sx={thSx(ci)}>{(col as any).displayName ?? col.name}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                )}
                <TableBody>
                  {(() => { rowCounter = 0; return <>{renderGroup(groupKey, rows, tableName)}</>; })()}
                </TableBody>
              </Table>
            </Box>
          );

          return (
            <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              {Array.from(primaryGroups.entries()).map(([k, r]) => renderSection(k, r, "primary"))}
              {Array.from(secondaryGroups.entries()).map(([k, r]) => renderSection(k, r, "secondary"))}
            </Box>
          );
        })()}

        {queryResult && queryResult.data.length === 0 && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">No data found for the selected period</Typography>
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
              Select games and click "Query" to see comparison data
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
