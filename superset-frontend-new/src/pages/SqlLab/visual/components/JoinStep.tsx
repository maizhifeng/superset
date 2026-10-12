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

export default function JoinStep({ ctx }: JoinStepProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schema, setSchema] = useState(ctx.model.schema || ctx.contextSchema);
  const [table, setTable] = useState("");
  const [candidateTables, setCandidateTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [joinType, setJoinType] = useState<VisualJoinType>("left");
  const [keys, setKeys] = useState<VisualJoinKey[]>([emptyKey()]);

  const schemaOptions = useMemo(() => {
    const set = new Set(ctx.schemas.filter(Boolean));
    if (ctx.contextSchema) set.add(ctx.contextSchema);
    if (ctx.model.schema) set.add(ctx.model.schema);
    for (const join of ctx.model.joins) {
      const schema = join.schema ?? ctx.contextSchema;
      if (schema) set.add(schema);
    }
    return Array.from(set);
  }, [ctx.schemas, ctx.contextSchema, ctx.model.schema, ctx.model.joins]);

  const leftOptions = defaultTableOptions(ctx);
  const candidateMeta = table ? ctx.metaForTable(table, schema) : undefined;
  const suggestion = useMemo(
    () =>
      table ? suggestKeys(ctx, schema, table, candidateMeta, leftOptions) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, schema, candidateMeta, ctx.model, ctx.metaForTable],
  );

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
    const joinSchema = join.schema ?? ctx.contextSchema;
    setEditingId(joinId);
    setSchema(joinSchema);
    setTable(join.table);
    setJoinType(join.type);
    setKeys(
      join.keys.length > 0
        ? join.keys.map((k) => ({
            left: k.left,
            right: { kind: "column", column: k.right.column },
          }))
        : [emptyKey()],
    );
    loadTables(joinSchema);
    setOpen(true);
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
    if (!table || validKeys.length === 0) return;
    if (editingId) {
      ctx.onChange(
        updateJoin(ctx.model, editingId, {
          type: joinType,
          table,
          schema,
          keys: validKeys,
        }),
      );
    } else {
      const id = newId("join");
      ctx.onChange(
        addJoin(ctx.model, {
          id,
          type: joinType,
          table,
          schema,
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {ctx.model.joins.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          未添加关联表。可关联同一数据库下的任意模式（跨模式关联）。
        </Typography>
      ) : (
        ctx.model.joins.map((join) => (
          <Box
            key={join.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 1,
              borderRadius: 1.5,
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
                fontSize: "0.75rem",
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
            gap: 2,
            pt: "12px !important",
          }}
        >
          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControl
              size="small"
              sx={{ width: 200 }}
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
            <FormControl size="small" sx={{ width: 200 }}>
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

          {table && suggestion.length > 0 && (
            <Alert
              severity="info"
              sx={{ borderRadius: 1.5 }}
              action={
                <Button size="small" onClick={() => setKeys(suggestion)}>
                  使用外键建议
                </Button>
              }
            >
              检测到外键关系，可一键填充关联键。
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              关联键
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
                        table
                          ? [{ table, schema, label: `${table}（关联）` }]
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
              sx={{ mt: 1 }}
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
              !table || keys.every((k) => !k.left.column || !k.right.column)
            }
          >
            {editingId ? "保存" : "添加"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
