import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import type { BuilderContext, TableOption } from "./builderContext";
import { defaultTableOptions } from "./builderContext";
import { describeRef } from "../describe";
import type { VisualRef } from "../types";

interface ColumnRefSelectProps {
  ctx: BuilderContext;
  value: VisualRef | null;
  onChange: (ref: VisualRef | null) => void;
  /** Restricts the selectable tables; defaults to base + joins. */
  tables?: TableOption[];
  includeExpressions?: boolean;
  label?: string;
  disabled?: boolean;
  size?: "small" | "medium";
}

function serialize(ref: VisualRef | null): string {
  return ref ? JSON.stringify(ref) : "";
}

function deserialize(value: string): VisualRef | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as VisualRef;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export default function ColumnRefSelect({
  ctx,
  value,
  onChange,
  tables,
  includeExpressions = true,
  label,
  disabled = false,
  size = "small",
}: ColumnRefSelectProps) {
  const tableOptions = tables ?? defaultTableOptions(ctx);
  const expressions = includeExpressions ? ctx.model.expressions : [];

  const renderValue = () => {
    if (!value) {
      return (
        <Box component="span" sx={{ color: "text.disabled" }}>
          选择字段
        </Box>
      );
    }
    return describeRef(ctx.model, value);
  };

  return (
    <FormControl size={size} fullWidth disabled={disabled}>
      {label && <InputLabel>{label}</InputLabel>}
      <Select
        label={label}
        value={serialize(value)}
        displayEmpty
        renderValue={renderValue}
        onChange={(e) => onChange(deserialize(e.target.value))}
      >
        {tableOptions.map((option) => {
          const isStageSource = (option.schema ?? ctx.model.schema) === "";
          const columns = ctx.columnsForTable(option.table, option.schema);
          const meta = ctx.metaForTable(option.table, option.schema);
          return [
            <ListSubheader key={`group-${option.joinId ?? "base"}`}>
              {option.label}
            </ListSubheader>,
            ...(columns.length === 0
              ? [
                  <MenuItem
                    key={`loading-${option.joinId ?? "base"}`}
                    disabled
                    value=""
                    sx={{ fontSize: "0.8125rem" }}
                  >
                    {meta || isStageSource ? (
                      isStageSource ? (
                        "（上游阶段无输出列，请先在上一阶段选择字段或汇总）"
                      ) : (
                        "（无可用列）"
                      )
                    ) : (
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <CircularProgress size={12} /> 加载中…
                      </Box>
                    )}
                  </MenuItem>,
                ]
              : columns.map((column) => (
                  <MenuItem
                    key={`col-${option.joinId ?? "base"}-${column.name}`}
                    value={serialize({
                      kind: "column",
                      joinId: option.joinId,
                      column: column.name,
                    })}
                    sx={{ fontSize: "0.8125rem" }}
                  >
                    {column.name}
                    <Box
                      component="span"
                      sx={{ ml: 1, color: "text.disabled", fontSize: "0.7rem" }}
                    >
                      {column.category}
                    </Box>
                  </MenuItem>
                ))),
          ];
        })}
        {expressions.length > 0 && (
          <ListSubheader key="group-expressions">自定义表达式</ListSubheader>
        )}
        {expressions.map((expression) => (
          <MenuItem
            key={`expr-${expression.id}`}
            value={serialize({
              kind: "expression",
              expressionId: expression.id,
            })}
            sx={{ fontSize: "0.8125rem" }}
          >
            ƒ {expression.name || "未命名表达式"}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
