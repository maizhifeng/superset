import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { BuilderContext } from "./builderContext";
import ColumnRefSelect from "./ColumnRefSelect";
import FilterValueInput from "./FilterValueInput";
import { describeFilter } from "../describe";
import { DATE_UNIT_LABELS } from "../dialects";
import { METRIC_OPS } from "../operators";
import { defaultMetricLabel } from "../sqlBuilder";
import {
  addGroupBy,
  addHaving,
  addMetric,
  removeGroupBy,
  removeHaving,
  removeMetric,
  updateGroupBy,
  updateHaving,
  updateMetric,
} from "../modelEdits";
import type { VisualMetricKind } from "../types";

interface SummaryStepProps {
  ctx: BuilderContext;
}

const METRIC_KIND_LABELS: { value: VisualMetricKind; label: string }[] = [
  { value: "count", label: "计数 COUNT(*)" },
  { value: "count_distinct", label: "去重计数" },
  { value: "sum", label: "求和" },
  { value: "avg", label: "平均" },
  { value: "min", label: "最小" },
  { value: "max", label: "最大" },
  { value: "custom", label: "自定义 SQL" },
];

export default function SummaryStep({ ctx }: SummaryStepProps) {
  const { model } = ctx;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          分组维度
        </Typography>
        {model.groupBy.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            未设置分组。仅添加指标时输出单行汇总。
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {model.groupBy.map((group, index) => {
              const category = ctx.refCategory(group.ref);
              return (
                <Box
                  key={index}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Box sx={{ flex: 1 }}>
                    <ColumnRefSelect
                      ctx={ctx}
                      value={
                        group.ref.kind === "column" && !group.ref.column
                          ? null
                          : group.ref
                      }
                      onChange={(ref) =>
                        ctx.onChange(
                          updateGroupBy(model, index, {
                            ref: ref ?? { kind: "column", column: "" },
                            dateUnit: undefined,
                          }),
                        )
                      }
                    />
                  </Box>
                  {category === "temporal" && ctx.dateUnitSupported && (
                    <FormControl size="small" sx={{ width: 130 }}>
                      <Select
                        value={group.dateUnit ?? ""}
                        displayEmpty
                        onChange={(e) =>
                          ctx.onChange(
                            updateGroupBy(model, index, {
                              dateUnit: e.target.value || undefined,
                            }),
                          )
                        }
                      >
                        <MenuItem value="">原始值</MenuItem>
                        {Object.entries(DATE_UNIT_LABELS).map(
                          ([unit, label]) => (
                            <MenuItem key={unit} value={unit}>
                              {label}
                            </MenuItem>
                          ),
                        )}
                      </Select>
                    </FormControl>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => ctx.onChange(removeGroupBy(model, index))}
                    aria-label="删除分组"
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
          onClick={() =>
            ctx.onChange(addGroupBy(model, { kind: "column", column: "" }))
          }
          sx={{ mt: 1 }}
        >
          添加分组维度
        </Button>
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          指标
        </Typography>
        {model.metrics.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            未添加指标。添加后查询将按分组维度聚合。
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {model.metrics.map((metric) => (
              <Box
                key={metric.id}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <FormControl size="small" sx={{ width: 160, flexShrink: 0 }}>
                  <Select
                    value={metric.kind}
                    onChange={(e) => {
                      const kind = e.target.value;
                      ctx.onChange(
                        updateMetric(model, metric.id, {
                          kind,
                          label:
                            metric.label ||
                            defaultMetricLabel({ ...metric, kind }),
                        }),
                      );
                    }}
                  >
                    {METRIC_KIND_LABELS.map((kind) => (
                      <MenuItem key={kind.value} value={kind.value}>
                        {kind.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {metric.kind === "custom" ? (
                  <TextField
                    size="small"
                    placeholder="自定义聚合 SQL，如 SUM(a * b)"
                    value={metric.customSql ?? ""}
                    onChange={(e) =>
                      ctx.onChange(
                        updateMetric(model, metric.id, {
                          customSql: e.target.value,
                        }),
                      )
                    }
                    sx={{ flex: 1, "& input": { fontSize: "0.8125rem" } }}
                  />
                ) : (
                  <Box sx={{ flex: 1 }}>
                    <ColumnRefSelect
                      ctx={ctx}
                      value={metric.ref ?? null}
                      disabled={metric.kind === "count"}
                      onChange={(ref) =>
                        ctx.onChange(
                          updateMetric(model, metric.id, {
                            ref: ref ?? undefined,
                          }),
                        )
                      }
                    />
                  </Box>
                )}
                <TextField
                  size="small"
                  label="显示名"
                  placeholder={defaultMetricLabel(metric)}
                  value={metric.label}
                  onChange={(e) =>
                    ctx.onChange(
                      updateMetric(model, metric.id, { label: e.target.value }),
                    )
                  }
                  sx={{
                    width: 150,
                    flexShrink: 0,
                    "& input": { fontSize: "0.8125rem" },
                  }}
                />
                <IconButton
                  size="small"
                  onClick={() => ctx.onChange(removeMetric(model, metric.id))}
                  aria-label="删除指标"
                >
                  <DeleteIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => ctx.onChange(addMetric(model))}
          sx={{ mt: 1 }}
        >
          添加指标
        </Button>
      </Box>

      {model.metrics.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            HAVING（聚合后过滤）
          </Typography>
          {model.having.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              可对指标结果设置过滤，如「计数 &gt; 10」。
            </Typography>
          )}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {model.having.map((having, index) => (
              <Box
                key={having.id}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <FormControl size="small" sx={{ width: 86, flexShrink: 0 }}>
                  <Select
                    value={index === 0 ? "and" : having.connector}
                    disabled={index === 0}
                    onChange={(e) =>
                      ctx.onChange(
                        updateHaving(model, having.id, {
                          connector: e.target.value,
                        }),
                      )
                    }
                  >
                    <MenuItem value="and">且</MenuItem>
                    <MenuItem value="or">或</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ width: 180, flexShrink: 0 }}>
                  <Select
                    value={having.metricId}
                    displayEmpty
                    onChange={(e) =>
                      ctx.onChange(
                        updateHaving(model, having.id, {
                          metricId: e.target.value,
                        }),
                      )
                    }
                  >
                    {model.metrics.map((metric) => (
                      <MenuItem key={metric.id} value={metric.id}>
                        {metric.label.trim() || defaultMetricLabel(metric)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ width: 130, flexShrink: 0 }}>
                  <Select
                    value={having.op}
                    onChange={(e) =>
                      ctx.onChange(
                        updateHaving(model, having.id, {
                          op: e.target.value,
                          values: [""],
                        }),
                      )
                    }
                  >
                    {METRIC_OPS.map((op) => (
                      <MenuItem key={op.value} value={op.value}>
                        {op.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FilterValueInput
                    op={having.op}
                    category="metric"
                    values={having.values}
                    onChange={(values) =>
                      ctx.onChange(updateHaving(model, having.id, { values }))
                    }
                  />
                </Box>
                <IconButton
                  size="small"
                  onClick={() => ctx.onChange(removeHaving(model, having.id))}
                  aria-label="删除 HAVING"
                >
                  <DeleteIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => ctx.onChange(addHaving(model))}
            sx={{ mt: 1 }}
          >
            添加 HAVING 条件
          </Button>
          {model.having.length > 0 && (
            <Alert severity="info" sx={{ mt: 1, borderRadius: 1.5 }}>
              {model.having.map((h) => describeFilter(model, h)).join("； ")}
            </Alert>
          )}
        </Box>
      )}

      {!ctx.dateUnitSupported && (
        <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
          当前数据库引擎暂不支持日期粒度截断，日期分组将按原始值进行。
        </Alert>
      )}
    </Box>
  );
}
