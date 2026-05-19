import { useState, useEffect, useCallback, useMemo } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import InfoIcon from "@mui/icons-material/Info";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import api from "@/api";
import type { CompareDimension } from "@/pages/Dashboard/ChartCard";

export interface ColumnOption {
  datasetId: number;
  column: string;
  name: string;
}

function formatDateOption(raw: string): string {
  const num = Number(raw);
  if (num > 1e12 && num < 1e16) {
    const d = new Date(num);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return d.toLocaleDateString();
  }
  return raw;
}

interface RuleEntry {
  dimension: ColumnOption | null;
  values: string[];
  valueOptions: string[];
}

interface CompareConfigModalProps {
  open: boolean;
  columns: ColumnOption[];
  fullData?: Record<string, unknown>;
  onApply: (dimensions: CompareDimension[]) => void;
  onCancel: () => void;
}

function makeEmptyRule(): RuleEntry {
  return { dimension: null, values: [], valueOptions: [] };
}

function extractValuesFromData(
  rows: Record<string, unknown>[],
  dimension: string,
): string[] {
  return Array.from(
    new Set(rows.map((r) => String(r[dimension] ?? ""))),
  ).filter(Boolean);
}

async function fetchColumnValues(
  datasetId: number,
  column: string,
): Promise<string[]> {
  try {
    const res = await api.get(
      `/datasource/table/${datasetId}/column/${encodeURIComponent(column)}/values/`,
    );
    const raw: unknown[] = res.data?.result || [];
    return raw.filter((v): v is string => v != null).map(String);
  } catch {
    return [];
  }
}

export default function CompareConfigModal({
  open,
  columns,
  fullData,
  onApply,
  onCancel,
}: CompareConfigModalProps) {
  const [rules, setRules] = useState<RuleEntry[]>([makeEmptyRule()]);

  const dateCols = useMemo(() => {
    const colnames = fullData?.colnames as string[] | undefined;
    const coltypes = fullData?.coltypes as number[] | undefined;
    if (!colnames || !coltypes) return new Set<string>();
    return new Set(colnames.filter((_, i) => coltypes[i] === 2));
  }, [fullData]);

  useEffect(() => {
    if (!open) {
      setRules([makeEmptyRule()]);
    }
  }, [open]);

  const handleDimensionChange = useCallback(
    (index: number, value: ColumnOption | null) => {
      setRules((prev) => {
        let valueOptions: string[] = [];
        if (value) {
          const allRows =
            fullData?.data && Array.isArray(fullData.data)
              ? (fullData.data as Record<string, unknown>[])
              : null;
          if (
            allRows &&
            allRows.length > 0 &&
            allRows[0] != null &&
            value.column in allRows[0]
          ) {
            const filtered = allRows.filter((row) =>
              prev.every(
                (r, i) =>
                  i >= index ||
                  !r.dimension ||
                  r.values.length === 0 ||
                  r.values.includes(String(row[r.dimension.column] ?? "")),
              ),
            );
            valueOptions = extractValuesFromData(filtered, value.column);
          }
        }
        return prev.map((r, i) =>
          i === index ? { dimension: value, values: [], valueOptions } : r,
        );
      });
      if (value) {
        const allRows =
          fullData?.data && Array.isArray(fullData.data)
            ? (fullData.data as Record<string, unknown>[])
            : null;
        if (!allRows || allRows.length === 0 || !(value.column in allRows[0])) {
          fetchColumnValues(value.datasetId, value.column).then((vals) => {
            if (vals.length > 0) {
              setRules((prev) =>
                prev.map((r, i) =>
                  i === index && r.dimension?.column === value.column
                    ? { ...r, valueOptions: vals }
                    : r,
                ),
              );
            }
          });
        }
      }
    },
    [fullData],
  );

  const handleValuesChange = useCallback(
    (index: number, vals: string[]) => {
      const allRows =
        fullData?.data && Array.isArray(fullData.data)
          ? (fullData.data as Record<string, unknown>[])
          : null;
      setRules((prev) => {
        const updated = prev.map((r, i) =>
          i === index ? { ...r, values: vals } : r,
        );
        return updated.map((rule, i) => {
          if (i > index && rule.dimension && allRows) {
            const filtered = allRows.filter((row) =>
              updated.every(
                (r, j) =>
                  j >= i ||
                  !r.dimension ||
                  r.values.length === 0 ||
                  r.values.includes(String(row[r.dimension.column] ?? "")),
              ),
            );
            return {
              ...rule,
              valueOptions: extractValuesFromData(
                filtered,
                rule.dimension.column,
              ),
            };
          }
          return rule;
        });
      });
    },
    [fullData],
  );

  const addRule = () => {
    setRules((prev) => [...prev, makeEmptyRule()]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApply = () => {
    const dimensions: CompareDimension[] = rules
      .filter((r) => r.dimension != null && r.values.length > 0)
      .map((r) => ({ dimension: r.dimension!.column, values: r.values }));
    if (dimensions.length > 0) {
      onApply(dimensions);
    }
  };

  const canApply = rules.some(
    (r) => r.dimension != null && r.values.length > 0,
  );

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CompareArrowsIcon sx={{ fontSize: 20, color: "primary.main" }} />
        Compare Table
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          pt: "8px !important",
        }}
      >
        {rules.map((rule, index) => (
          <Box key={index}>
            {index > 0 && <Divider sx={{ my: 1 }} />}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                <Autocomplete
                  options={columns}
                  value={rule.dimension}
                  onChange={(_, value) => handleDimensionChange(index, value)}
                  getOptionLabel={(opt) => opt.name}
                  isOptionEqualToValue={(opt, val) =>
                    opt.column === val.column && opt.datasetId === val.datasetId
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={`Dimension ${index + 1}`}
                      placeholder="Select dimension"
                      size="small"
                    />
                  )}
                  fullWidth
                />
                {rule.dimension && (
                  <Autocomplete
                    multiple
                    options={rule.valueOptions}
                    value={rule.values}
                    onChange={(_, vals) => handleValuesChange(index, vals)}
                    getOptionLabel={(opt) =>
                      dateCols.has(rule.dimension!.column)
                        ? formatDateOption(opt)
                        : opt
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Values"
                        placeholder="Select values"
                        size="small"
                      />
                    )}
                    fullWidth
                  />
                )}
                {rule.dimension && !fullData && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    <InfoIcon sx={{ fontSize: 13 }} />
                    Chart data not available
                  </Typography>
                )}
                {rule.dimension &&
                  fullData &&
                  rule.valueOptions.length === 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <FilterAltOffIcon sx={{ fontSize: 13 }} />
                      No matching values from previous filters
                    </Typography>
                  )}
              </Box>
              {rules.length > 1 && (
                <IconButton
                  size="small"
                  onClick={() => removeRule(index)}
                  sx={{ mt: 0.5 }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Box>
          </Box>
        ))}
        <Button
          startIcon={<AddIcon />}
          onClick={addRule}
          size="small"
          sx={{ alignSelf: "flex-start" }}
        >
          Add dimension
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} startIcon={<CloseIcon />}>
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={!canApply}
          startIcon={<CheckIcon />}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
