import { useEffect, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import type { Database } from "@/types/api";
import type { BuilderContext } from "./builderContext";

interface DataSourceStepProps {
  ctx: BuilderContext;
  databaseId: number | "";
  schema: string;
  databases: Database[];
  schemas: string[];
  schemasLoading: boolean;
  onDatabaseChange: (id: number) => void;
  onSchemaChange: (schema: string) => void;
}

/** 数据来源类型：物理表，或更早的上游阶段（CTE）。 */
type SourceKind = "table" | "stage";

export default function DataSourceStep({
  ctx,
  databaseId,
  schema,
  databases,
  schemas,
  schemasLoading,
  onDatabaseChange,
  onSchemaChange,
}: DataSourceStepProps) {
  const [pendingTable, setPendingTable] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<SourceKind | null>(null);
  const options = useMemo(
    () => ctx.tableList.map((t) => t.value),
    [ctx.tableList],
  );

  const sourceKind: SourceKind = ctx.sourceStageId ? "stage" : "table";
  const upstreamStages = ctx.upstreamStages;
  const defaultUpstream = upstreamStages[upstreamStages.length - 1];
  useEffect(() => setPendingSwitch(null), [sourceKind]);

  const applyTable = (value: string) => {
    // 物理表切换会重置本阶段既有的关联、字段、筛选与汇总。
    ctx.onSelectTableSource(schema, value);
    setPendingTable(null);
  };

  const confirmSwitch = () => {
    if (pendingSwitch === "stage" && defaultUpstream) {
      ctx.onSelectUpstream(defaultUpstream.id, true);
    } else if (pendingSwitch === "table") {
      ctx.onSelectTableSource(schema, "");
      setPendingTable(null);
    }
    setPendingSwitch(null);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {/* 数据库/模式/数据表（或来源类型/上游阶段）压缩在一行内自动换行。 */}
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        {upstreamStages.length > 0 && (
          <FormControl size="small" sx={{ width: 150, flexShrink: 0 }}>
            <InputLabel id="viz-source-kind-label">数据来源类型</InputLabel>
            <Select
              labelId="viz-source-kind-label"
              label="数据来源类型"
              value={sourceKind}
              onChange={(e) => {
                const next = e.target.value;
                if (next !== sourceKind) setPendingSwitch(next);
              }}
            >
              <MenuItem value="table">物理表</MenuItem>
              <MenuItem value="stage">上游阶段（CTE）</MenuItem>
            </Select>
          </FormControl>
        )}

        {sourceKind === "stage" ? (
          <FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
            <InputLabel id="viz-upstream-label">
              数据来源（上游阶段）
            </InputLabel>
            <Select
              labelId="viz-upstream-label"
              label="数据来源（上游阶段）"
              value={ctx.sourceStageId ?? ""}
              onChange={(e) => {
                if (e.target.value) ctx.onSelectUpstream(e.target.value);
              }}
            >
              {upstreamStages.map((stage) => (
                <MenuItem key={stage.id} value={stage.id}>
                  阶段 {stage.index} · {stage.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <>
            <FormControl size="small" sx={{ flex: 1, minWidth: 128 }}>
              <InputLabel id="viz-db-label">数据库</InputLabel>
              <Select
                labelId="viz-db-label"
                label="数据库"
                value={databaseId === "" ? "" : String(databaseId)}
                onChange={(e) => {
                  if (e.target.value !== "") {
                    onDatabaseChange(Number(e.target.value));
                  }
                }}
                disabled={databases.length === 0}
              >
                {databases.map((database) => (
                  <MenuItem key={database.id} value={String(database.id)}>
                    {database.database_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl
              size="small"
              sx={{ flex: 1, minWidth: 128 }}
              disabled={databaseId === "" || schemasLoading}
            >
              <InputLabel id="viz-schema-label">模式</InputLabel>
              <Select
                labelId="viz-schema-label"
                label="模式"
                value={schema}
                onChange={(e) => {
                  if (e.target.value) onSchemaChange(e.target.value);
                }}
              >
                {schemas.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              size="small"
              sx={{ flex: 2, minWidth: 200 }}
              options={options}
              value={ctx.model.table || ""}
              onChange={(_, value) => {
                if (!value || value === ctx.model.table) return;
                if (!ctx.model.table) {
                  applyTable(value);
                  return;
                }
                setPendingTable(value);
              }}
              disableClearable
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="数据表"
                  placeholder={schema ? "搜索并选择数据表" : undefined}
                  size="small"
                />
              )}
              noOptionsText={schema ? "没有匹配的表" : "请先选择数据库与模式"}
              disabled={!schema || ctx.tableList.length === 0}
            />
          </>
        )}
      </Box>

      {upstreamStages.length > 0 && sourceKind === "stage" && (
        <Typography variant="caption" color="text.secondary">
          基于上游阶段的输出（CTE）继续处理；可在「关联表」中把其他上游阶段作为关联目标，
          一次合并多个独立阶段。
        </Typography>
      )}

      {(databases.length === 0 ||
        schemasLoading ||
        (sourceKind === "table" &&
          databaseId !== "" &&
          !schemasLoading &&
          schemas.length === 0)) && (
        <Typography variant="caption" color="text.secondary">
          {databases.length === 0
            ? "暂无可用数据库"
            : schemasLoading
              ? "正在加载模式…"
              : "该数据库暂无可用模式"}
        </Typography>
      )}
      {sourceKind === "table" && !schema && (
        <Typography variant="caption" color="text.secondary">
          请先选择数据库与模式，再选择数据表。
        </Typography>
      )}

      {pendingSwitch && (
        <Alert
          severity="warning"
          sx={{ borderRadius: 1 }}
          action={
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button size="small" color="warning" onClick={confirmSwitch}>
                确认切换
              </Button>
              <Button
                size="small"
                color="inherit"
                onClick={() => setPendingSwitch(null)}
              >
                取消
              </Button>
            </Box>
          }
        >
          {pendingSwitch === "stage"
            ? `切换为上游阶段${
                defaultUpstream ? `（${defaultUpstream.name}）` : ""
              }会清空本阶段的关联、字段、筛选与汇总配置。`
            : "切换为物理表会清空本阶段的关联、字段、筛选与汇总配置。"}
        </Alert>
      )}

      {pendingTable && (
        <Alert
          severity="warning"
          sx={{ borderRadius: 1 }}
          action={
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button
                size="small"
                color="warning"
                onClick={() => applyTable(pendingTable)}
              >
                确认更换
              </Button>
              <Button
                size="small"
                color="inherit"
                onClick={() => setPendingTable(null)}
              >
                取消
              </Button>
            </Box>
          }
        >
          更换为 {pendingTable} 会清空当前的关联、字段、筛选与汇总配置。
        </Alert>
      )}

      {ctx.isLoadingMeta && ctx.model.table && sourceKind === "table" && (
        <Typography variant="caption" color="text.secondary">
          正在加载表结构…
        </Typography>
      )}
      {ctx.metaError && sourceKind === "table" && (
        <Alert
          severity="error"
          sx={{ borderRadius: 1 }}
          action={
            <Button size="small" color="error" onClick={ctx.retryMeta}>
              重试
            </Button>
          }
        >
          {ctx.metaError}
        </Alert>
      )}
    </Box>
  );
}
