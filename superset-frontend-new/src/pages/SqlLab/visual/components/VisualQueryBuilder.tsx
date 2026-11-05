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
import VisualBuilderTheme from "./VisualBuilderTheme";
import DataSourceStep from "./DataSourceStep";
import JoinStep from "./JoinStep";
import ColumnsStep from "./ColumnsStep";
import FilterStep from "./FilterStep";
import SummaryStep from "./SummaryStep";
import SortLimitStep from "./SortLimitStep";
import SqlPreview from "./SqlPreview";
import {
  finalStageIndex,
  isAggregated,
  reachableStageIds,
  stageReferencedBy,
  type VisualQueryModel,
  type VisualStage,
} from "../types";
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
  /** Superset engine name of the current database, shown on the SQL panel. */
  backend?: string;
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
        width: 118,
        "& input": {
          fontSize: "0.75rem",
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
  backend,
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

  // 阶段列表的只读模型：用于判断最终输出阶段、参与 SQL 的阶段与引用关系。
  const model = useMemo<VisualQueryModel>(
    () => ({
      v: 1,
      databaseId: Number(databaseId) || 0,
      schema,
      stages,
    }),
    [databaseId, schema, stages],
  );
  const finalIndex = finalStageIndex(model);
  const reachable = useMemo(() => reachableStageIds(model), [model]);

  return (
    <VisualBuilderTheme>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { xs: "flex-start", md: "stretch" },
          gap: 0.75,
          width: "100%",
          // md+ 时撑满父容器（分割线拖拽后的固定高度 / 自适应高度），
          // 让左右两列各自滚动而不是整块页面滚动。
          flexGrow: { md: 1 },
          minHeight: 0,
          overflow: { xs: "visible", md: "hidden" },
        }}
      >
        {/* 左侧：阶段（CTE）容器堆叠 */}
        <Box
          data-testid="viz-stage-column"
          sx={{
            flex: { xs: "none", md: 1 },
            minWidth: 0,
            minHeight: 0,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
            overflow: { xs: "visible", md: "auto" },
            pr: { xs: 0, md: 0.5 },
            // 阶段卡片保持自然高度、由左列滚动，避免纵向 flex 容器把卡片压扁。
            overscrollBehavior: "contain",
          }}
        >
          {stages.map((stage, index) => {
            const ctx = ctxs[index];
            if (!ctx) return null;
            const hasTable = Boolean(ctx.model.table);
            const isFinal = index === finalIndex;
            const inOutput = reachable.has(stage.id);
            const referencingStages = stageReferencedBy(model, stage.id);
            const stageReferenced = referencingStages.length > 0;
            return (
              <Paper
                key={stage.id}
                variant="outlined"
                data-testid="viz-stage-card"
                sx={{
                  borderRadius: 1.5,
                  overflow: "hidden",
                  // 纵向 flex 布局默认会压缩子项：阶段一多，各阶段卡片会被
                  // 压扁裁切且不产生滚动条，较早阶段的步骤因此不可见。
                  // 卡片不参与压缩，内容超高时交给左列滚动。
                  flexShrink: 0,
                  // 外层阶段容器：非首个阶段用主题色边框体现 CTE 层级。
                  borderColor: inOutput
                    ? index === 0
                      ? "divider"
                      : "primary.light"
                    : "divider",
                  bgcolor:
                    index === 0 ? "background.paper" : "background.default",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1,
                    py: 0.25,
                    minHeight: 30,
                    bgcolor: index === 0 ? "transparent" : "action.hover",
                  }}
                >
                  <Tooltip
                    title={
                      isFinal
                        ? "最终输出阶段：生成外层 SELECT，排序与限制在此生效"
                        : inOutput
                          ? "被最终输出阶段引用，生成 WITH 中的 CTE"
                          : "未被最终输出阶段引用（独立分支草稿），不参与生成的 SQL；可在后续阶段的数据来源或关联表中引用它"
                    }
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.625rem",
                        px: 0.5,
                        py: 0,
                        lineHeight: 1.8,
                        borderRadius: 0.75,
                        bgcolor: isFinal
                          ? "primary.main"
                          : inOutput
                            ? "action.selected"
                            : "action.hover",
                        color: isFinal
                          ? "primary.contrastText"
                          : inOutput
                            ? "text.secondary"
                            : "text.disabled",
                        flexShrink: 0,
                      }}
                    >
                      {isFinal
                        ? `阶段 ${index + 1} · 最终输出`
                        : inOutput
                          ? `阶段 ${index + 1} · CTE`
                          : `阶段 ${index + 1} · 未参与输出`}
                    </Typography>
                  </Tooltip>
                  <StageNameInput
                    value={stage.name}
                    onCommit={(name) => onRenameStage(stage.id, name)}
                  />
                  <Box sx={{ flex: 1 }} />
                  {stages.length > 1 && (
                    <Tooltip
                      title={
                        stageReferenced
                          ? `该阶段被后续阶段引用（${referencingStages
                              .map((s) => s.name)
                              .join("、")}），不能删除`
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
                          <DeleteIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Box>
                <Box
                  sx={{
                    p: 0.75,
                    pt: 0.5,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    alignItems: "start",
                    gap: 0.5,
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
                    summary={
                      hasTable ? filtersSummary(ctx) : stepDisabledSummary
                    }
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
                    summary={
                      hasTable ? summarySummary(ctx) : stepDisabledSummary
                    }
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
                      !isFinal
                        ? "仅最终输出阶段生成排序与限制"
                        : hasTable
                          ? sortSummary(ctx)
                          : stepDisabledSummary
                    }
                    expanded={isExpanded(stage.id, "sort")}
                    onToggle={() => toggle(`${stage.id}:sort`)}
                    disabled={!hasTable || !isFinal}
                  >
                    <SortLimitStep ctx={ctx} />
                  </StepCard>
                </Box>
              </Paper>
            );
          })}

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
              flexWrap: "wrap",
              pt: 0.25,
            }}
          >
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
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: 0 }}
            >
              每个阶段生成一个 CTE（最终输出为外层
              SELECT）；数据来源可选物理表或更早的
              上游阶段，下游阶段可通过「关联表」合并多个上游阶段。
            </Typography>
          </Box>
        </Box>

        {/* 右侧：生成的 SQL。md+ 撑满阶段列的高度，内部自行滚动。 */}
        <Box
          sx={{
            flex: { xs: "none", md: 1 },
            minWidth: 0,
            minHeight: 0,
            width: { xs: "100%", md: "auto" },
            display: "flex",
            flexDirection: "column",
            alignSelf: { xs: "auto", md: "stretch" },
            height: { xs: "auto", md: "100%" },
            position: "sticky",
            top: 0,
          }}
        >
          <SqlPreview
            sql={formattedSql}
            dialect={backend}
            emptyHint="选择数据源后将自动生成 SQL。"
          />
        </Box>
      </Box>
    </VisualBuilderTheme>
  );
}
