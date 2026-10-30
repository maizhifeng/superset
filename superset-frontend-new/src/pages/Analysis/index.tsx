import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import ClearIcon from "@mui/icons-material/Clear";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useNavigate } from "react-router-dom";
import PageFrame from "@/components/PageFrame";
import { Grid2 } from "@/superset-ui-mui/components";
import { useRecentAnalysisTopics } from "@/store/recentAnalysisTopics";
import AnalysisOverview from "./components/AnalysisOverview";
import { scheduleAnalysisCacheWarmup } from "./warmup";
import TopicCard from "./components/TopicCard";
import { ANALYSIS_TOPICS } from "./topics";
import type { AnalysisTopic } from "./types";

interface DataScopeItem {
  title: string;
  description: string;
}

const DATA_SCOPE_ITEMS: DataScopeItem[] = [
  {
    title: "数据集",
    description:
      "ad_combined_report（国内 + 海外合并），全部专题共用同一数据集与日期字段。",
  },
  {
    title: "观察期与筛选",
    description:
      "默认近 30 天，可按日期、主游戏、地区、媒体、渠道商与平台筛选；筛选条件会写入链接，可直接分享。",
  },
  {
    title: "CPA 与付费留存率",
    description:
      "CPA 使用返点后消耗计算；付费留存率使用 1 日付费数作为分母（N 日付费留存数 / 1 日付费数）。",
  },
  {
    title: "成熟窗口",
    description:
      "留存与 LTV/ROI 专题会按观察期将 KPI 与明细统计窗口整体前移，趋势图仍按所选日期展示。",
  },
];

const DATA_SCOPE_PANEL_ID = "analysis-data-scope";

/** Collapsible footnote that explains the shared dataset and observation windows. */
function DataScopePanel() {
  const [open, setOpen] = useState(false);
  return (
    <Paper
      variant="outlined"
      sx={{ borderRadius: 2, overflow: "hidden" }}
      data-testid="analysis-data-scope"
    >
      <Button
        fullWidth
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={DATA_SCOPE_PANEL_ID}
        endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{
          justifyContent: "flex-start",
          textTransform: "none",
          color: "text.primary",
          px: 2,
          py: 1.25,
          "& .MuiButton-endIcon": { ml: "auto", color: "text.disabled" },
        }}
      >
        <Box
          component="span"
          sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 18, color: "text.disabled" }} />
          <Box
            component="span"
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
              数据口径与观察期
            </Typography>
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
            >
              数据集、观察窗口与指标计算方式
            </Typography>
          </Box>
        </Box>
      </Button>
      <Collapse in={open} id={DATA_SCOPE_PANEL_ID} unmountOnExit>
        <Box
          component="ul"
          sx={{
            m: 0,
            pl: 4.5,
            pr: 2.5,
            pb: 2,
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          {DATA_SCOPE_ITEMS.map((item) => (
            <Box component="li" key={item.title}>
              <Typography variant="caption" color="text.secondary">
                <Box
                  component="span"
                  sx={{ fontWeight: 600, color: "text.primary" }}
                >
                  {item.title}：
                </Box>
                {item.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

interface RecentTopicsRowProps {
  topics: AnalysisTopic[];
  onOpen: (topicId: string) => void;
  onClear: () => void;
}

/** Shortcut pills for topics opened on this browser; hidden until one exists. */
function RecentTopicsRow({ topics, onOpen, onClear }: RecentTopicsRowProps) {
  return (
    <Paper
      variant="outlined"
      data-testid="analysis-recent-topics"
      sx={{
        px: 2,
        py: 1,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 600 }}
      >
        最近查看
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.75,
          flex: 1,
          minWidth: 0,
        }}
      >
        {topics.map((topic) => (
          <Button
            key={topic.id}
            size="small"
            variant="outlined"
            aria-label={`最近查看：${topic.title}`}
            onClick={() => onOpen(topic.id)}
            sx={{
              borderRadius: 999,
              textTransform: "none",
              py: 0.125,
              px: 1.25,
              fontSize: "0.75rem",
            }}
          >
            {topic.title}
          </Button>
        ))}
      </Box>
      <Button
        size="small"
        color="inherit"
        startIcon={<ClearIcon sx={{ fontSize: 15 }} />}
        aria-label="清空最近查看"
        onClick={onClear}
        sx={{ fontSize: "0.75rem", color: "text.secondary", flexShrink: 0 }}
      >
        清空
      </Button>
    </Paper>
  );
}

/**
 * 专题分析大厅：把预置的业务分析视角集中在一个入口下。
 */
export default function AnalysisHome() {
  const navigate = useNavigate();
  useEffect(() => {
    // Warm the shared Redis cache for the default 30-day topic views once per
    // session; the warmup is idle-scheduled and never blocks the hub.
    scheduleAnalysisCacheWarmup();
  }, []);
  const recentItems = useRecentAnalysisTopics((state) => state.items);
  const clearRecent = useRecentAnalysisTopics((state) => state.clear);

  const recentTopics = useMemo(() => {
    const byId = new Map(ANALYSIS_TOPICS.map((topic) => [topic.id, topic]));
    const seen = new Set<string>();
    const topics: AnalysisTopic[] = [];
    for (const item of recentItems) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const topic = byId.get(item.id);
      if (topic) topics.push(topic);
    }
    return topics;
  }, [recentItems]);

  const recentIds = useMemo(
    () => new Set(recentTopics.map((topic) => topic.id)),
    [recentTopics],
  );

  const openTopic = (topicId: string) => navigate(`/analysis/${topicId}`);

  return (
    <PageFrame
      page="analysis"
      title="专题分析"
      subtitle="围绕成本、留存、LTV、付费与渠道效率，快速进入预置分析视角"
      compact
      hideTitle
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <AnalysisOverview />

          {recentTopics.length > 0 && (
            <RecentTopicsRow
              topics={recentTopics}
              onOpen={openTopic}
              onClear={clearRecent}
            />
          )}

          <Grid2 container spacing={2}>
            {ANALYSIS_TOPICS.map((topic) => (
              <Grid2 key={topic.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <TopicCard
                  topic={topic}
                  recent={recentIds.has(topic.id)}
                  onClick={() => openTopic(topic.id)}
                />
              </Grid2>
            ))}
          </Grid2>

          <DataScopePanel />
        </Box>
      </Box>
    </PageFrame>
  );
}
