import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { BuilderContext } from "./builderContext";
import { describeGroupBy, describeSortRef, describeRef } from "../describe";
import { defaultMetricLabel } from "../sqlBuilder";
import { addSort, removeSort, setLimit, updateSort } from "../modelEdits";
import type { VisualSortRef } from "../types";

interface SortLimitStepProps {
  ctx: BuilderContext;
}

const LIMIT_PRESETS = [100, 500, 1000, 5000, 10000];

export default function SortLimitStep({ ctx }: SortLimitStepProps) {
  const { model } = ctx;
  const aggregated = model.groupBy.length > 0 || model.metrics.length > 0;

  const options: { ref: VisualSortRef; label: string }[] = aggregated
    ? [
        ...model.groupBy.map((g) => ({
          ref: g.ref,
          label: describeGroupBy(model, g.ref, g.dateUnit),
        })),
        ...model.metrics.map((m) => ({
          ref: { kind: "metric" as const, metricId: m.id },
          label: m.label.trim() || defaultMetricLabel(m),
        })),
      ]
    : model.columns.map((c) => ({
        ref: c.source,
        label: describeRef(model, c.source),
      }));

  const serialize = (ref: VisualSortRef) => JSON.stringify(ref);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          排序
        </Typography>
        {model.sorts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            未设置排序。
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {model.sorts.map((sort, index) => {
              const currentValue = serialize(sort.ref);
              const known = options.some(
                (o) => serialize(o.ref) === currentValue,
              );
              return (
                <Box
                  key={index}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <Select
                      value={currentValue}
                      onChange={(e) => {
                        let ref: VisualSortRef;
                        try {
                          ref = JSON.parse(e.target.value) as VisualSortRef;
                        } catch {
                          return;
                        }
                        ctx.onChange(updateSort(model, index, { ref }));
                      }}
                    >
                      {!known && (
                        <MenuItem value={currentValue}>
                          {describeSortRef(model, sort.ref)}
                        </MenuItem>
                      )}
                      {options.map((option) => (
                        <MenuItem
                          key={serialize(option.ref)}
                          value={serialize(option.ref)}
                        >
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ width: 110 }}>
                    <Select
                      value={sort.desc ? "desc" : "asc"}
                      onChange={(e) =>
                        ctx.onChange(
                          updateSort(model, index, {
                            desc: e.target.value === "desc",
                          }),
                        )
                      }
                    >
                      <MenuItem value="asc">升序 ↑</MenuItem>
                      <MenuItem value="desc">降序 ↓</MenuItem>
                    </Select>
                  </FormControl>
                  <IconButton
                    size="small"
                    onClick={() => ctx.onChange(removeSort(model, index))}
                    aria-label="删除排序"
                  >
                    <DeleteIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              );
            })}
          </Box>
        )}
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => ctx.onChange(addSort(model))}
          disabled={options.length === 0}
          sx={{ mt: 1 }}
        >
          添加排序
        </Button>
        {options.length === 0 && (
          <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
            {aggregated ? "先配置分组或指标" : "先选择输出列"}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="subtitle2">行数限制</Typography>
        <TextField
          size="small"
          type="number"
          value={model.limit}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value) && value > 0) {
              ctx.onChange(setLimit(model, Math.floor(value)));
            }
          }}
          slotProps={{ htmlInput: { min: 1, max: 100000, step: 100 } }}
          sx={{ width: 120, "& input": { fontSize: "0.8125rem" } }}
        />
        {LIMIT_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="small"
            variant={model.limit === preset ? "contained" : "outlined"}
            onClick={() => ctx.onChange(setLimit(model, preset))}
            sx={{ minWidth: 0, px: 1, fontSize: "0.75rem" }}
          >
            {preset}
          </Button>
        ))}
      </Box>
    </Box>
  );
}
