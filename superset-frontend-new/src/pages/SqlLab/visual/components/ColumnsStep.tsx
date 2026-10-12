import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import FunctionsIcon from "@mui/icons-material/Functions";
import type { BuilderContext } from "./builderContext";
import { describeRef } from "../describe";
import { isAggregated, sameRef, type VisualRef } from "../types";
import {
  addExpression,
  addOutputColumn,
  moveOutputColumn,
  newId,
  removeExpression,
  removeOutputColumn,
  updateExpression,
  updateOutputColumn,
} from "../modelEdits";

interface ColumnsStepProps {
  ctx: BuilderContext;
}

export default function ColumnsStep({ ctx }: ColumnsStepProps) {
  const [search, setSearch] = useState("");
  const aggregated = isAggregated(ctx.model);

  const groups = useMemo(() => {
    const tables = [
      {
        key: "base",
        label: `${ctx.model.table}（主表）`,
        table: ctx.model.table,
        schema: ctx.model.schema,
      },
      ...ctx.model.joins.map((j) => {
        const schema = j.schema ?? ctx.model.schema;
        const scope =
          schema && schema !== ctx.model.schema
            ? `${schema}.${j.table}`
            : j.table;
        return {
          key: j.id,
          label: `${scope}（关联）`,
          table: j.table,
          schema,
        };
      }),
    ];
    const q = search.trim().toLowerCase();
    return tables
      .map((t) => ({
        ...t,
        columns: ctx
          .columnsForTable(t.table, t.schema)
          .filter((c) => !q || c.name.toLowerCase().includes(q)),
      }))
      .filter((t) => t.columns.length > 0 || !q);
  }, [ctx, search]);

  if (aggregated) {
    return (
      <Alert severity="info" sx={{ borderRadius: 1.5 }}>
        已启用「汇总」，输出列由下方的分组维度与指标决定；清空汇总后此步骤重新生效。
      </Alert>
    );
  }

  const selected = (ref: VisualRef, joinId?: string) =>
    ctx.model.columns.some((c) =>
      sameRef(c.source, {
        kind: "column",
        joinId,
        column: ref.kind === "column" ? ref.column : "",
      }),
    );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <TextField
        size="small"
        placeholder="搜索列..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </InputAdornment>
            ),
          },
        }}
      />
      <Box
        sx={{
          maxHeight: 240,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          pr: 0.5,
        }}
      >
        {groups.map((group) => (
          <Box key={group.key}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700 }}
            >
              {group.label}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {group.columns.map((column) => {
                const ref: VisualRef = {
                  kind: "column",
                  joinId: group.key === "base" ? undefined : group.key,
                  column: column.name,
                };
                const checked = selected(ref, ref.joinId);
                return (
                  <FormControlLabel
                    key={column.name}
                    sx={{
                      m: 0,
                      "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" },
                    }}
                    control={
                      <Checkbox
                        size="small"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            const index = ctx.model.columns.findIndex((c) =>
                              sameRef(c.source, ref),
                            );
                            if (index >= 0) {
                              ctx.onChange(
                                removeOutputColumn(ctx.model, index),
                              );
                            }
                          } else {
                            ctx.onChange(addOutputColumn(ctx.model, ref));
                          }
                        }}
                      />
                    }
                    label={column.name}
                  />
                );
              })}
            </Box>
          </Box>
        ))}
        {ctx.model.expressions.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700 }}
            >
              自定义表达式
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {ctx.model.expressions.map((expression) => {
                const ref: VisualRef = {
                  kind: "expression",
                  expressionId: expression.id,
                };
                const checked = ctx.model.columns.some((c) =>
                  sameRef(c.source, ref),
                );
                return (
                  <FormControlLabel
                    key={expression.id}
                    sx={{
                      m: 0,
                      "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" },
                    }}
                    control={
                      <Checkbox
                        size="small"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            const index = ctx.model.columns.findIndex((c) =>
                              sameRef(c.source, ref),
                            );
                            if (index >= 0) {
                              ctx.onChange(
                                removeOutputColumn(ctx.model, index),
                              );
                            }
                          } else {
                            ctx.onChange(addOutputColumn(ctx.model, ref));
                          }
                        }}
                      />
                    }
                    label={`ƒ ${expression.name || "未命名表达式"}`}
                  />
                );
              })}
            </Box>
          </Box>
        )}
      </Box>

      {ctx.model.columns.length > 0 && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700 }}
          >
            输出顺序与别名
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.75,
              mt: 0.5,
            }}
          >
            {ctx.model.columns.map((column, index) => (
              <Box
                key={`${index}-${describeRef(ctx.model, column.source)}`}
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    width: 190,
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                  }}
                >
                  {describeRef(ctx.model, column.source)}
                </Typography>
                <TextField
                  size="small"
                  placeholder="别名（可选）"
                  value={column.alias ?? ""}
                  onChange={(e) =>
                    ctx.onChange(
                      updateOutputColumn(ctx.model, index, {
                        alias: e.target.value,
                      }),
                    )
                  }
                  sx={{ flex: 1, "& input": { fontSize: "0.8125rem" } }}
                />
                <IconButton
                  size="small"
                  disabled={index === 0}
                  onClick={() =>
                    ctx.onChange(moveOutputColumn(ctx.model, index, -1))
                  }
                  aria-label="上移"
                >
                  <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton
                  size="small"
                  disabled={index === ctx.model.columns.length - 1}
                  onClick={() =>
                    ctx.onChange(moveOutputColumn(ctx.model, index, 1))
                  }
                  aria-label="下移"
                >
                  <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <Tooltip title="移除">
                  <IconButton
                    size="small"
                    onClick={() =>
                      ctx.onChange(removeOutputColumn(ctx.model, index))
                    }
                    aria-label="移除列"
                  >
                    <DeleteIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 700 }}
        >
          自定义表达式
        </Typography>
        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 0.5 }}
        >
          {ctx.model.expressions.map((expression) => (
            <Box
              key={expression.id}
              sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
            >
              <FunctionsIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <TextField
                size="small"
                label="名称"
                value={expression.name}
                onChange={(e) =>
                  ctx.onChange(
                    updateExpression(ctx.model, expression.id, {
                      name: e.target.value,
                    }),
                  )
                }
                sx={{ width: 160, "& input": { fontSize: "0.8125rem" } }}
              />
              <TextField
                size="small"
                label="SQL 表达式"
                placeholder="如 price * qty"
                value={expression.sql}
                onChange={(e) =>
                  ctx.onChange(
                    updateExpression(ctx.model, expression.id, {
                      sql: e.target.value,
                    }),
                  )
                }
                sx={{ flex: 1, "& input": { fontSize: "0.8125rem" } }}
              />
              <IconButton
                size="small"
                onClick={() =>
                  ctx.onChange(removeExpression(ctx.model, expression.id))
                }
                aria-label="删除表达式"
              >
                <DeleteIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          ))}
          <Box>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                ctx.onChange(
                  addExpression(ctx.model, {
                    id: newId("expr"),
                    name: "",
                    sql: "",
                  }),
                )
              }
            >
              添加表达式
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
