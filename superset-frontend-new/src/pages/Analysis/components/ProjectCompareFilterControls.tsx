import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import {
  ANCHORS,
  ANCHOR_LABELS,
  DEFAULT_PROJECT_COMPARE_PERIOD_DAYS,
  normalizeAnchors,
  PROJECT_COMPARE_PERIOD_DAYS,
  type AnchorKey,
} from "../anchorOptions";
import type { AnalysisFilters } from "../filters";
import { useProjectCompareOptions } from "../hooks/useProjectCompareOptions";
import {
  projectKey,
  projectOptionLabel,
  type ProjectOption,
} from "../projectCompare";
import { PROJECT_COMPARE_METRIC_KEYS, topicMetric } from "../topics";
import type { AnalysisTopic } from "../types";

/**
 * Project-comparison controls, rendered inside the page filter bar: 基准
 * (multi), 窗口 (single) and 项目 (multi, empty = automatic top spenders).
 * They only write the shared filter state; the comparison view derives its
 * windows, queries and chart from it.  The metric picker is exported
 * separately because it sits after the column filters (媒体).
 */
/**
 * Render an autocomplete input whose label is always shrunk, matching the
 * column filters' look: the label sits on the border and the placeholder
 * (or the "automatic" hint) stays visible at rest.
 */
function inputFor(
  params: React.ComponentProps<typeof TextField>,
  label: string,
  placeholder?: string,
) {
  const { slotProps, ...rest } = params;
  const inputSlotProps = (slotProps ?? {}) as Record<string, unknown>;
  return (
    <TextField
      {...rest}
      label={label}
      placeholder={placeholder}
      slotProps={{
        ...inputSlotProps,
        inputLabel: {
          ...((inputSlotProps.inputLabel as object) ?? {}),
          shrink: true,
        },
      }}
    />
  );
}

export default function ProjectCompareFilterControls({
  filters,
  onChange,
}: {
  filters: AnalysisFilters;
  onChange: (next: AnalysisFilters) => void;
}) {
  const { options: projects, loading: projectsLoading } =
    useProjectCompareOptions();

  const selectedProjects = projects.filter((project) =>
    filters.projects.includes(projectKey(project)),
  );

  return (
    <>
      <Autocomplete<AnchorKey, true>
        multiple
        size="small"
        disableCloseOnSelect
        options={ANCHORS.map((anchor) => anchor.key)}
        value={filters.anchors}
        getOptionLabel={(option) => ANCHOR_LABELS[option]}
        onChange={(_event, value) =>
          onChange({ ...filters, anchors: normalizeAnchors(value) })
        }
        renderInput={(params) =>
          inputFor(
            params,
            "基准",
            filters.anchors.length === 0 ? "选择基准" : undefined,
          )
        }
        sx={{ minWidth: 190, maxWidth: 260 }}
      />

      <Autocomplete<number, false>
        size="small"
        options={[...PROJECT_COMPARE_PERIOD_DAYS]}
        value={filters.periodDays}
        getOptionLabel={(option) => `${option}天`}
        onChange={(_event, value) =>
          onChange({
            ...filters,
            periodDays: value ?? DEFAULT_PROJECT_COMPARE_PERIOD_DAYS,
          })
        }
        renderInput={(params) => inputFor(params, "窗口")}
        sx={{ width: 130 }}
      />

      <Autocomplete<ProjectOption, true>
        multiple
        size="small"
        disableCloseOnSelect
        // One truncated chip + "+N" keeps the field on the toolbar's single
        // 36px row: project names are long enough to wrap the tags otherwise.
        // A custom renderer is used instead of ``limitTags`` because the default
        // one expands the tags again while the input is focused.
        renderValue={(value, getItemProps) => {
          const visible = value.slice(0, 1);
          const hidden = value.slice(visible.length);
          return [
            ...visible.map((option, index) => {
              const { key, ...itemProps } = getItemProps({ index });
              return (
                <Chip
                  key={key}
                  size="small"
                  label={projectOptionLabel(option)}
                  {...itemProps}
                />
              );
            }),
            hidden.length > 0 ? (
              <Tooltip
                key="hidden-projects"
                title={hidden
                  .map((option) => projectOptionLabel(option))
                  .join("、")}
              >
                <Chip size="small" label={`+${hidden.length}`} />
              </Tooltip>
            ) : null,
          ];
        }}
        loading={projectsLoading}
        loadingText="正在加载项目…"
        noOptionsText="没有可对比的项目（需先配置上线/测试起始日期）"
        options={projects}
        value={selectedProjects}
        isOptionEqualToValue={(option, value) =>
          projectKey(option) === projectKey(value)
        }
        getOptionLabel={projectOptionLabel}
        onChange={(_event, value) =>
          onChange({ ...filters, projects: value.map(projectKey) })
        }
        renderInput={(params) =>
          inputFor(
            params,
            "项目",
            selectedProjects.length === 0 ? "选择项目" : undefined,
          )
        }
        sx={{
          minWidth: 240,
          maxWidth: 380,
          // Clamp the tag row instead of letting it grow the toolbar row.
          "& .MuiChip-root": { maxWidth: 150 },
          "& .MuiChip-label": {
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingLeft: "6px",
            paddingRight: "6px",
          },
        }}
      />
    </>
  );
}

/**
 * Chart-metric picker, rendered after the column filters (媒体 etc.) in the
 * same filter row.
 */
export function ProjectCompareMetricFilter({
  topic,
  filters,
  onChange,
}: {
  topic: AnalysisTopic;
  filters: AnalysisFilters;
  onChange: (next: AnalysisFilters) => void;
}) {
  const metricKeys = topic.extra?.metrics ?? [...PROJECT_COMPARE_METRIC_KEYS];
  const activeMetricKey =
    filters.compareMetric && metricKeys.includes(filters.compareMetric)
      ? filters.compareMetric
      : metricKeys[0];
  return (
    <Autocomplete<string, false>
      size="small"
      options={metricKeys}
      value={activeMetricKey}
      getOptionLabel={(option) => topicMetric(topic, option).label}
      onChange={(_event, value) =>
        onChange({ ...filters, compareMetric: value ?? undefined })
      }
      renderInput={(params) => inputFor(params, "指标")}
      sx={{ width: 140 }}
    />
  );
}
