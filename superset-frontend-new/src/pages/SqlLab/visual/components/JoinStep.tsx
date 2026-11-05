import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Autocomplete from "@mui/material/Autocomplete";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LinkIcon from "@mui/icons-material/Link";
import Alert from "@mui/material/Alert";
import type { TableMetadata } from "@/types/api";
import type { BuilderContext, TableOption } from "./builderContext";
import { defaultTableOptions } from "./builderContext";
import ColumnRefSelect from "./ColumnRefSelect";
import { describeJoin } from "../describe";
import { JOIN_TYPE_LABELS } from "../dialects";
import { addJoin, newId, updateJoin, removeJoin } from "../modelEdits";
import type { VisualJoinKey, VisualJoinType, VisualRef } from "../types";

interface JoinStepProps {
  ctx: BuilderContext;
}

/** 关联目标类型：同库物理表，或更早的上游阶段（CTE）。 */
type JoinTargetKind = "table" | "stage";

function emptyKey(): VisualJoinKey {
  return {
    left: { kind: "column", column: "" },
    right: { kind: "column", column: "" },
  };
}

function suggestKeys(
  ctx: BuilderContext,
  candidateSchema: string,
  candidateTable: string,
  candidateMeta: TableMetadata | undefined,
  leftOptions: TableOption[],
): VisualJoinKey[] {
  for (const option of leftOptions) {
    const optionSchema = option.schema ?? ctx.contextSchema;
    const leftMeta = ctx.metaForTable(option.table, optionSchema);
    // option.table → candidate
    for (const fk of leftMeta?.foreignKeys ?? []) {
      if (
        fk.referred_table === candidateTable &&
        (fk.referred_schema ?? optionSchema) === candidateSchema &&
        fk.column_names.length === fk.referred_columns.length
      ) {
        return fk.column_names.map((column, i) => ({
          left: { kind: "column", joinId: option.joinId, column },
          right: { kind: "column", column: fk.referred_columns[i] },
        }));
      }
    }
    // candidate → option.table
    for (const fk of candidateMeta?.foreignKeys ?? []) {
      if (
        fk.referred_table === option.table &&
        (fk.referred_schema ?? candidateSchema) === optionSchema &&
        fk.column_names.length === fk.referred_columns.length
      ) {
        return fk.column_names.map((column, i) => ({
          left: {
            kind: "column",
            joinId: option.joinId,
            column: fk.referred_columns[i],
          },
          right: { kind: "column", column },
        }));
      }
    }
  }
  return [];
}

/** 上游阶段没有外键元数据，按同名字段给出关联键建议。 */
function suggestStageKeys(
  ctx: BuilderContext,
  stageTable: string,
  leftOptions: TableOption[],
): VisualJoinKey[] {
  const targetNames = new Set(
    ctx.columnsForTable(stageTable, "").map((column) => column.name),
  );
  if (targetNames.size === 0) return [];
  for (const option of leftOptions) {
    const matches = ctx
      .columnsForTable(option.table, option.schema)
      .filter((column) => targetNames.has(column.name));
    if (matches.length > 0) {
      return matches.map((column) => ({
        left: { kind: "column", joinId: option.joinId, column: column.name },
        right: { kind: "column", column: column.name },
      }));
    }
  }
  return [];
}

