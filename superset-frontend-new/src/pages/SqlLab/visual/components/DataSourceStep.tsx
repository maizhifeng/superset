import { useMemo, useState } from "react";
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
import { setBaseTable } from "../modelEdits";

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
  const options = useMemo(
    () => ctx.tableList.map((t) => t.value),
    [ctx.tableList],
  );

  const applyTable = (value: string) => {
    ctx.onChange(setBaseTable({ ...ctx.model, schema }, value));
    setPendingTable(null);
  };

  // 下游阶段：数据来源为上游阶段的输出（CTE），在此选择上游阶段。
  if (ctx.sourceStageId) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <FormControl size="small" fullWidth>
          <InputLabel id="viz-upstream-label">数据来源（上游阶段）</InputLabel>
          <Select
            labelId="viz-upstream-label"
            label="数据来源（上游阶段）"
            value={ctx.sourceStageId}
            onChange={(e) => {
              if (e.target.value) ctx.onSelectUpstream(e.target.value);
            }}
          >
            {ctx.upstreamStages.map((stage) => (
              <MenuItem key={stage.id} value={stage.id}>
                阶段 {stage.index} · {stage.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary">
          本阶段基于上游阶段的输出（CTE）继续处理：先聚合再加关联、或在聚合结果上继续筛选。
          需要补充物理表字段时，可在「关联表」中关联。
        </Typography>
        {ctx.isLoadingMeta && ctx.model.table && (
          <Typography variant="caption" color="text.secondary">
            正在加载表结构…
          </Typography>
        )}
        {ctx.metaError && (
          <Alert
            severity="error"
            sx={{ borderRadius: 1.5 }}
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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
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
          sx={{ flex: 1, minWidth: 180 }}
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
      </Box>
      {(databases.length === 0 ||
        schemasLoading ||
        (databaseId !== "" && !schemasLoading && schemas.length === 0)) && (
        <Typography variant="caption" color="text.secondary">
          {databases.length === 0
            ? "暂无可用数据库"
            : schemasLoading
              ? "正在加载模式…"
              : "该数据库暂无可用模式"}
        </Typography>
      )}

      <Autocomplete
        size="small"
        options={options}
        value={ctx.model.table || undefined}
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
      {!schema && (
        <Typography variant="caption" color="text.secondary">
          请先选择数据库与模式，再选择数据表。
        </Typography>
      )}
      {pendingTable && (
        <Alert
          severity="warning"
          sx={{ borderRadius: 1.5 }}
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
      {ctx.isLoadingMeta && ctx.model.table && (
        <Typography variant="caption" color="text.secondary">
          正在加载表结构…
        </Typography>
      )}
      {ctx.metaError && (
        <Alert
          severity="error"
          sx={{ borderRadius: 1.5 }}
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
