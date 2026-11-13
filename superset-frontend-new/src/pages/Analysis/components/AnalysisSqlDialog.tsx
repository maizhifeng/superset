import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  fetchAnalysisTopicSql,
  type AnalysisSqlPreview,
} from "@/api/chartData";
import { useNotificationStore } from "@/store/notificationStore";
import { ANCHOR_LABELS, normalizeAnchors } from "../anchorOptions";
import { defaultFilters, type AnalysisFilters } from "../filters";
import { useProjectCompareOptions } from "../hooks/useProjectCompareOptions";
import {
  buildProjectCompareQuery,
  planProjectCompareSections,
  projectKey,
  projectOptionLabel,
  type ProjectOption,
} from "../projectCompare";
import {
  buildBreakdownQuery,
  buildKpiQueryPlan,
  buildTrendQueryPlan,
} from "../query";
import type { AnalysisTopic } from "../types";

type SqlSide = "mainland" | "oversea" | "wide" | "base";

/** Titles of the five default-view queries, in request order. */
const SECTION_TITLES = [
  "KPI 当前期",
  "KPI 对比期",
  "趋势当前期",
  "趋势对比期",
  "明细",
];

interface AnalysisSqlDialogProps {
  topic: AnalysisTopic;
  /** Current page filters; a view-owning topic compiles its live queries. */
  filters: AnalysisFilters;
  open: boolean;
  onClose: () => void;
}

/**
 * "查看 SQL" dialog: shows the SQL the backend compiles for the topic's
 * default view (近 30 天 / 默认维度 / 无筛选), without executing it.
 */
export default function AnalysisSqlDialog({
  topic,
  filters,
  open,
  onClose,
}: AnalysisSqlDialogProps) {
  const notify = useNotificationStore((state) => state.notify);
  const [side, setSide] = useState<SqlSide>("mainland");
  const [preview, setPreview] = useState<AnalysisSqlPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Project metadata is shared with the filter bar / comparison view; the hook
  // only reads the module cache here, so opening the dialog never refetches it.
  const { options: projects, startMaps } = useProjectCompareOptions();

  // Queries shown by the dialog.  A view-owning topic is compiled from the
  // current page filters (基准 / 窗口 / 项目), so the SQL matches exactly the
  // requests the comparison view is issuing; other topics keep the default
  // five-query view.
  const { queries, titles } = useMemo(() => {
    if (topic.hiddenSections?.length) {
      const selectedProjects = filters.projects
        .map((key) => projects.find((project) => projectKey(project) === key))
        .filter((project): project is ProjectOption => project !== undefined);
      const plan = planProjectCompareSections(
        selectedProjects,
        normalizeAnchors(filters.anchors),
        startMaps,
        filters.periodDays,
      );
      return {
        queries: plan.sections.map(
          (section) =>
            buildProjectCompareQuery(
              topic,
              filters,
              section,
            ) as unknown as Record<string, unknown>,
        ),
        titles: plan.sections.map(
          (section) =>
            `${projectOptionLabel(section.project)} · ${
              ANCHOR_LABELS[section.anchor]
            } · ${section.windowLabel}`,
        ),
      };
    }
    const defaults = defaultFilters(topic);
    const kpi = buildKpiQueryPlan(topic, defaults);
    const trend = buildTrendQueryPlan(topic, defaults);
    const breakdown = buildBreakdownQuery(topic, defaults);
    return {
      queries: [
        kpi.totals,
        kpi.previous,
        trend.trend,
        trend.previousTrend,
        breakdown,
      ] as unknown as Record<string, unknown>[],
      titles: SECTION_TITLES,
    };
  }, [filters, projects, startMaps, topic]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchAnalysisTopicSql(topic.id, queries, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setPreview(response.data?.result ?? null);
        setLoading(false);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error ? requestError.message : "SQL 加载失败",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, queries, topic.id]);

  const copy = async (sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: "SQL 已复制" });
    } catch {
      notify({ severity: "error", message: "复制失败，请手动选择文本" });
    }
  };

  const sections =
    preview && side !== "base"
      ? preview.queries.map((query, index) => ({
          title: titles[index] ?? `查询 ${index + 1}`,
          sql:
            side === "mainland"
              ? query.mainland_sql
              : side === "oversea"
                ? query.oversea_sql
                : (query.wide_mainland_sql ?? "（后端未返回对照 SQL）"),
        }))
      : [];

  const copyBlock = (title: string, sql: string) => (
    <Box key={title} sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Button
          size="small"
          startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
          onClick={() => void copy(sql)}
          sx={{ textTransform: "none", ml: "auto" }}
        >
          复制
        </Button>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          bgcolor: "action.hover",
          borderRadius: 1,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          fontSize: "0.72rem",
          lineHeight: 1.55,
          overflow: "auto",
          maxHeight: "26vh",
          whiteSpace: "pre",
        }}
      >
        {sql}
      </Box>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>默认视图 SQL · {topic.title}</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: "72vh" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {topic.hiddenSections?.length
            ? "按当前页面筛选（基准 / 窗口 / 项目）编译：每个项目 × 基准一条对比查询，与页面实际执行的请求一一对应；修改筛选后会重新生成。"
            : "按默认视图（近 30 天、默认拆解维度、无筛选）编译；切换筛选后 SQL 结构相同，只有时间范围与筛选值变化。"}
        </Typography>
        <Tabs
          value={side}
          onChange={(_event, value: SqlSide) => setSide(value)}
          sx={{ mb: 1.5 }}
        >
          <Tab value="mainland" label="大陆侧" />
          <Tab value="oversea" label="海外侧" />
          <Tab value="wide" label="对照：历史宽视图 SQL" />
          <Tab value="base" label="基础 SQL（含窗口标记）" />
        </Tabs>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {!loading && error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {!loading &&
          !error &&
          topic.hiddenSections?.length &&
          queries.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              当前未选择基准或项目，对比 SQL 会随顶部筛选条的选择生成。
            </Typography>
          )}
        {!loading && !error && preview && side === "base" && (
          <>
            {copyBlock("大陆侧基础 SQL（窄视图）", preview.base_sql.mainland)}
            {copyBlock("海外侧基础 SQL", preview.base_sql.oversea)}
            {preview.base_sql.wide_mainland
              ? copyBlock(
                  "历史宽视图基础 SQL（对照）",
                  preview.base_sql.wide_mainland,
                )
              : null}
          </>
        )}
        {!loading &&
          !error &&
          side !== "base" &&
          sections.map((section) => copyBlock(section.title, section.sql))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}