export default function JoinStep({ ctx }: JoinStepProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<JoinTargetKind>("table");
  const [stageId, setStageId] = useState("");
  const [schema, setSchema] = useState(ctx.model.schema || ctx.contextSchema);
  const [table, setTable] = useState("");
  const [candidateTables, setCandidateTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [joinType, setJoinType] = useState<VisualJoinType>("left");
  const [keys, setKeys] = useState<VisualJoinKey[]>([emptyKey()]);

  const upstreamStages = ctx.upstreamStages;
  const stageTarget = upstreamStages.find((stage) => stage.id === stageId);
  const targetTable =
    targetKind === "stage" ? (stageTarget?.name ?? "") : table;
  const targetSchema = targetKind === "stage" ? "" : schema;
  const targetReady =
    targetKind === "stage" ? Boolean(stageId && stageTarget) : Boolean(table);

  const schemaOptions = useMemo(() => {
    const set = new Set(ctx.schemas.filter(Boolean));
    if (ctx.contextSchema) set.add(ctx.contextSchema);
    if (ctx.model.schema) set.add(ctx.model.schema);
    for (const join of ctx.model.joins) {
      if (join.stageId) continue;
      const schema = join.schema ?? ctx.contextSchema;
      if (schema) set.add(schema);
    }
    return Array.from(set);
  }, [ctx.schemas, ctx.contextSchema, ctx.model.schema, ctx.model.joins]);

  const leftOptions = defaultTableOptions(ctx);
  const candidateMeta =
    targetKind === "table" && table
      ? ctx.metaForTable(table, schema)
      : undefined;
  const fkSuggestion = useMemo(
    () =>
      table ? suggestKeys(ctx, schema, table, candidateMeta, leftOptions) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, schema, candidateMeta, ctx.model, ctx.metaForTable],
  );
  const stageSuggestion = useMemo(
    () =>
      targetKind === "stage" && targetTable
        ? suggestStageKeys(ctx, targetTable, leftOptions)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetKind, targetTable, ctx.model, ctx.columnsForTable],
  );
  const suggestion = targetKind === "stage" ? stageSuggestion : fkSuggestion;

  const loadTables = (sch: string) => {
    if (sch === ctx.contextSchema) {
      setCandidateTables(ctx.tableList.map((t) => t.value));
      return;
    }
    setLoadingTables(true);
    void ctx.fetchTableListForSchema(sch).then((list) => {
      setCandidateTables(list);
      setLoadingTables(false);
    });
  };

  const openAdd = () => {
    setEditingId(null);
    setTargetKind("table");
    setStageId("");
    setSchema(ctx.contextSchema);
    setTable("");
    setCandidateTables(ctx.tableList.map((t) => t.value));
    setJoinType("left");
    setKeys([emptyKey()]);
    setOpen(true);
  };

  const openEdit = (joinId: string) => {
    const join = ctx.model.joins.find((j) => j.id === joinId);
    if (!join) return;
    setEditingId(joinId);
    setTargetKind(join.stageId ? "stage" : "table");
    setStageId(join.stageId ?? "");
    const joinSchema = join.schema || ctx.contextSchema;
    setSchema(joinSchema);
    setTable(join.stageId ? "" : join.table);
    setJoinType(join.type);
    setKeys(
      join.keys.length > 0
        ? join.keys.map((k) => ({
            left: k.left,
            right: {
              kind: "column",
              column: (k.right as { column: string }).column,
            },
          }))
        : [emptyKey()],
    );
    if (!join.stageId) loadTables(joinSchema);
    setOpen(true);
  };

  const handleTargetKindChange = (next: JoinTargetKind) => {
    if (next === targetKind) return;
    setTargetKind(next);
    setTable("");
    setStageId("");
    setKeys([emptyKey()]);
    if (next === "table") loadTables(schema);
  };

  const handleStageChange = (nextStageId: string) => {
    setStageId(nextStageId);
    const name =
      upstreamStages.find((stage) => stage.id === nextStageId)?.name ?? "";
    const suggested = name
      ? suggestStageKeys(ctx, name, defaultTableOptions(ctx))
      : [];
    setKeys(suggested.length > 0 ? suggested : [emptyKey()]);
  };

  const handleSchemaChange = (value: string) => {
    setSchema(value);
    setTable("");
    setKeys([emptyKey()]);
    loadTables(value);
  };

  const handleTableChange = (value: string) => {
    setTable(value);
    setKeys([emptyKey()]);
    if (value) {
      void ctx.fetchTableMeta(schema, value).then((meta) => {
        const suggested = suggestKeys(
          ctx,
          schema,
          value,
          meta ?? undefined,
          leftOptions,
        );
        if (suggested.length > 0) setKeys(suggested);
      });
    }
  };

  const confirm = () => {
    const validKeys = keys
      .filter((k) => k.left.column && k.right.column)
      .map((k) => ({
        left: { ...k.left, joinId: k.left.joinId },
        right: {
          kind: "column" as const,
          joinId: editingId ?? "pending",
          column: k.right.column,
        },
      }));
    if (!targetReady || validKeys.length === 0) return;
    const target =
      targetKind === "stage"
        ? { table: "", schema: "", stageId }
        : { table, schema, stageId: undefined };
    if (editingId) {
      ctx.onChange(
        updateJoin(ctx.model, editingId, {
          type: joinType,
          ...target,
          keys: validKeys,
        }),
      );
    } else {
      const id = newId("join");
      ctx.onChange(
        addJoin(ctx.model, {
          id,
          type: joinType,
          ...target,
          keys: validKeys.map((k) => ({
            ...k,
            right: { ...k.right, joinId: id },
          })),
        }),
      );
    }
    setOpen(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {ctx.model.joins.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          未添加关联表。可关联同一数据库下的任意模式（跨模式关联），也可关联更早的
          上游阶段（CTE），一次合并多个独立阶段。
        </Typography>
      ) : (
        ctx.model.joins.map((join) => (
          <Box
            key={join.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <LinkIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "monospace",
                fontSize: "0.6875rem",
              }}
            >
              {describeJoin(ctx.model, join)}
            </Typography>
            <IconButton
              size="small"
              onClick={() => openEdit(join.id)}
              aria-label="编辑关联"
            >
              <EditIcon sx={{ fontSize: 15 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => ctx.onChange(removeJoin(ctx.model, join.id))}
              aria-label="删除关联"
            >
              <DeleteIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        ))
      )}
      <Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={openAdd}
          disabled={!ctx.model.table}
        >
          添加关联表
        </Button>
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingId ? "编辑关联" : "添加关联表"}</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.25,
            pt: "8px !important",
          }}
        >
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <FormControl
              size="small"
              sx={{ width: 150 }}
              disabled={Boolean(editingId)}
            >
              <InputLabel>关联目标</InputLabel>
              <Select
                label="关联目标"
                value={targetKind}
                onChange={(e) => handleTargetKindChange(e.target.value)}
              >
                <MenuItem value="table">物理表</MenuItem>
                <MenuItem value="stage" disabled={upstreamStages.length === 0}>
                  上游阶段（CTE）
                </MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ width: 160 }}>
              <InputLabel>连接类型</InputLabel>
              <Select
                label="连接类型"
                value={joinType}
                onChange={(e) => setJoinType(e.target.value)}
              >
                {Object.entries(JOIN_TYPE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {targetKind === "table" ? (
            <Box sx={{ display: "flex", gap: 1 }}>
              <FormControl
                size="small"
                sx={{ width: 160 }}
                disabled={Boolean(editingId)}
              >
                <InputLabel>模式</InputLabel>
                <Select
                  label="模式"
                  value={schema}
                  onChange={(e) => handleSchemaChange(e.target.value)}
                >
                  {schemaOptions.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Autocomplete
                size="small"
                sx={{ flex: 1 }}
                options={candidateTables}
                value={table || null}
                onChange={(_, value) => value && handleTableChange(value)}
                disabled={Boolean(editingId) || loadingTables}
                loading={loadingTables}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    label="关联表（同一数据库，可跨模式）"
                  />
                )}
                noOptionsText={loadingTables ? "加载中…" : "没有匹配的表"}
              />
            </Box>
          ) : (
            <FormControl size="small" fullWidth disabled={Boolean(editingId)}>
              <InputLabel>上游阶段</InputLabel>
              <Select
                label="上游阶段"
                value={stageId}
                onChange={(e) => handleStageChange(e.target.value)}
              >
                {upstreamStages.map((stage) => (
                  <MenuItem key={stage.id} value={stage.id}>
                    阶段 {stage.index} · {stage.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {targetTable && suggestion.length > 0 && (
            <Alert
              severity="info"
              sx={{ borderRadius: 1 }}
              action={
                <Button size="small" onClick={() => setKeys(suggestion)}>
                  一键填充
                </Button>
              }
            >
              {targetKind === "stage"
                ? "检测到同名字段，可一键填充关联键。"
                : "检测到外键关系，可一键填充关联键。"}
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              关联键
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {keys.map((key, index) => (
                <Box
                  key={index}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Box sx={{ flex: 1 }}>
                    <ColumnRefSelect
                      ctx={ctx}
                      value={key.left.column ? key.left : null}
                      onChange={(ref: VisualRef | null) => {
                        const next = [...keys];
                        next[index] = {
                          ...next[index],
                          left: (ref ?? {
                            kind: "column",
                            column: "",
                          }) as VisualJoinKey["left"],
                        };
                        setKeys(next);
                      }}
                      tables={leftOptions}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    =
                  </Typography>
                  <Box sx={{ flex: 1 }}>
                    <ColumnRefSelect
                      ctx={ctx}
                      value={key.right.column ? key.right : null}
                      onChange={(ref: VisualRef | null) => {
                        const next = [...keys];
                        next[index] = {
                          ...next[index],
                          right: (ref ?? {
                            kind: "column",
                            column: "",
                          }) as VisualJoinKey["right"],
                        };
                        setKeys(next);
                      }}
                      tables={
                        targetTable
                          ? [
                              {
                                table: targetTable,
                                schema: targetSchema,
                                label:
                                  targetKind === "stage"
                                    ? `上游阶段 ${targetTable}（关联）`
                                    : `${targetTable}（关联）`,
                              },
                            ]
                          : []
                      }
                      includeExpressions={false}
                    />
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => setKeys(keys.filter((_, i) => i !== index))}
                    disabled={keys.length <= 1}
                    aria-label="删除关联键"
                  >
                    <DeleteIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setKeys([...keys, emptyKey()])}
              sx={{ mt: 0.5 }}
            >
              添加键对
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={confirm}
            disabled={
              !targetReady ||
              keys.every((k) => !k.left.column || !k.right.column)
            }
          >
            {editingId ? "保存" : "添加"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
