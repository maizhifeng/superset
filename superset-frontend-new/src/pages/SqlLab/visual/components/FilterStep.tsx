import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { BuilderContext } from "./builderContext";
import ColumnRefSelect from "./ColumnRefSelect";
import FilterValueInput from "./FilterValueInput";
import { operatorsForCategory } from "../operators";
import { addFilter, removeFilter, updateFilter } from "../modelEdits";
import type { VisualFilterCondition } from "../types";

interface FilterStepProps {
  ctx: BuilderContext;
}

export default function FilterStep({ ctx }: FilterStepProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {ctx.model.filters.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          未设置筛选条件。筛选在聚合前生效（WHERE）。
        </Typography>
      ) : (
        ctx.model.filters.map((filter: VisualFilterCondition, index) => {
          const category = ctx.refCategory(filter.ref);
          const ops = operatorsForCategory(category);
          return (
            <Box
              key={filter.id}
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <FormControl size="small" sx={{ width: 86, flexShrink: 0 }}>
                <Select
                  value={index === 0 ? "and" : filter.connector}
                  disabled={index === 0}
                  onChange={(e) =>
                    ctx.onChange(
                      updateFilter(ctx.model, filter.id, {
                        connector: e.target.value,
                      }),
                    )
                  }
                >
                  <MenuItem value="and">且</MenuItem>
                  <MenuItem value="or">或</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ flex: 1.2, minWidth: 0 }}>
                <ColumnRefSelect
                  ctx={ctx}
                  value={
                    filter.ref.kind === "column" && !filter.ref.column
                      ? null
                      : filter.ref
                  }
                  onChange={(ref) => {
                    const nextCategory = ref ? ctx.refCategory(ref) : "other";
                    const ops2 = operatorsForCategory(nextCategory);
                    ctx.onChange(
                      updateFilter(ctx.model, filter.id, {
                        ref: ref ?? { kind: "column", column: "" },
                        op: ops2[0]?.value ?? filter.op,
                        values: [""],
                      }),
                    );
                  }}
                />
              </Box>
              <FormControl size="small" sx={{ width: 130, flexShrink: 0 }}>
                <Select
                  value={filter.op}
                  onChange={(e) =>
                    ctx.onChange(
                      updateFilter(ctx.model, filter.id, {
                        op: e.target.value,
                        values: [""],
                      }),
                    )
                  }
                >
                  {ops.map((op) => (
                    <MenuItem key={op.value} value={op.value}>
                      {op.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ flex: 1.4, minWidth: 0 }}>
                <FilterValueInput
                  op={filter.op}
                  category={category}
                  values={filter.values}
                  onChange={(values) =>
                    ctx.onChange(updateFilter(ctx.model, filter.id, { values }))
                  }
                />
              </Box>
              <IconButton
                size="small"
                onClick={() => ctx.onChange(removeFilter(ctx.model, filter.id))}
                aria-label="删除筛选"
              >
                <DeleteIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          );
        })
      )}
      <Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => ctx.onChange(addFilter(ctx.model))}
        >
          添加筛选
        </Button>
      </Box>
    </Box>
  );
}
