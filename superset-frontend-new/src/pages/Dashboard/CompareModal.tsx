import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Fragment,
} from "react";
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
import LinearProgress from "@mui/material/LinearProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import CloseIcon from "@mui/icons-material/Close";
import FlipIcon from "@mui/icons-material/Flip";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import api, { getMetricFormatMap } from "@/api";
import { filterValuesQuery } from "@/api/filterValues";
import { postChartData } from "@/api/chartData";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { REGION_LABELS, isGameRegion, type GameRegion } from "@/config/regions";
import { isFederatedDataset } from "@/config/federatedDatasets";
import {
  cchValueRegion,
  narrowByRegion,
  narrowMediaByKnownValues,
} from "@/pages/Dashboard/compareRegions";
import { extractQueryFields } from "@/utils/query/extractQueryFields";
import { formatMetricValue } from "@/utils/formatNumber";
import type { MetricFormatMap } from "@/utils/formatNumber";
import type { SimpleFilter, QueryObject } from "@/utils/query/types";
import type {
  QueryResult,
  ChartData,
  ChartDataPayload,
  ChartDataRow,
  FormData,
} from "@/types/api";
import type { ChartDataResponseResult } from "@/utils/query/types";
import { formatLtvMultiplier } from "@/pages/Dashboard/ltvMultiplier";
import {
  ANCHORS,
  ANCHOR_LABELS,
  anchorSectionLabel,
  buildStartMaps,
  compareSectionOrder,
  hasAnyStart,
  resolveStartDate,
  resolveStartWindow,
  startKey,
} from "@/pages/Dashboard/compareStartDate";
import type {
  AnchorKey,
  ProfitSharingStartRow,
  StartMaps,
} from "@/pages/Dashboard/compareStartDate";
import {
  resolveDisplayName,
  displayLabel,
} from "@/pages/Dashboard/compareColumns";

interface GameOption {
  papp_id: string;
  region: GameRegion;
  papp_name: string;
  上线时间: string;
}

type SelectedGame = GameOption;

/**
 * 游戏的唯一标识。国内与海外的 papp_id 可能重名（对应不同游戏），所以
 * 选择、分表、主对比的标识都要带上区域，起始日期映射同样如此。
 */
function gameKey(game: { region: GameRegion; papp_id: string }): string {
  return startKey(game.region, game.papp_id);
}

const PERIOD_DAYS = [7, 14, 30, 60, 90];

function fmtValue(
  key: string,
  value: unknown,
  formatMap?: MetricFormatMap,
): string {
  return formatMetricValue(key, value, formatMap);
}

const extractName = (val: string) =>
  val.replace(/\s*[([][^)\]]*[)\]]$/, "").trim();

interface CompareModalProps {
  open: boolean;
  chartId: number | null;
  onClose: () => void;
  chartData?: ChartDataPayload;
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

export default function CompareModal({
  open,
  chartId,
  onClose,
  chartData: _chartData,
  chartMeta,
}: CompareModalProps) {
  const [games, setGames] = useState<GameOption[]>([]);
  const [selectedGames, setSelectedGames] = useState<SelectedGame[]>([]);
  const [startMaps, setStartMaps] = useState<StartMaps>(() =>
    buildStartMaps([]),
  );
  const [selectedAnchors, setSelectedAnchors] = useState<AnchorKey[]>([
    "上线时间",
  ]);
  const [primaryGameKey, setPrimaryGameKey] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [timeGrain, setTimeGrain] = useState("P1D");
  const [ltvMode, setLtvMode] = useState<"raw" | "first" | "prev">("raw");
  const [loading, setLoading] = useState(false);
  const [queryProgress, setQueryProgress] = useState<{
    label: string;
    done: number;
    total: number;
    startedAt: number;
  } | null>(null);
  const [queryElapsed, setQueryElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [cchNameInput, setCchNameInput] = useState("");
  const [selectedCchNames, setSelectedCchNames] = useState<string[]>([]);
  const [channelInput, setChannelInput] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [chartFormData, setChartFormData] = useState<FormData | null>(null);
  const [chartVizType, setChartVizType] = useState<string | undefined>(
    undefined,
  );
  const [chartDsId, setChartDsId] = useState<number | null>(null);
  const [chartDsType, setChartDsType] = useState<string>("table");
  const [cchNameValues, setCchNameValues] = useState<string[]>([]);
  const [channelValues, setChannelValues] = useState<string[]>([]);
  const [hoveredCell, setHoveredCell] = useState<{
    table: "primary" | "secondary";
    row: number;
  } | null>(null);
  const [metricFormatMap, setMetricFormatMap] = useState<MetricFormatMap>({});
  const [intraSecondaryResult, setIntraSecondaryResult] = useState<{
    columns: { name: string; type?: string }[];
    data: ChartDataRow[];
  } | null>(null);
  const intraSecondaryAggRef = useRef<ChartDataRow | null>(null);
  const queryFilterSnapshot = useRef<{
    games: SelectedGame[];
    cchNames: string[];
    channels: string[];
    anchors: AnchorKey[];
  } | null>(null);
  const sectionAggregateCacheRef = useRef<Record<string, ChartDataRow>>({});
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
    setTimeout(() => {
      syncDisabled.current = false;
    }, 350);
  }, []);

