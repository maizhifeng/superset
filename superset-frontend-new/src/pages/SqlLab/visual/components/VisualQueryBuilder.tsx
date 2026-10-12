import { useEffect, useMemo, useState } from "react";
import type { Database } from "@/types/api";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import StorageIcon from "@mui/icons-material/Storage";
import LinkIcon from "@mui/icons-material/Link";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FunctionsIcon from "@mui/icons-material/Functions";
import SortIcon from "@mui/icons-material/Sort";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { BuilderContext } from "./builderContext";
import StepCard from "./StepCard";
import DataSourceStep from "./DataSourceStep";
import JoinStep from "./JoinStep";
import ColumnsStep from "./ColumnsStep";
import FilterStep from "./FilterStep";
import SummaryStep from "./SummaryStep";
import SortLimitStep from "./SortLimitStep";
import SqlPreview from "./SqlPreview";
import { isAggregated, type VisualStage } from "../types";
import {
  columnsSummary,
  dataSourceSummary,
  filtersSummary,
  joinSummary,
  sortSummary,
  summarySummary,
} from "../summaries";

interface VisualQueryBuilderProps {
  /** 真实阶段（含来源与名称，用于容器管理）。 */
  stages: VisualStage[];
  /** 每个阶段的上下文（ctx.model 为该阶段的扁平视图）。 */
  ctxs: BuilderContext[];
  databaseId: number | "";
  schema: string;
  databases: Database[];
  schemas: string[];
  schemasLoading: boolean;
  onDatabaseChange: (id: number) => void;
  onSchemaChange: (schema: string) => void;
  formattedSql: string;
  onAddStage: () => void;
  onRemoveStage: (stageId: string) => void;
  onRenameStage: (stageId: string, name: string) => void;
}

/** CTE 名称输入框：本地态编辑，失焦/回车提交（提交时自动去重）。 */
function StageNameInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextField
      size="small"
      variant="standard"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onCommit(draft);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      sx={{
        width: 150,
        "& input": {
          fontSize: "0.8125rem",
          fontWeight: 600,
          fontFamily: "monospace",
          py: 0,
        },
      }}
      slotProps={{ htmlInput: { "aria-label": "CTE 名称" } }}
    />
  );
}

