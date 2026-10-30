import type { KeyboardEvent } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { alpha, type Theme } from "@mui/material/styles";
import type { AnalysisTopic } from "../types";

/** Number of headline metrics previewed on a topic card. */
const CORE_METRIC_COUNT = 3;

/**
 * Curated headline metrics per topic.  The first N KPIs are not always the
 * most representative (cost leads with gross/net spend), so each topic names
 * the three metrics a newcomer should recognise.
 */
const TOPIC_HIGHLIGHTS: Record<string, string[]> = {
  cost: ["spend", "newUsers", "cpa"],
  retention: ["newUsers", "retention2", "paidRetention7"],
  "ltv-roi": ["ltv_7", "roi_7", "cumulativeRoi"],
  payment: ["revenue", "payRate1", "activePayers"],
  channel: ["spend", "cpa", "revenueRoi"],
};

const TOPIC_TINTS: Record<string, (theme: Theme) => string> = {
  "primary.main": (theme) => alpha(theme.palette.primary.main, 0.12),
  "secondary.main": (theme) => alpha(theme.palette.secondary.main, 0.12),
  "success.main": (theme) => alpha(theme.palette.success.main, 0.12),
  "warning.main": (theme) => alpha(theme.palette.warning.main, 0.12),
  "info.main": (theme) => alpha(theme.palette.info.main, 0.12),
};

/** Tinted icon-tile background derived from the topic's palette token. */
function topicTint(color: string): (theme: Theme) => string {
  return TOPIC_TINTS[color] ?? (() => "transparent");
}

/** Headline metric labels shown as static chips; never triggers a request. */
function coreMetricLabels(topic: AnalysisTopic): string[] {
  const keys = TOPIC_HIGHLIGHTS[topic.id] ?? topic.kpis;
  return keys
    .slice(0, CORE_METRIC_COUNT)
    .map((key) => topic.metrics[key]?.label ?? key);
}

interface TopicCardProps {
  topic: AnalysisTopic;
  onClick: () => void;
  /** Marks a topic the user opened recently. */
  recent?: boolean;
}

/**
 * Entry card of one analysis topic.  The whole card is one keyboard-operable
 * control (Enter/Space), so the hall can be browsed without a mouse.
 */
export default function TopicCard({
  topic,
  onClick,
  recent = false,
}: TopicCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`进入${topic.title}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      sx={{
        position: "relative",
        height: "100%",
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        cursor: "pointer",
        transition: (theme) =>
          theme.transitions.create(["box-shadow", "transform"], {
            duration: theme.transitions.duration.short,
          }),
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "var(--mui-palette-shadow-cardHover)",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: topic.color,
            bgcolor: topicTint(topic.color),
          }}
        >
          {topic.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
            {topic.title}
          </Typography>
          {topic.maturityDays ? (
            <Typography variant="caption" color="text.disabled" noWrap>
              观察期 {topic.maturityDays} 天
            </Typography>
          ) : null}
        </Box>
        {recent && (
          <Box
            sx={{
              flexShrink: 0,
              px: 0.75,
              py: 0.125,
              borderRadius: 999,
              bgcolor: "action.hover",
              color: "text.secondary",
              fontSize: "0.6875rem",
              fontWeight: 600,
              lineHeight: 1.6,
            }}
          >
            最近查看
          </Box>
        )}
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", minHeight: 34 }}
      >
        {topic.description}
      </Typography>

      <Box>
        <Typography variant="caption" color="text.disabled">
          核心指标
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
          {coreMetricLabels(topic).map((label) => (
            <Chip
              key={label}
              label={label}
              size="small"
              variant="outlined"
              sx={{
                height: 22,
                borderRadius: 1,
                color: "text.secondary",
                "& .MuiChip-label": { px: 0.75, fontSize: "0.6875rem" },
              }}
            />
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          mt: "auto",
          color: "primary.main",
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          进入分析
        </Typography>
        <ChevronRightIcon sx={{ fontSize: 15 }} />
      </Box>
    </Card>
  );
}