  // 查询耗时实时显示:每秒刷新已用时长,避免用户猜测进度
  useEffect(() => {
    if (!loading || !queryProgress) {
      setQueryElapsed(0);
      return undefined;
    }
    const { startedAt } = queryProgress;
    setQueryElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const timer = window.setInterval(() => {
      setQueryElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading, queryProgress]);

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
      setQueryProgress(null);
      setQueryElapsed(0);
      setSelectedGames([]);
      setSelectedCchNames([]);
      setSelectedChannels([]);
      setCchNameValues([]);
      setChannelValues([]);
      setGames([]);
      setSelectedAnchors(["上线时间"]);
      setPrimaryGameKey(null);
      setMetricFormatMap({});
      setLtvMode("raw");
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

    // Fetch column values for filter autocompletes. 联邦数据集（国内+海外合并）
    // 必须走 bi 接口，否则只返回主库取值，海外的渠道商/媒体选不到。
    const fetchColumnValues = (id: number) => {
      const valuesPath = (column: string) =>
        isFederatedDataset(id)
          ? `/bi/filter-values/${id}/${encodeURIComponent(column)}/`
          : `/datasource/table/${id}/column/${encodeURIComponent(column)}/values/`;
      api
        .get<{ result: (string | null)[] }>(valuesPath(COL.cch_name_id))
        .then((res) => {
          if (cancelled) return;
          const vals = (res.data.result ?? []).filter(
            (v): v is string => v != null,
          );
          setCchNameValues(vals.sort());
        })
        .catch(() => {});
      api
        .get<{ result: (string | null)[] }>(valuesPath(COL.channel_name))
        .then((res) => {
          if (cancelled) return;
          const vals = (res.data.result ?? []).filter(
            (v): v is string => v != null,
          );
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
        getMetricFormatMap(dsId)
          .then((m) => {
            if (!cancelled) setMetricFormatMap(m);
          })
          .catch(() => {});
      }
    } else if (chartId) {
      // Fallback: fetch chart metadata from API
      void (async () => {
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
            (fd.datasource
              ? Number(String(fd.datasource).split("__")[0])
              : null);
          if (cancelled) return;
          setChartDsId(dsId);
          if (dsId) {
            fetchColumnValues(dsId);
            getMetricFormatMap(dsId)
              .then((m) => {
                if (!cancelled) setMetricFormatMap(m);
              })
              .catch(() => {});
          }
        } catch {
          // ignore
        }
      })();
    }

    // Games list — fires in parallel with column value calls.
    // 国内与海外一起加载：两者可以直接对比，日期按「区域 + papp_id」区分。
    const gamesPromise = api
      .get<{ result: { papp_id: number; region: string; papp_name: string }[] }>(
        "/project/papp",
      )
      .then((res) => res.data?.result ?? []);
    const profitSharingPromise = api
      .get<{ result: ProfitSharingStartRow[] }>("/project/profit-sharing")
      .then((res) => res.data?.result ?? []);

    Promise.all([gamesPromise, profitSharingPromise])
      .then(([games, profitShares]) => {
        if (cancelled) return;
        // 不同渠道的日期不同:分别保留每个轮次下各游戏的最早日期(兜底)
        // 与各渠道自己的日期,由 resolveStartDate 按选中轮次逐级回退。
        const maps = buildStartMaps(profitShares);
        setStartMaps(maps);
        const list = games
          .filter((g) => hasAnyStart(maps, startKey(g.region, g.papp_id)))
          .map((g) => ({
            papp_id: String(g.papp_id),
            region: isGameRegion(g.region) ? g.region : "domestic",
            papp_name: g.papp_name ?? "",
            上线时间:
              resolveStartDate(
                maps,
                "上线时间",
                startKey(g.region, g.papp_id),
              ) ?? "",
          }));
        setGames(list);
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
        (g) => !selectedGames.some((sg) => gameKey(sg) === gameKey(g)),
      ),
    [games, selectedGames],
  );

  const removeGame = useCallback((key: string) => {
    setSelectedGames((prev) => prev.filter((g) => gameKey(g) !== key));
  }, []);

  // 轮次支持多选:多选时按轮次分表(外对比),至少保留一个轮次
  const toggleAnchor = useCallback((key: AnchorKey) => {
    setSelectedAnchors((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      return [...prev, key];
    });
  }, []);

  // Resolve the start-date window for a game under the given anchor round.
  // 测试轮次只使用该轮次自己的日期(渠道 → 全游戏),没有则说明该游戏没有这一
  // 轮测试,不生成分表;上线时间锚点使用上线时间(见 resolveStartWindow)。
  const resolveDateRange = useCallback(
    (game: SelectedGame, cchName?: string, anchor: AnchorKey = "上线时间") =>
      resolveStartWindow(
        startMaps,
        anchor,
        gameKey(game),
        periodDays,
        cchName,
      ),
    [startMaps, periodDays],
  );

  // 每个分表对应一个标签,标签展示该分表自己的测试时间窗口,
  // 组合规则与 buildSections/sectionCount 保持一致(标签数 = 分表数);
  // 排序按数据日期先后(compareSectionOrder),与分表渲染顺序一致。
  const { sectionTags, skippedSectionLabels } = useMemo(() => {
    const tags: {
      key: string;
      label: string;
      gameId: string;
      start?: string;
      anchor: AnchorKey;
    }[] = [];
    const skipped: string[] = [];
    const isMultiGame = selectedGames.length > 1;
    const isMultiCch = selectedCchNames.length > 1;
    const isMultiChannel = selectedChannels.length > 1;
    const singleCchName =
      selectedCchNames.length === 1
        ? extractName(selectedCchNames[0])
        : undefined;

    const pushTag = (
      game: SelectedGame,
      anchor: AnchorKey,
      cchName?: string,
      channelName?: string,
    ) => {
      const range = resolveDateRange(game, cchName ?? singleCchName, anchor);
      const parts = [game.papp_name];
      if (isMultiCch && cchName) parts.push(cchName);
      if (isMultiChannel && channelName) parts.push(channelName);
      if (selectedAnchors.length > 1 || anchor !== "上线时间") {
        parts.push(ANCHOR_LABELS[anchor]);
      }
      // 无可用起始日期(轮次与上线时间均缺失)的分表不生成标签也不查询
      if (!range) {
        skipped.push(parts.join(" · "));
        return;
      }
      tags.push({
        key: `${gameKey(game)}-${cchName ?? ""}-${channelName ?? ""}-${anchor}`,
        label: `${parts.join(" · ")} [${range.start} ~ ${range.end})`,
        gameId: gameKey(game),
        start: range.start,
        anchor,
      });
    };

    for (const game of selectedGames) {
      for (const anchor of selectedAnchors) {
        if (isMultiGame || (!isMultiCch && !isMultiChannel)) {
          pushTag(game, anchor);
        } else if (isMultiCch && isMultiChannel) {
          for (const cch of selectedCchNames) {
            for (const ch of selectedChannels) {
              pushTag(game, anchor, extractName(cch), ch);
            }
          }
        } else if (isMultiCch) {
          for (const cch of selectedCchNames) {
            pushTag(game, anchor, extractName(cch));
          }
        } else {
          for (const ch of selectedChannels) {
            pushTag(game, anchor, undefined, ch);
          }
        }
      }
    }
    tags.sort(compareSectionOrder);
    return { sectionTags: tags, skippedSectionLabels: skipped };
  }, [
    selectedGames,
    selectedCchNames,
    selectedChannels,
    selectedAnchors,
    resolveDateRange,
  ]);

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

      // 内对比次表资格(与下方分支一致):用于查询进度总数与是否发起次表查询。
      // "其余渠道"次表在选中渠道时仍限定该渠道(其余媒体),因此用渠道自己的
      // 起始日期,否则回退到游戏级日期。
      const intraAnchor = selectedAnchors[0];
      const intraCchName =
        selectedCchNames.length === 1
          ? extractName(selectedCchNames[0])
          : undefined;
      const intraRange =
        selectedGames.length === 1
          ? resolveDateRange(selectedGames[0], intraCchName, intraAnchor)
          : undefined;
      const intraEligible =
        selectedAnchors.length === 1 &&
        selectedGames.length === 1 &&
        selectedCchNames.length <= 1 &&
        selectedChannels.length <= 1 &&
        (selectedCchNames.length > 0 || selectedChannels.length > 0) &&
        (!timeCol || intraRange !== undefined);

      // Build detail queries, one per (anchor × game × channel) combo so each
      // query can use that round's own start-date window. 轮次与上线时间都缺失
      // (无可用起始日期)的组合不参与查询,避免带上空日期过滤条件。
      // 海外游戏只与海外渠道组合、国内游戏只与国内渠道组合。渠道商按取值格式
      // 判断区域；媒体没有区域配置，先取该游戏真实存在的媒体取值再收窄。
      const mediaByGame: Record<string, Set<string> | null> = {};
      if (selectedChannels.length > 0 && chartDsId) {
        await Promise.all(
          selectedGames.map(async (g) => {
            const key = gameKey(g);
            const q = filterValuesQuery([
              {
                col: COL.papp_id,
                op: "IN",
                val: [`${g.papp_name} [${g.papp_id}]`],
              },
            ]);
            const path = isFederatedDataset(chartDsId)
              ? `/bi/filter-values/${chartDsId}/${encodeURIComponent(COL.channel_name)}/?q=${q}`
              : `/datasource/table/${chartDsId}/column/${encodeURIComponent(COL.channel_name)}/values/?q=${q}`;
            try {
              const res = await api.get<{ result: (string | null)[] }>(path);
              mediaByGame[key] = new Set(
                (res.data?.result ?? [])
                  .filter((v): v is string => v != null)
                  .map(String),
              );
            } catch {
              // 取值失败时不限制媒体，避免误删分表
              mediaByGame[key] = null;
            }
          }),
        );
      }
      // 该游戏可用的渠道商/媒体；null 表示所选渠道与该游戏区域不匹配，跳过该游戏
      const cchForGame = (g: SelectedGame): string[] | null =>
        narrowByRegion(selectedCchNames, g.region, cchValueRegion);
      const mediaForGame = (g: SelectedGame): string[] | null =>
        narrowMediaByKnownValues(selectedChannels, mediaByGame[gameKey(g)]);

      const combos = selectedAnchors
        .flatMap((anchor) =>
          selectedGames.flatMap((g) => {
            const cchList = cchForGame(g);
            const mediaList = mediaForGame(g);
            // 该游戏没有同区域的渠道商/媒体：不生成任何组合
            if (cchList === null || mediaList === null) return [];
            const cchValues = cchList.length > 0 ? cchList : [undefined];
            return cchValues.map((cchVal) => {
              const cchName = cchVal ? extractName(cchVal) : undefined;
              return {
                game: g,
                cchVal,
                cchName,
                mediaList,
                anchor,
                range: resolveDateRange(g, cchName, anchor),
              };
            });
          }),
        )
        .filter((c) => !timeCol || c.range !== undefined);

      // 阶段性进度:明细(每个组合 1 次) → 汇总(每组合 1 次 + 内对比最多 2 次)
      // → 分表汇总(按维度组合数)。跳过无起始日期的组合时数量会少于估算值,
      // 每个阶段结束时会把进度推进到阶段边界,保证进度条不倒退、能走完。
      const sectionAggTotal = (() => {
        const anchorCount = selectedAnchors.length;
        if (selectedGames.length > 1) return selectedGames.length * anchorCount;
        if (
          selectedGames.length === 1 &&
          selectedCchNames.length > 1 &&
          selectedChannels.length > 1
        ) {
          return (
            selectedCchNames.length * selectedChannels.length * anchorCount
          );
        }
        if (selectedCchNames.length > 1) {
          return selectedCchNames.length * anchorCount;
        }
        if (selectedChannels.length > 1)
          return selectedChannels.length * anchorCount;
        return 0;
      })();
      const intraStepTotal = intraEligible ? 2 : 0;
      const detailTotal = combos.length;
      // 明细 + 汇总各查一次(每个组合),加内对比次表
      const summaryTotal = detailTotal * 2 + intraStepTotal;
      const totalSteps = summaryTotal + sectionAggTotal;
      const progressStartedAt = Date.now();
      let doneSteps = 0;
      const reportProgress = (label: string, count = 1) => {
        doneSteps = Math.min(doneSteps + count, totalSteps);
        setQueryProgress({
          label,
          done: doneSteps,
          total: totalSteps,
          startedAt: progressStartedAt,
        });
      };
      const finishStage = (label: string, stageBoundary: number) => {
        doneSteps = Math.max(doneSteps, Math.min(stageBoundary, totalSteps));
        setQueryProgress({
          label,
          done: doneSteps,
          total: totalSteps,
          startedAt: progressStartedAt,
        });
      };
      setQueryProgress({
        label: "正在查询明细数据",
        done: 0,
        total: totalSteps,
        startedAt: progressStartedAt,
      });
      const detailRows: ChartDataRow[] = [];
      let colNames: string[] = [];

      for (let i = 0; i < combos.length; i += BATCH) {
        const batch = combos.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(async ({ game, cchVal, anchor, range, mediaList }) => {
            const q: QueryObject = {
              result_type: "full",
              metrics: extractQueryFields(chartFormData, chartVizType).metrics,
              groupby: compareDimensions,
              columns: [],
              filters: [
                {
                  col: COL.papp_id,
                  op: "IN",
                  val: [`${game.papp_name} [${game.papp_id}]`],
                },
                ...(cchVal
                  ? [{ col: COL.cch_name_id, op: "IN", val: [cchVal] }]
                  : []),
                ...(mediaList.length > 0
                  ? [{ col: COL.channel_name, op: "IN", val: mediaList }]
                  : []),
              ],
              granularity: chartFormData.granularity_sqla || undefined,
            };
            if (timeCol && range) {
              q.orderby = [[timeCol, true]];
              (q.filters as SimpleFilter[]).push({
                col: timeCol,
                op: ">=",
                val: range.start,
              });
              (q.filters as SimpleFilter[]).push({
                col: timeCol,
                op: "<",
                val: range.end,
              });
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
            const res = await postChartData(payload);
            const results = (
              Array.isArray(res.data?.result) ? res.data.result : []
            ) as ChartDataResponseResult[];
            const rows: ChartDataRow[] = [];
            for (const r of results) {
              const data = r.data as ChartDataRow[] | undefined;
              if (data && Array.isArray(data)) {
                for (const row of data) rows.push({ ...row, __anchor: anchor });
              }
            }
            return rows;
          }),
        );
        for (const rows of batchResults) {
          detailRows.push(...rows);
        }
        reportProgress("正在查询明细数据", batch.length);
      }
      // 明细阶段结束,推进到阶段边界(即使部分组合被跳过)
      finishStage("正在查询对比汇总", detailTotal);

      // Get colnames from first result, filter out internal fields
      if (detailRows.length > 0) {
        colNames = Object.keys(detailRows[0]).filter(
          (k) => k !== "id" && k !== "treePath" && k !== "__anchor",
        );
      }

      // Intra-project secondary query: when 1 game + at least 1 filter level
      // Must run BEFORE the detailRows early return so the secondary can still show data
      // even when the primary filter matches nothing.
      let secondaryResult: {
        columns: { name: string; type?: string }[];
        data: ChartDataRow[];
      } | null = null;
      if (intraEligible) {
        const game = selectedGames[0];
        const sharedMetrics = extractQueryFields(
          chartFormData,
          chartVizType,
        ).metrics;
        const baseFilters: SimpleFilter[] = [
          {
            col: COL.papp_id,
            op: "IN",
            val: [`${game.papp_name} [${game.papp_id}]`],
          },
        ];
        if (timeCol && intraRange) {
          baseFilters.push({
            col: timeCol,
            op: ">=",
            val: intraRange.start,
          });
          baseFilters.push({
            col: timeCol,
            op: "<",
            val: intraRange.end,
          });
        }

        if (selectedChannels.length > 0) {
          const secFilters = [...baseFilters];
          if (selectedCchNames.length > 0)
            secFilters.push({
              col: COL.cch_name_id,
              op: "IN",
              val: selectedCchNames,
            });
          secFilters.push({
            col: COL.channel_name,
            op: "NOT IN",
            val: selectedChannels,
          });
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
            extras:
              timeGrainSql && timeCol
                ? { time_grain_sqla: timeGrainSql }
                : undefined,
          };
          try {
            const res = await postChartData({
              datasource: { id: chartDsId, type: chartDsType },
              queries: [secQuery1],
              result_format: "json" as const,
              result_type: "full" as const,
              force: true,
            });
            const results = (
              Array.isArray(res.data?.result) ? res.data.result : []
            ) as ChartDataResponseResult[];
            for (const r of results) {
              const data = r.data as ChartDataRow[] | undefined;
              if (data && Array.isArray(data) && data.length > 0) {
                secondaryResult = {
                  columns: Object.keys(data[0])
                    .filter((k) => k !== "id")
                    .map((name) => ({
                      name,
                      type: "VARCHAR" as const,
                      displayName: resolveDisplayName(name, timeCol, timeGrain),
                    })),
                  data,
                };
                break;
              }
            }
          } catch {
            /* secondary failed silently */
          }
        } else if (selectedCchNames.length > 0) {
          const secFilters = [...baseFilters];
          secFilters.push({
            col: COL.cch_name_id,
            op: "NOT IN",
            val: selectedCchNames,
          });
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
            extras:
              timeGrainSql && timeCol
                ? { time_grain_sqla: timeGrainSql }
                : undefined,
          };
          try {
            const res = await postChartData({
              datasource: { id: chartDsId, type: chartDsType },
              queries: [secQuery2],
              result_format: "json" as const,
              result_type: "full" as const,
              force: true,
            });
            const results = (
              Array.isArray(res.data?.result) ? res.data.result : []
            ) as ChartDataResponseResult[];
            for (const r of results) {
              const data = r.data as ChartDataRow[] | undefined;
              if (data && Array.isArray(data) && data.length > 0) {
                secondaryResult = {
                  columns: Object.keys(data[0])
                    .filter((k) => k !== "id")
                    .map((name) => ({
                      name,
                      type: "VARCHAR" as const,
                      displayName: resolveDisplayName(name, timeCol, timeGrain),
                    })),
                  data,
                };
                break;
              }
            }
          } catch {
            /* secondary failed silently */
          }
        }
        reportProgress("正在查询对比汇总");
        // Secondary aggregate query (without timeCol — one total row)
        if (secondaryResult && secondaryResult.data.length > 0) {
          try {
            const aggFilters: SimpleFilter[] = [
              {
                col: COL.papp_id,
                op: "IN",
                val: [`${game.papp_name} [${game.papp_id}]`],
              },
            ];
            if (selectedChannels.length > 0) {
              if (selectedCchNames.length > 0)
                aggFilters.push({
                  col: COL.cch_name_id,
                  op: "IN",
                  val: selectedCchNames,
                });
              aggFilters.push({
                col: COL.channel_name,
                op: "NOT IN",
                val: selectedChannels,
              });
            } else if (selectedCchNames.length > 0) {
              aggFilters.push({
                col: COL.cch_name_id,
                op: "NOT IN",
                val: selectedCchNames,
              });
            }
            if (timeCol && intraRange) {
              aggFilters.push({
                col: timeCol,
                op: ">=",
                val: intraRange.start,
              });
              aggFilters.push({
                col: timeCol,
                op: "<",
                val: intraRange.end,
              });
            }
            const aggRes = await postChartData({
              datasource: { id: chartDsId, type: chartDsType },
              queries: [
                {
                  result_type: "full" as const,
                  metrics: sharedMetrics,
                  groupby: [COL.papp_name],
                  columns: [],
                  filters: aggFilters,
                },
              ],
              result_format: "json" as const,
              result_type: "full" as const,
              force: true,
            });
            const aggResults = (
              Array.isArray(aggRes.data?.result) ? aggRes.data.result : []
            ) as ChartDataResponseResult[];
            for (const r of aggResults) {
              const data = r.data as ChartDataRow[] | undefined;
              if (data && data.length > 0) {
                intraSecondaryAggRef.current = data[0];
                break;
              }
            }
          } catch {
            /* secondary agg failed */
          }
        }
        reportProgress("正在查询对比汇总");
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
                } else {
                  formatted = String(raw);
                }
              } else if (timeGrain === "P1M") {
                const d = new Date(Number.isFinite(raw) ? raw : 0);
                formatted = !isNaN(d.getTime())
                  ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`
                  : String(raw);
              } else {
                const d = new Date(Number.isFinite(raw) ? raw : 0);
                formatted = !isNaN(d.getTime())
                  ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
                  : String(raw);
              }
              row[timeCol] = formatted;
            }
          }
          secondaryResult.data.sort((a, b) => {
            const va = a[timeCol];
            const vb = b[timeCol];
            if (typeof va === "number" && typeof vb === "number")
              return va - vb;
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
            } else {
              formatted = String(raw);
            }
          } else if (timeGrain === "P1M") {
            const d = new Date(typeof raw === "number" ? raw : String(raw));
            if (!isNaN(d.getTime())) {
              formatted = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
            } else {
              formatted = String(raw);
            }
          } else {
            const ts = typeof raw === "number" ? raw : Number(raw);
            const d = new Date(Number.isFinite(ts) ? ts : String(raw));
            if (!isNaN(d.getTime())) {
              formatted = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
            } else {
              formatted = String(raw);
            }
          }
          row[timeCol] = formatted;
        }
      }

      // Fetch aggregate per (game × channel) combo — bare query, no form_data
      // to avoid granularity leak
      const aggRows: ChartDataRow[] = [];
      for (let i = 0; i < combos.length; i += BATCH) {
        const batch = combos.slice(i, i + BATCH);
        const batchAggs = await Promise.all(
          batch.map(async ({ game, cchVal, anchor, range, mediaList }) => {
            const filters: SimpleFilter[] = [
              {
                col: COL.papp_id,
                op: "IN",
                val: [`${game.papp_name} [${game.papp_id}]`],
              },
              ...(cchVal
                ? [{ col: COL.cch_name_id, op: "IN", val: [cchVal] }]
                : []),
              ...(mediaList.length > 0
                ? [{ col: COL.channel_name, op: "IN", val: mediaList }]
                : []),
            ];
            if (timeCol && range) {
              filters.push({
                col: timeCol,
                op: ">=",
                val: range.start,
              });
              filters.push({
                col: timeCol,
                op: "<",
                val: range.end,
              });
            }
            const payload = {
              datasource: { id: chartDsId, type: chartDsType },
              queries: [
                {
                  result_type: "full",
                  metrics: extractQueryFields(chartFormData, chartVizType)
                    .metrics,
                  groupby: [COL.papp_name],
                  columns: [],
                  filters,
                },
              ],
              result_format: "json",
              result_type: "full" as const,
              force: true,
            };
            try {
              const res = await postChartData(payload);
              const results = (
                Array.isArray(res.data?.result) ? res.data.result : []
              ) as ChartDataResponseResult[];
              const rows: ChartDataRow[] = [];
              for (const r of results) {
                const data = r.data as ChartDataRow[] | undefined;
                if (data && Array.isArray(data)) {
                  for (const row of data)
                    rows.push({ ...row, __anchor: anchor });
                }
              }
              return rows;
            } catch {
              return [] as ChartDataRow[];
            }
          }),
        );
        for (const rows of batchAggs) aggRows.push(...rows);
        reportProgress("正在查询对比汇总", batch.length);
      }
      // 汇总阶段结束,推进到阶段边界(内对比次表可能未发起)
      finishStage("正在查询分表汇总", summaryTotal);

      // Build tree rows: aggregate rows (parents) + detail rows (children)
      const treeRows: ChartDataRow[] = [];
      let rowId = 0;
      const pappNameMap = new Map<string, string>();
      for (const g of selectedGames) pappNameMap.set(g.papp_name, g.papp_id);

      // Add parent rows from aggregate
      for (const aggRow of aggRows) {
        const pname = String(aggRow[COL.papp_name] ?? "");
        treeRows.push({
          ...aggRow,
          id: `p_${rowId++}`,
          treePath: [pname],
        } as unknown as ChartDataRow);
      }

      // Add child rows from detail data
      for (const detRow of detailRows) {
        const pname = String(detRow[COL.papp_name] ?? "");
        const cch =
          selectedCchNames.length > 0 ? String(detRow[COL.cch_name] ?? "") : "";
        const tval = String(detRow[timeCol] ?? "");
        treeRows.push({
          ...detRow,
          id: `c_${rowId++}`,
          treePath: [pname, cch || tval, cch ? tval : undefined].filter(
            Boolean,
          ),
        } as unknown as ChartDataRow);
      }

      const columns = colNames.map((name: string) => ({
        name,
        type: "VARCHAR",
        displayName: resolveDisplayName(name, timeCol, timeGrain),
      }));

      // Per-section aggregate queries (for cross-comparison sections).
      // 多选轮次时每个轮次各出一套分表,标签前缀与渲染侧保持一致。
      const sectionAggs: Record<string, ChartDataRow> = {};
      const multiAnchor = selectedAnchors.length > 1;
      const aggLabel = (anchor: AnchorKey, label: string) =>
        anchorSectionLabel(anchor, label, multiAnchor);
      const sharedMetrics = extractQueryFields(
        chartFormData,
        chartVizType,
      ).metrics;
      // 每个游戏/分表使用它自己的起始日期窗口：多游戏对比时若统一取第一个
      // 游戏的窗口，其余分表的合计行会统计到错误的日期区间。
      const timeFiltersFor = (
        anchor: AnchorKey,
        game: SelectedGame | undefined = selectedGames[0],
      ): SimpleFilter[] => {
        if (!timeCol || !game) return [];
        const range = resolveDateRange(game, undefined, anchor);
        return range
          ? [
              { col: timeCol, op: ">=", val: range.start },
              { col: timeCol, op: "<", val: range.end },
            ]
          : [];
      };
      const gameFilter: SimpleFilter | null =
        selectedGames.length > 0
          ? {
              col: COL.papp_id,
              op: "IN",
              val: selectedGames.map((g) => `${g.papp_name} [${g.papp_id}]`),
            }
          : null;
      // Build per-section aggregate queries. 分支顺序与渲染保持一致：
      // 多游戏时每个游戏一个分表（各自使用自己的起始日期窗口），
      // 单游戏时才按渠道商/媒体再拆分。
      if (selectedGames.length > 1) {
        for (const anchor of selectedAnchors) {
          for (const g of selectedGames) {
            // 只统计该游戏同区域的渠道商/媒体
            const cchList = cchForGame(g);
            const mediaList = mediaForGame(g);
            if (cchList === null || mediaList === null) continue;
            const filters: SimpleFilter[] = timeFiltersFor(anchor, g);
            // 无可用起始日期的分表跳过,避免空日期过滤条件
            if (timeCol && filters.length === 0) continue;
            filters.push({
              col: COL.papp_id,
              op: "IN",
              val: [`${g.papp_name} [${g.papp_id}]`],
            });
            if (cchList.length > 0)
              filters.push({
                col: COL.cch_name_id,
                op: "IN",
                val: cchList,
              });
            if (mediaList.length > 0)
              filters.push({
                col: COL.channel_name,
                op: "IN",
                val: mediaList,
              });
            try {
              const res = await postChartData({
                datasource: { id: chartDsId, type: chartDsType },
                queries: [
                  {
                    result_type: "full" as const,
                    metrics: sharedMetrics,
                    groupby: [COL.papp_name],
                    columns: [],
                    filters,
                  },
                ],
                result_format: "json" as const,
                result_type: "full" as const,
                force: true,
              });
              const results = (
                Array.isArray(res.data?.result) ? res.data.result : []
              ) as ChartDataResponseResult[];
              for (const r of results) {
                const data = r.data as ChartDataRow[] | undefined;
                if (data && data.length > 0) {
                  sectionAggs[aggLabel(anchor, g.papp_name)] = {
                    ...data[0],
                    __anchor: anchor,
                  };
                  break;
                }
              }
            } catch {
              /* aggregate query failed */
            }
            reportProgress("正在查询分表汇总");
          }
        }
      } else if (
        selectedGames.length === 1 &&
        selectedCchNames.length > 1 &&
        selectedChannels.length > 1
      ) {
        // M×N sections: one aggregate per (轮次 × 渠道商 × 媒体) combination
        const mnCch = cchForGame(selectedGames[0]) ?? [];
        const mnMedia = mediaForGame(selectedGames[0]) ?? [];
        for (const anchor of selectedAnchors) {
          for (const cch of mnCch) {
            for (const ch of mnMedia) {
              const cchRange =
                timeCol && selectedGames[0]
                  ? resolveDateRange(selectedGames[0], extractName(cch), anchor)
                  : undefined;
              // 无可用起始日期的组合跳过,避免空日期过滤条件
              if (timeCol && !cchRange) continue;
              const filters: SimpleFilter[] = cchRange
                ? [
                    { col: timeCol, op: ">=", val: cchRange.start },
                    { col: timeCol, op: "<", val: cchRange.end },
                  ]
                : [];
              if (gameFilter) filters.push(gameFilter);
              filters.push({ col: COL.cch_name_id, op: "IN", val: [cch] });
              filters.push({ col: COL.channel_name, op: "IN", val: [ch] });
              try {
                const res = await postChartData({
                  datasource: { id: chartDsId, type: chartDsType },
                  queries: [
                    {
                      result_type: "full" as const,
                      metrics: sharedMetrics,
                      groupby: [COL.papp_name],
                      columns: [],
                      filters,
                    },
                  ],
                  result_format: "json" as const,
                  result_type: "full" as const,
                  force: true,
                });
                const results = (
                  Array.isArray(res.data?.result) ? res.data.result : []
                ) as ChartDataResponseResult[];
                for (const r of results) {
                  const data = r.data as ChartDataRow[] | undefined;
                  if (data && data.length > 0) {
                    sectionAggs[
                      aggLabel(anchor, `${extractName(cch)} × ${ch}`)
                    ] = { ...data[0], __anchor: anchor };
                    break;
                  }
                }
              } catch {
                /* aggregate query failed */
              }
              reportProgress("正在查询分表汇总");
            }
          }
        }
      } else if (selectedCchNames.length > 1) {
        const cchBranchList = cchForGame(selectedGames[0]) ?? [];
        const mediaBranchList = mediaForGame(selectedGames[0]) ?? [];
        for (const anchor of selectedAnchors) {
          for (const cch of cchBranchList) {
            // Each channel section uses that channel's own round/launch window
            const cchRange =
              timeCol && selectedGames[0]
                ? resolveDateRange(selectedGames[0], extractName(cch), anchor)
                : undefined;
            // 无可用起始日期的组合跳过,避免空日期过滤条件
            if (timeCol && !cchRange) continue;
            const filters: SimpleFilter[] = cchRange
              ? [
                  { col: timeCol, op: ">=", val: cchRange.start },
                  { col: timeCol, op: "<", val: cchRange.end },
                ]
              : [];
            if (gameFilter) filters.push(gameFilter);
            filters.push({ col: COL.cch_name_id, op: "IN", val: [cch] });
            if (mediaBranchList.length > 0)
              filters.push({
                col: COL.channel_name,
                op: "IN",
                val: mediaBranchList,
              });
            try {
              const res = await postChartData({
                datasource: { id: chartDsId, type: chartDsType },
                queries: [
                  {
                    result_type: "full" as const,
                    metrics: sharedMetrics,
                    groupby: [COL.cch_name],
                    columns: [],
                    filters,
                  },
                ],
                result_format: "json" as const,
                result_type: "full" as const,
                force: true,
              });
              const results = (
                Array.isArray(res.data?.result) ? res.data.result : []
              ) as ChartDataResponseResult[];
              for (const r of results) {
                const data = r.data as ChartDataRow[] | undefined;
                if (data && data.length > 0) {
                  sectionAggs[aggLabel(anchor, extractName(cch))] = {
                    ...data[0],
                    __anchor: anchor,
                  };
                  break;
                }
              }
            } catch {
              /* aggregate query failed */
            }
            reportProgress("正在查询分表汇总");
          }
        }
      } else if (selectedChannels.length > 1) {
        const mediaOnlyList = mediaForGame(selectedGames[0]) ?? [];
        const cchOnlyList = cchForGame(selectedGames[0]) ?? [];
        for (const anchor of selectedAnchors) {
          for (const ch of mediaOnlyList) {
            const filters: SimpleFilter[] = timeFiltersFor(anchor);
            // 无可用起始日期的分表跳过,避免空日期过滤条件
            if (timeCol && filters.length === 0) continue;
            if (gameFilter) filters.push(gameFilter);
            if (cchOnlyList.length > 0)
              filters.push({
                col: COL.cch_name_id,
                op: "IN",
                val: cchOnlyList,
              });
            filters.push({ col: COL.channel_name, op: "IN", val: [ch] });
            try {
              const res = await postChartData({
                datasource: { id: chartDsId, type: chartDsType },
                queries: [
                  {
                    result_type: "full" as const,
                    metrics: sharedMetrics,
                    groupby: [COL.channel_name],
                    columns: [],
                    filters,
                  },
                ],
                result_format: "json" as const,
                result_type: "full" as const,
                force: true,
              });
              const results = (
                Array.isArray(res.data?.result) ? res.data.result : []
              ) as ChartDataResponseResult[];
              for (const r of results) {
                const data = r.data as ChartDataRow[] | undefined;
                if (data && data.length > 0) {
                  sectionAggs[aggLabel(anchor, ch)] = {
                    ...data[0],
                    __anchor: anchor,
                  };
                  break;
                }
              }
            } catch {
              /* aggregate query failed */
            }
            reportProgress("正在查询分表汇总");
          }
        }
      }
      // 分表阶段结束(部分组合被跳过后补齐),随后渲染结果
      finishStage("正在生成对比结果", totalSteps);
      sectionAggregateCacheRef.current = sectionAggs;

      setQueryResult({ status: "success", columns, data: treeRows });
      queryFilterSnapshot.current = {
        games: selectedGames.map((g) => ({ ...g })),
        cchNames: [...selectedCchNames],
        channels: [...selectedChannels],
        anchors: [...selectedAnchors],
      };
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      const respData = axiosErr?.response?.data;
      const serverMsg =
        respData?.message ||
        respData?.error ||
        axiosErr?.message ||
        JSON.stringify(respData);
      setError(typeof serverMsg === "string" ? serverMsg : "查询失败");
    } finally {
      setLoading(false);
      setQueryProgress(null);
    }
  }, [
    selectedGames,
    selectedAnchors,
    chartFormData,
    chartDsId,
    chartDsType,
    chartVizType,
    selectedCchNames,
    selectedChannels,
    timeGrain,
    resolveDateRange,
  ]);

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
            backgroundColor: "var(--mui-palette-shadow-backdrop)",
          },
        },
        paper: {
          sx: {
            borderRadius: 3,
            height: "95vh",
            maxWidth: 1600,
            boxShadow: "var(--mui-palette-shadow-modal)",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          columnGap: 1.5,
          rowGap: 0.5,
          bgcolor: "grey.50",
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 3,
          py: 1.5,
        }}
      >
        <FlipIcon sx={{ fontSize: 22, color: "primary.main" }} />
        <Typography
          variant="body1"
          sx={{ fontWeight: 600, flex: 1, fontSize: "1.1rem" }}
        >
          周期对比
        </Typography>
        <Box
          sx={{
            position: "relative",
            display: "flex",
            gap: 0.5,
            alignItems: "center",
          }}
        >
          <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
            基准
          </Typography>
          {ANCHORS.map((a) => {
            const active = selectedAnchors.includes(a.key);
            return (
              <Chip
                key={a.key}
                label={a.label}
                size="small"
                variant={active ? "filled" : "outlined"}
                color={active ? "secondary" : "default"}
                onClick={() => toggleAnchor(a.key)}
                title="可多选，多选时按轮次分表对比（外对比）"
                sx={{ cursor: "pointer", minWidth: 28 }}
              />
            );
          })}
          {selectedAnchors.length > 1 && (
            <Box
              sx={{
                position: "absolute",
                top: -8,
                right: -8,
                px: 0.75,
                py: 0.15,
                borderRadius: "3px",
                bgcolor: "error.main",
                color: "common.white",
                fontSize: "0.65rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                zIndex: 10,
                pointerEvents: "none",
                boxShadow: "var(--mui-palette-shadow-sm)",
              }}
            >
              <Box
                sx={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "common.white",
                  mr: 0.5,
                  verticalAlign: "middle",
                }}
              />
              外对比
            </Box>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {PERIOD_DAYS.map((days) => (
            <Chip
              key={days}
              label={`${selectedAnchors.length > 1 ? "各轮次后" : `${ANCHOR_LABELS[selectedAnchors[0]]}后`} ${days} 天`}
              size="small"
              variant={periodDays === days ? "filled" : "outlined"}
              color={periodDays === days ? "primary" : "default"}
              onClick={() => setPeriodDays(days)}
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
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          {(["raw", "first", "prev"] as const).map((m) => (
            <Chip
              key={m}
              label={
                m === "raw" ? "原值" : m === "first" ? "首日倍率" : "昨日倍率"
              }
              size="small"
              variant={ltvMode === m ? "filled" : "outlined"}
              color={ltvMode === m ? "secondary" : "default"}
              onClick={() => setLtvMode(m)}
              sx={{ cursor: "pointer", minWidth: 28 }}
            />
          ))}
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={() => void handleQuery()}
          disabled={selectedGames.length === 0 || loading || !chartFormData}
          title=""
          sx={{ ml: 1 }}
        >
          {loading ? "..." : "查询"}
        </Button>
        <IconButton
          size="small"
          onClick={() => scrollByStep(-1)}
          title="向左滚动"
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => scrollByStep(1)}
          title="向右滚动"
        >
          <ChevronRight />
        </IconButton>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          p: 3,
          pt: "12px !important",
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
          <Box sx={{ position: "relative" }}>
            <Autocomplete
              multiple
              value={selectedGames}
              inputValue={inputValue}
              onInputChange={(_, v) => setInputValue(v)}
              options={gameOptions}
              getOptionLabel={(o) => `${o.papp_name} [${o.papp_id}]`}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={gameKey(option)}>
                  <Box
                    component="span"
                    sx={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {option.papp_name} [{option.papp_id}]
                  </Box>
                  {option.region === "oversea" && (
                    <Box
                      component="span"
                      sx={{
                        ml: 1,
                        px: 0.5,
                        borderRadius: 0.5,
                        bgcolor: "action.hover",
                        color: "text.secondary",
                        fontSize: "0.7rem",
                        flexShrink: 0,
                      }}
                    >
                      {REGION_LABELS.oversea}
                    </Box>
                  )}
                </Box>
              )}
              onChange={(_, value) => {
                setSelectedGames(value);
                const newKeys = value.map((v: GameOption) => gameKey(v));
                if (
                  newKeys.length > 0 &&
                  !newKeys.includes(primaryGameKey ?? "")
                ) {
                  setPrimaryGameKey(newKeys[0]);
                }
                if (newKeys.length === 0) setPrimaryGameKey(null);
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
                  placeholder={
                    selectedGames.length > 0 ? "" : "按游戏名称或 ID 搜索"
                  }
                  size="small"
                />
              )}
            />
            {selectedGames.length > 1 && (
              <Box
                sx={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  px: 0.75,
                  py: 0.15,
                  borderRadius: "3px",
                  bgcolor: "error.main",
                  color: "common.white",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  zIndex: 10,
                  pointerEvents: "none",
                  boxShadow: "var(--mui-palette-shadow-sm)",
                }}
              >
                <Box
                  sx={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "common.white",
                    mr: 0.5,
                    verticalAlign: "middle",
                  }}
                />
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
                <TextField
                  {...params}
                  label={COL.cch_name_id}
                  placeholder="选择渠道商"
                />
              )}
            />
            {(() => {
              if (selectedCchNames.length > 1) {
                return (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      px: 0.75,
                      py: 0.15,
                      borderRadius: "3px",
                      bgcolor: "error.main",
                      color: "common.white",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      pointerEvents: "none",
                      boxShadow: "var(--mui-palette-shadow-sm)",
                    }}
                  >
                    <Box
                      sx={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "common.white",
                        mr: 0.5,
                        verticalAlign: "middle",
                      }}
                    />
                    外对比
                  </Box>
                );
              }
              if (
                selectedGames.length === 1 &&
                selectedCchNames.length === 1 &&
                selectedChannels.length <= 1
              ) {
                return (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      px: 0.75,
                      py: 0.15,
                      borderRadius: "3px",
                      bgcolor: "info.main",
                      color: "common.white",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      pointerEvents: "none",
                      boxShadow: "var(--mui-palette-shadow-sm)",
                    }}
                  >
                    <Box
                      sx={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "common.white",
                        mr: 0.5,
                        verticalAlign: "middle",
                      }}
                    />
                    内对比
                  </Box>
                );
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
                <TextField
                  {...params}
                  label={COL.channel_name}
                  placeholder="选择媒体"
                />
              )}
            />
            {(() => {
              if (selectedChannels.length > 1) {
                return (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      px: 0.75,
                      py: 0.15,
                      borderRadius: "3px",
                      bgcolor: "error.main",
                      color: "common.white",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      pointerEvents: "none",
                      boxShadow: "var(--mui-palette-shadow-sm)",
                    }}
                  >
                    <Box
                      sx={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "common.white",
                        mr: 0.5,
                        verticalAlign: "middle",
                      }}
                    />
                    外对比
                  </Box>
                );
              }
              if (
                selectedGames.length === 1 &&
                selectedChannels.length === 1 &&
                selectedCchNames.length <= 1
              ) {
                return (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      px: 0.75,
                      py: 0.15,
                      borderRadius: "3px",
                      bgcolor: "info.main",
                      color: "common.white",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      pointerEvents: "none",
                      boxShadow: "var(--mui-palette-shadow-sm)",
                    }}
                  >
                    <Box
                      sx={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "common.white",
                        mr: 0.5,
                        verticalAlign: "middle",
                      }}
                    />
                    内对比
                  </Box>
                );
              }
              return null;
            })()}
          </Box>
          {(() => {
            const isIntra =
              selectedAnchors.length === 1 &&
              selectedGames.length === 1 &&
              selectedCchNames.length <= 1 &&
              selectedChannels.length <= 1 &&
              (selectedCchNames.length > 0 || selectedChannels.length > 0);
            const isInter =
              selectedAnchors.length > 1 ||
              selectedCchNames.length > 1 ||
              selectedChannels.length > 1 ||
              selectedGames.length > 1;
            if (!isIntra && !isInter) return null;
            // 与分表标签一致:无可用起始日期的组合不计入分表数
            const sectionCount = Math.max(sectionTags.length, 1);
            const showWarning = isInter && sectionCount > 4;
            return (
              <>
                <Box
                  sx={{
                    ml: "auto",
                    alignSelf: "center",
                    color: "text.secondary",
                    fontSize: "0.8125rem",
                    whiteSpace: "nowrap",
                    px: 1,
                    py: 0.25,
                    borderRadius: "4px",
                    bgcolor: isIntra ? "status.infoBg" : "status.errorBg",
                    border: "1px dashed",
                    borderColor: isIntra
                      ? "color-mix(in srgb, var(--mui-palette-info-main) 30%, transparent)"
                      : "color-mix(in srgb, var(--mui-palette-error-main) 30%, transparent)",
                  }}
                >
                  {isIntra
                    ? "选定为主表，其他为次表"
                    : `维度组合独立分表 (${sectionCount}项)`}
                </Box>
                {showWarning && (
                  <Box
                    sx={{
                      alignSelf: "center",
                      px: 1,
                      py: 0.15,
                      borderRadius: "3px",
                      bgcolor: "status.warningBg",
                      border: "1px solid",
                      borderColor:
                        "color-mix(in srgb, var(--mui-palette-warning-main) 40%, transparent)",
                      color: "warning.main",
                      fontSize: "0.7rem",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                    }}
                  >
                    ⚠ 项目较多，可能影响性能
                  </Box>
                )}
              </>
            );
          })()}
        </Box>

        {sectionTags.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "nowrap",
              gap: 0.5,
              overflowX: "auto",
              minHeight: 0,
              pb: 0.5,
            }}
          >
            {sectionTags.map((tag) => (
              <Chip
                key={tag.key}
                icon={
                  tag.gameId === primaryGameKey ? (
                    <Box component="span" sx={{ fontSize: 10, ml: 0.25 }}>
                      ★
                    </Box>
                  ) : undefined
                }
                label={tag.label}
                onDelete={() => removeGame(tag.gameId)}
                onClick={() => setPrimaryGameKey(tag.gameId)}
                size="small"
                color={tag.gameId === primaryGameKey ? "primary" : "default"}
                sx={{
                  maxWidth: 320,
                  "& .MuiChip-label": {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                }}
              />
            ))}
          </Box>
        )}

        {loading && queryProgress && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              py: 0.5,
            }}
          >
            <LinearProgress
              variant="determinate"
              value={
                queryProgress.total > 0
                  ? Math.min(
                      (queryProgress.done / queryProgress.total) * 100,
                      100,
                    )
                  : 100
              }
              sx={{ flex: 1, height: 6, borderRadius: 1 }}
            />
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", whiteSpace: "nowrap" }}
            >
              {queryProgress.label}
              {queryProgress.total > 0
                ? ` ${queryProgress.done}/${queryProgress.total}`
                : ""}{" "}
              · 已用 {queryElapsed}s
            </Typography>
          </Box>
        )}

        {skippedSectionLabels.length > 0 && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", pb: 0.5 }}
          >
            已跳过：{skippedSectionLabels.slice(0, 3).join("、")}
            {skippedSectionLabels.length > 3
              ? ` 等 ${skippedSectionLabels.length} 项`
              : ""}
          </Typography>
        )}

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        {queryResult &&
          (() => {
            const columns = queryResult.columns;
            const columnKeys = columns.map((c) => c.name);
            const renderMetricValue = (colName: string, row: ChartDataRow) => {
              const multiplier = formatLtvMultiplier(
                colName,
                row,
                columnKeys,
                ltvMode,
              );
              if (multiplier != null) return multiplier;
              return fmtValue(colName, row[colName], metricFormatMap);
            };

            if (queryResult.data.length === 0) {
              return (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    选定周期未找到数据
                  </Typography>
                </Box>
              );
            }

            const cellSx = (colIdx: number, zSticky: number) => {
              const base = {
                px: 0.75,
                py: 0.25,
                textAlign: "center",
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
                border: "none",
                outline: "1px solid",
                outlineColor: "divider",
              };
              const left = colStickyLeft[colIdx];
              if (left === undefined) return base;
              return {
                ...base,
                position: "sticky" as const,
                left,
                zIndex: zSticky,
                bgcolor: "background.paper",
              };
            };
            const thSx = (colIdx: number) => {
              const base = cellSx(colIdx, 5);
              const left = colStickyLeft[colIdx];
              return {
                ...base,
                position: "sticky" as const,
                top: 0,
                zIndex: 6,
                bgcolor: "grey.50",
                fontWeight: 700,
                ...(left !== undefined ? { left, zIndex: 7 } : {}),
              };
            };
            const groupSx = (colIdx: number) =>
              ({
                ...cellSx(colIdx, 4),
                fontWeight: colIdx === 0 ? 700 : 400,
              }) as const;
            const dataSx = (colIdx: number) => cellSx(colIdx, 1);

            // Calculate column widths based on content type
            const colWidths = columns.map((col) => {
              const n = col.name;
              const dn = col.displayName;
              if (n === COL.papp_name) return 180;
              if (dn === "月" || dn === "周" || dn === "日期") return 110;
              if (n === COL.ad_real_cost || n === COL.n_unum) return 80;
              if (n.startsWith("ltv_") || n.startsWith("roi_")) return 70;
              return 72;
            });

            const isDimCol = (n: string, displayName: string) =>
              n === COL.papp_name ||
              n === COL.cch_name ||
              n === COL.cch_name_id ||
              n === COL.channel_name ||
              displayName === "月" ||
              displayName === "周" ||
              displayName === "日期";

            // Compute sticky left offsets for dimension columns
            const colStickyLeft = columns.map((col, i) => {
              const dn = displayLabel(col.name, col.displayName);
              if (!isDimCol(col.name, dn)) return undefined;
              let left = 0;
              for (let j = 0; j < i; j++) {
                if (
                  isDimCol(
                    columns[j].name,
                    displayLabel(columns[j].name, columns[j].displayName),
                  )
                ) {
                  left += colWidths[j];
                }
              }
              return left;
            });

            const colGroup = (
              <colgroup>
                {colWidths.map((w, i) => (
                  <col key={i} width={w} />
                ))}
              </colgroup>
            );

            let rowCounter = 0;
            const renderGroup = (
              groupKey: string,
              rows: ChartDataRow[],
              tableName: "primary" | "secondary",
            ) => {
              const isPrimary = tableName === "primary";
              const parent = rows[0];
              const children = rows.slice(1);
              return (
                <Fragment key={groupKey}>
                  {/* Aggregate header row */}
                  <TableRow
                    sx={{
                      bgcolor: isPrimary
                        ? "primary.container"
                        : "surface.variant",
                      position: "sticky",
                      top: isPrimary ? "28px" : 0,
                      zIndex: isPrimary ? 3 : 2,
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                    onMouseEnter={() =>
                      setHoveredCell({ table: tableName, row: rowCounter++ })
                    }
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    {(() => {
                      // Count dimension columns to span "合计" across all of them
                      const dimColCount = columns.filter((c) =>
                        isDimCol(c.name, displayLabel(c.name, c.displayName)),
                      ).length;
                      let dimColIdx = 0;
                      return columns.map((col, ci) => {
                        const dn = displayLabel(col.name, col.displayName);
                        if (!isDimCol(col.name, dn)) {
                          // Metric column: show aggregated value
                          return (
                            <TableCell
                              key={col.name}
                              colSpan={1}
                              sx={{ ...groupSx(ci), fontWeight: 700 }}
                            >
                              {renderMetricValue(col.name, parent ?? {})}
                            </TableCell>
                          );
                        }
                        const isFirstDim = dimColIdx === 0;
                        dimColIdx++;
                        if (isFirstDim) {
                          // First dimension column: show "合计" spanning all dim cols
                          return (
                            <TableCell
                              key={col.name}
                              colSpan={dimColCount}
                              sx={{ ...groupSx(ci), fontWeight: 700 }}
                            >
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
                    const shouldHighlight =
                      hoveredCell &&
                      hoveredCell.table !== tableName &&
                      hoveredCell.row === localIdx;
                    return (
                      <TableRow
                        key={`${groupKey}-${ri}`}
                        sx={{
                          bgcolor: shouldHighlight
                            ? "action.selected"
                            : isPrimary
                              ? "primary.container"
                              : "surface.main",
                        }}
                        onMouseEnter={() =>
                          setHoveredCell({ table: tableName, row: localIdx })
                        }
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {columns.map((col, ci) => (
                          <TableCell key={col.name} sx={dataSx(ci)}>
                            {renderMetricValue(col.name, row)}
                          </TableCell>
                        ))}
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
                  if (other.scrollLeft !== el.scrollLeft)
                    other.scrollLeft = el.scrollLeft;
                } else {
                  if (other.scrollLeft !== el.scrollLeft)
                    other.scrollLeft = el.scrollLeft;
                  if (other.scrollTop !== el.scrollTop)
                    other.scrollTop = el.scrollTop;
                }
              }
            };

            const totalWidth = colWidths.reduce((a, b) => a + b, 0);

            // Unified scrollable table container with floating horizontal scrollbar
            // When sections > 1, each gets equal height via flex
            const renderScrollableTable = (
              tblKey: string,
              header: React.ReactNode,
              sections: React.ReactNode[],
            ) => (
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {header}
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    minHeight: 0,
                  }}
                >
                  {sections.length === 1 ? (
                    <Box
                      ref={(el: HTMLDivElement | null) => {
                        if (el) scrollRefs.current.set(tblKey, el);
                        else scrollRefs.current.delete(tblKey);
                      }}
                      sx={{ flex: 1, overflow: "auto", minWidth: 0 }}
                      onScroll={(e: React.UIEvent<HTMLDivElement>) =>
                        onScroll(tblKey, e.currentTarget)
                      }
                    >
                      {sections[0]}
                    </Box>
                  ) : (
                    sections.map((section, i) => (
                      <Box
                        key={i}
                        sx={{
                          flex: "1 1 50%",
                          overflow: "auto",
                          minWidth: 0,
                          minHeight: 0,
                          borderTop: i > 0 ? "2px solid" : "none",
                          borderColor: "primary.light",
                        }}
                        ref={(el: HTMLDivElement | null) => {
                          if (el)
                            scrollRefs.current.set(tblKey + "_sec" + i, el);
                          else scrollRefs.current.delete(tblKey + "_sec" + i);
                        }}
                        onScroll={(e: React.UIEvent<HTMLDivElement>) =>
                          onScroll(tblKey + "_sec" + i, e.currentTarget)
                        }
                      >
                        {section}
                      </Box>
                    ))
                  )}
                </Box>
                <Box
                  ref={(el: HTMLDivElement | null) => {
                    if (el) scrollRefs.current.set(tblKey + "_hz", el);
                    else scrollRefs.current.delete(tblKey + "_hz");
                  }}
                  sx={{
                    overflowX: "auto",
                    overflowY: "hidden",
                    bgcolor: "background.paper",
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
                  }}
                  onScroll={(e: React.UIEvent<HTMLDivElement>) =>
                    onScroll(tblKey + "_hz", e.currentTarget)
                  }
                >
                  <Box sx={{ width: totalWidth, height: 1 }} />
                </Box>
              </Box>
            );

            // Unified table component
            const renderSection = (
              groupKey: string,
              rows: ChartDataRow[],
              tableName: string,
            ): React.ReactNode => (
              <Box
                key={groupKey}
                sx={{
                  ...(tableName !== "primary"
                    ? {
                        borderTop: "2px solid",
                        borderTopColor: "primary.light",
                      }
                    : {}),
                }}
              >
                <Table
                  size="small"
                  sx={{ tableLayout: "fixed", borderCollapse: "collapse" }}
                >
                  {colGroup}
                  {(tableName === "primary" ||
                    tableName === "intra_secondary") && (
                    <TableHead>
                      <TableRow>
                        {columns.map((col, ci) => (
                          <TableCell key={col.name} sx={thSx(ci)}>
                            {displayLabel(col.name, col.displayName)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                  )}
                  <TableBody>
                    {(() => {
                      rowCounter = 0;
                      return (
                        <>
                          {renderGroup(
                            groupKey,
                            rows,
                            tableName as "primary" | "secondary",
                          )}
                        </>
                      );
                    })()}
                  </TableBody>
                </Table>
              </Box>
            );

            // Build secondary tree rows (if intra-project was active at query time)
            let intraSecondaryRows: ChartDataRow[] = [];
            if (intraSecondaryResult && intraSecondaryResult.data.length > 0) {
              const apiAgg = intraSecondaryAggRef.current;
              const aggRow: ChartDataRow = {};
              if (apiAgg) {
                Object.assign(aggRow, apiAgg);
                aggRow[COL.papp_name] = "其余渠道汇总";
                aggRow[COL.cch_name] = "其余渠道";
                aggRow[COL.channel_name] = "其余媒体";
              }
              if (!apiAgg) {
                for (const col of columns) {
                  const isDim = isDimCol(
                    col.name,
                    displayLabel(col.name, col.displayName),
                  );
                  if (!isDim) {
                    let sum = 0,
                      hasVal = false;
                    for (const r of intraSecondaryResult.data) {
                      const v = r[col.name];
                      if (typeof v === "number") {
                        sum += v;
                        hasVal = true;
                      }
                    }
                    aggRow[col.name] = hasVal ? sum : "";
                  }
                }
                for (const col of columns) {
                  const dn = displayLabel(col.name, col.displayName);
                  if (dn === "日期" || dn === "周" || dn === "月") {
                    aggRow[col.name] = "汇总";
                    break;
                  }
                }
              }
              if (!apiAgg) {
                // Set dimension labels for manual agg
                aggRow[COL.papp_name] = "其余渠道汇总";
                aggRow[COL.cch_name] = "其余渠道";
                aggRow[COL.channel_name] = "其余媒体";
              }
              const detailRows = intraSecondaryResult.data.map((r) => {
                const row: ChartDataRow = {};
                for (const col of columns) {
                  const dn = displayLabel(col.name, col.displayName);
                  const isTime = dn === "日期" || dn === "周" || dn === "月";
                  const raw = r[col.name];
                  if (raw != null) {
                    row[col.name] =
                      isTime && typeof raw === "number"
                        ? (() => {
                            const d = new Date(Number.isFinite(raw) ? raw : 0);
                            return !isNaN(d.getTime())
                              ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
                              : String(raw);
                          })()
                        : raw;
                  } else if (
                    col.name === COL.cch_name ||
                    col.name === COL.cch_name_id
                  ) {
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
              const snapAnchors: AnchorKey[] =
                snap.anchors && snap.anchors.length > 0
                  ? snap.anchors
                  : ["上线时间"];
              const multiAnchor = snapAnchors.length > 1;
              const aggCache = sectionAggregateCacheRef.current;

              // 单选轮次时保持原有单一对比;多选轮次时每个轮次独立分表(外对比),
              // 分表标签带轮次前缀,与 sectionAggregateCacheRef 的 key 一致。
              const buildFor = (
                subset: Record<string, unknown>[],
                anchor?: AnchorKey,
              ) => {
                const lbl = (label: string) =>
                  anchor
                    ? anchorSectionLabel(anchor, label, multiAnchor)
                    : label;
                const snapGames = snap.games;
                const snapCchNames = snap.cchNames;
                const snapChannels = snap.channels;
                const sectionAnchor: AnchorKey = anchor ?? snapAnchors[0];
                const isMultiGame = snapGames.length > 1;
                const isMultiCch = snapCchNames.length > 1;
                const isMultiChannel = snapChannels.length > 1;
                const isIntraSnap =
                  snapAnchors.length === 1 &&
                  snapGames.length === 1 &&
                  snapCchNames.length <= 1 &&
                  snapChannels.length <= 1 &&
                  (snapCchNames.length > 0 || snapChannels.length > 0);

                // 分表窗口起始日期(用于按数据日期排序;与标签计算保持一致)
                const sectionStart = (
                  game: SelectedGame,
                  cchName?: string,
                ): string | undefined => {
                  const resolvedCch =
                    cchName ??
                    (snapCchNames.length === 1
                      ? extractName(snapCchNames[0])
                      : undefined);
                  return resolveDateRange(game, resolvedCch, sectionAnchor)
                    ?.start;
                };

                // Helper: build section from detail rows
                const makeSection = (
                  label: string,
                  filterFn: (row: ChartDataRow) => boolean,
                  tableName: string,
                  start?: string,
                ) => {
                  const allRows = subset.filter(filterFn) as ChartDataRow[];
                  if (allRows.length === 0) return null;
                  const dataAgg = allRows.find((r) =>
                    String(r.id ?? "").startsWith("p_"),
                  );
                  const detailRows = allRows.filter(
                    (r) => !String(r.id ?? "").startsWith("p_"),
                  );
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
                        <Table
                          size="small"
                          sx={{
                            tableLayout: "fixed",
                            borderCollapse: "collapse",
                          }}
                        >
                          {colGroup}
                          {(tableName === "primary" ||
                            tableName === "intra_secondary") && (
                            <TableHead>
                              <TableRow>
                                {columns.map((col, ci) => (
                                  <TableCell key={col.name} sx={thSx(ci)}>
                                    {displayLabel(col.name, col.displayName)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            </TableHead>
                          )}
                          <TableBody>
                            {detailRows.map((row, ri) => (
                              <TableRow key={ri} hover>
                                {columns.map((col, ci) => (
                                  <TableCell key={col.name} sx={dataSx(ci)}>
                                    {renderMetricValue(col.name, row)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Box>
                    );
                  };
                  return {
                    rows: detailRows,
                    render: renderFn,
                    start,
                    anchor: sectionAnchor,
                    label,
                  };
                };

                // 1) Multi-game + filters: each game is a section
                if (isMultiGame) {
                  return snapGames.map((g) =>
                    makeSection(
                      lbl(g.papp_name),
                      (r) => String(r[COL.papp_name] ?? "") === g.papp_name,
                      "primary",
                      sectionStart(g),
                    ),
                  );
                }

                // 2) Single game + multiple cch × multiple channels: M×N sections
                if (isMultiCch && isMultiChannel) {
                  return snapCchNames.flatMap((cch) =>
                    snapChannels.map((ch) =>
                      makeSection(
                        lbl(`${extractName(cch)} × ${ch}`),
                        (r) =>
                          String(r[COL.cch_name] ?? "") === extractName(cch) &&
                          String(r[COL.channel_name] ?? "") === ch,
                        "primary",
                        sectionStart(snapGames[0], extractName(cch)),
                      ),
                    ),
                  );
                }

                // 3) Single game + multiple cch_names: each cch is a section
                if (isMultiCch) {
                  return snapCchNames.map((cch) =>
                    makeSection(
                      lbl(extractName(cch)),
                      (r) => String(r[COL.cch_name] ?? "") === extractName(cch),
                      "primary",
                      sectionStart(snapGames[0], extractName(cch)),
                    ),
                  );
                }

                // 4) Single game + multiple channels: each channel is a section
                if (isMultiChannel) {
                  return snapChannels.map((ch) =>
                    makeSection(
                      lbl(ch),
                      (r) => String(r[COL.channel_name] ?? "") === ch,
                      "primary",
                      sectionStart(snapGames[0]),
                    ),
                  );
                }

                // 5) Single game + single filter: intra-project (primary vs remaining)
                if (isIntraSnap) {
                  const game = snapGames[0];
                  const gameName = game.papp_name;
                  const primaryFilter = (r: ChartDataRow) => {
                    if (String(r[COL.papp_name] ?? "") !== gameName)
                      return false;
                    if (
                      snapCchNames.length === 1 &&
                      (r[COL.cch_name] ?? "") !== "" &&
                      String(r[COL.cch_name] ?? "") !==
                        extractName(snapCchNames[0])
                    )
                      return false;
                    if (
                      snapChannels.length === 1 &&
                      (r[COL.channel_name] ?? "") !== "" &&
                      String(r[COL.channel_name] ?? "") !== snapChannels[0]
                    )
                      return false;
                    return true;
                  };
                  const primarySection = makeSection(
                    lbl(gameName),
                    primaryFilter,
                    "primary",
                    sectionStart(game),
                  );
                  let secondarySection: ReturnType<typeof makeSection> | null =
                    null;
                  if (
                    intraSecondaryResult &&
                    intraSecondaryResult.data.length > 0
                  ) {
                    secondarySection = {
                      rows: intraSecondaryRows,
                      render: (_key: string) =>
                        renderSection(
                          "intra_secondary_data",
                          intraSecondaryRows,
                          "intra_secondary",
                        ),
                      start: primarySection?.start,
                      anchor: sectionAnchor,
                      label: `${lbl(gameName)}（其余渠道）`,
                    };
                  }
                  return [primarySection, secondarySection].filter(Boolean);
                }

                // 6) Single game + no filters: single section
                return [
                  makeSection(
                    lbl(snapGames[0]?.papp_name ?? ""),
                    () => true,
                    "primary",
                    sectionStart(snapGames[0]),
                  ),
                ];
              };

              if (multiAnchor) {
                return snapAnchors.flatMap((anchor) =>
                  buildFor(
                    data.filter(
                      (r) => String(r.__anchor ?? "上线时间") === anchor,
                    ),
                    anchor,
                  ),
                );
              }
              return buildFor(data);
            };

            const sections = buildSections()
              .filter(Boolean)
              .map((s) => s!)
              // 分表按数据日期先后排序,而不是点击顺序
              .sort(compareSectionOrder);

            if (sections.length === 0) {
              return (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    选定周期未找到数据
                  </Typography>
                </Box>
              );
            }

            return (
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    minWidth: 0,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  {renderScrollableTable(
                    "_primary",
                    null,
                    sections.map((s, i) => (
                      <Box key={i}>{s.render("sec" + i)}</Box>
                    )),
                  )}
                </Box>
              </Box>
            );
          })()}

        {queryResult && queryResult.data.length === 0 && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              py: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              选定周期未找到数据
            </Typography>
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