export default function VisualQueryBuilder({
  stages,
  ctxs,
  databaseId,
  schema,
  databases,
  schemas,
  schemasLoading,
  onDatabaseChange,
  onSchemaChange,
  formattedSql,
  onAddStage,
  onRemoveStage,
  onRenameStage,
}: VisualQueryBuilderProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const isExpanded = (stageId: string, step: string, defaultOpen = false) =>
    expanded[`${stageId}:${step}`] ?? defaultOpen;

  const stepDisabledSummary = useMemo(() => "请先选择数据源", []);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        alignItems: "flex-start",
        gap: 1,
      }}
    >
      {/* 左侧：阶段（CTE）容器堆叠 */}
      <Box
        sx={{
          flex: { xs: "none", md: 1 },
          minWidth: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {stages.map((stage, index) => {
          const ctx = ctxs[index];
          if (!ctx) return null;
          const hasTable = Boolean(ctx.model.table);
          const last = index === stages.length - 1;
          const stageReferenced = ctxs.some(
            (c, i) => i > index && c.sourceStageId === stage.id,
          );
          return (
            <Paper
              key={stage.id}
              variant="outlined"
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                // 外层阶段容器：非首个阶段用主题色边框体现 CTE 层级。
                borderColor: index === 0 ? "divider" : "primary.light",
                bgcolor:
                  index === 0 ? "background.paper" : "background.default",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.5,
                  py: 0.5,
                  bgcolor: index === 0 ? "transparent" : "action.hover",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: last ? "primary.main" : "action.selected",
                    color: last ? "primary.contrastText" : "text.secondary",
                    flexShrink: 0,
                  }}
                >
                  {last
                    ? `阶段 ${index + 1} · 最终输出`
                    : `阶段 ${index + 1} · CTE`}
                </Typography>
                <StageNameInput
                  value={stage.name}
                  onCommit={(name) => onRenameStage(stage.id, name)}
                />
                <Box sx={{ flex: 1 }} />
                {stages.length > 1 && (
                  <Tooltip
                    title={
                      stageReferenced
                        ? "该阶段被后续阶段引用，不能删除"
                        : "删除该阶段"
                    }
                  >
                    <span>
                      <IconButton
                        size="small"
                        aria-label="删除阶段"
                        onClick={() => onRemoveStage(stage.id)}
                        disabled={stageReferenced}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
              <Box
                sx={{
                  p: 1,
                  pt: 0.75,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                <StepCard
                  index={1}
                  title="数据源"
                  icon={<StorageIcon sx={{ fontSize: 16 }} />}
                  summary={dataSourceSummary(ctx)}
                  expanded={isExpanded(
                    stage.id,
                    "data",
                    hasTable ? index > 0 : true,
                  )}
                  onToggle={() => toggle(`${stage.id}:data`)}
                >
                  <DataSourceStep
                    ctx={ctx}
                    databaseId={databaseId}
                    schema={ctx.model.schema || schema}
                    databases={databases}
                    schemas={schemas}
                    schemasLoading={schemasLoading}
                    onDatabaseChange={onDatabaseChange}
                    onSchemaChange={onSchemaChange}
                  />
                </StepCard>

                <StepCard
                  index={2}
                  title="关联表"
                  icon={<LinkIcon sx={{ fontSize: 16 }} />}
                  summary={hasTable ? joinSummary(ctx) : stepDisabledSummary}
                  expanded={isExpanded(stage.id, "joins")}
                  onToggle={() => toggle(`${stage.id}:joins`)}
                  disabled={!hasTable}
                >
                  <JoinStep ctx={ctx} />
                </StepCard>

                <StepCard
                  index={3}
                  title="字段"
                  icon={<ViewColumnIcon sx={{ fontSize: 16 }} />}
                  summary={
                    hasTable
                      ? isAggregated(ctx.model)
                        ? "汇总模式下由分组与指标决定输出"
                        : columnsSummary(ctx)
                      : stepDisabledSummary
                  }
                  expanded={isExpanded(stage.id, "columns")}
                  onToggle={() => toggle(`${stage.id}:columns`)}
                  disabled={!hasTable}
                >
                  <ColumnsStep ctx={ctx} />
                </StepCard>

                <StepCard
                  index={4}
                  title="筛选"
                  icon={<FilterAltIcon sx={{ fontSize: 16 }} />}
                  summary={hasTable ? filtersSummary(ctx) : stepDisabledSummary}
                  expanded={isExpanded(stage.id, "filters")}
                  onToggle={() => toggle(`${stage.id}:filters`)}
                  disabled={!hasTable}
                >
                  <FilterStep ctx={ctx} />
                </StepCard>

                <StepCard
                  index={5}
                  title="汇总"
                  icon={<FunctionsIcon sx={{ fontSize: 16 }} />}
                  summary={hasTable ? summarySummary(ctx) : stepDisabledSummary}
                  expanded={isExpanded(stage.id, "summary")}
                  onToggle={() => toggle(`${stage.id}:summary`)}
                  disabled={!hasTable}
                >
                  <SummaryStep ctx={ctx} />
                </StepCard>

                <StepCard
                  index={6}
                  title="排序与限制"
                  icon={<SortIcon sx={{ fontSize: 16 }} />}
                  summary={
                    !last
                      ? "仅最后一个阶段生成排序与限制"
                      : hasTable
                        ? sortSummary(ctx)
                        : stepDisabledSummary
                  }
                  expanded={isExpanded(stage.id, "sort")}
                  onToggle={() => toggle(`${stage.id}:sort`)}
                  disabled={!hasTable || !last}
                >
                  <SortLimitStep ctx={ctx} />
                </StepCard>
              </Box>
            </Paper>
          );
        })}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onAddStage}
            sx={{ flexShrink: 0 }}
            disabled={!ctxs[stages.length - 1]?.model.table}
          >
            添加阶段（CTE）
          </Button>
          <Typography variant="caption" color="text.secondary">
            每个阶段生成一个
            CTE（最后一个阶段为最终输出）。先在阶段的「汇总」里聚合，再到下游阶段
            关联，可避免 JOIN 放大聚合结果。
          </Typography>
        </Box>
      </Box>

      {/* 右侧：生成的 SQL */}
      <Box
        sx={{
          flex: { xs: "none", md: 1 },
          minWidth: 0,
          width: { xs: "100%", md: "auto" },
          alignSelf: "flex-start",
          position: "sticky",
          top: 0,
        }}
      >
        <SqlPreview
          sql={formattedSql}
          emptyHint="选择数据源后将自动生成 SQL。"
        />
      </Box>
    </Box>
  );
}
