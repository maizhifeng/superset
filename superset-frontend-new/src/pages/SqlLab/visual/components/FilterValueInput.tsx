import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import type { ColumnCategory } from "../operators";
import { operatorDef } from "../operators";
import type { VisualFilterOp } from "../types";

interface FilterValueInputProps {
  op: VisualFilterOp;
  category: ColumnCategory | "metric";
  values: (string | number | null)[];
  onChange: (values: (string | number | null)[]) => void;
  disabled?: boolean;
}

const datePickerSx = { width: 170 };

function toDayjs(
  value: string | number | null | undefined,
): dayjs.Dayjs | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = dayjs(String(value));
  return parsed.isValid() ? parsed : null;
}

export default function FilterValueInput({
  op,
  category,
  values,
  onChange,
  disabled = false,
}: FilterValueInputProps) {
  const def = operatorDef(category === "metric" ? "number" : category, op);
  const arity =
    op === "between" || op === "date_between" ? 2 : (def?.arity ?? 1);

  if (arity === 0) return null;

  const setAt = (index: number, value: string | number | null) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };

  if (op === "date_on" || op === "date_before" || op === "date_after") {
    return (
      <DatePicker
        disabled={disabled}
        value={toDayjs(values[0])}
        onChange={(v) =>
          setAt(0, v && v.isValid() ? v.format("YYYY-MM-DD") : null)
        }
        format="YYYY-MM-DD"
        slotProps={{ textField: { size: "small", sx: datePickerSx } }}
      />
    );
  }

  if (op === "date_between") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <DatePicker
          disabled={disabled}
          value={toDayjs(values[0])}
          onChange={(v) =>
            setAt(0, v && v.isValid() ? v.format("YYYY-MM-DD") : null)
          }
          format="YYYY-MM-DD"
          slotProps={{ textField: { size: "small", sx: datePickerSx } }}
        />
        <Box component="span" sx={{ color: "text.secondary" }}>
          —
        </Box>
        <DatePicker
          disabled={disabled}
          value={toDayjs(values[1])}
          onChange={(v) =>
            setAt(1, v && v.isValid() ? v.format("YYYY-MM-DD") : null)
          }
          format="YYYY-MM-DD"
          minDate={toDayjs(values[0]) ?? undefined}
          slotProps={{ textField: { size: "small", sx: datePickerSx } }}
        />
      </Box>
    );
  }

  if (op === "in" || op === "not_in") {
    const current =
      values.length === 1 ? String(values[0] ?? "") : values.join(", ");
    return (
      <TextField
        disabled={disabled}
        size="small"
        fullWidth
        placeholder="多个值用逗号分隔"
        value={current}
        onChange={(e) => onChange([e.target.value])}
      />
    );
  }

  const numeric = category === "number" || category === "metric";
  const type = numeric ? "number" : "text";

  if (arity === 2) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <TextField
          disabled={disabled}
          size="small"
          type={type}
          fullWidth
          value={values[0] ?? ""}
          onChange={(e) => setAt(0, e.target.value)}
        />
        <Box component="span" sx={{ color: "text.secondary" }}>
          —
        </Box>
        <TextField
          disabled={disabled}
          size="small"
          type={type}
          fullWidth
          value={values[1] ?? ""}
          onChange={(e) => setAt(1, e.target.value)}
        />
      </Box>
    );
  }

  return (
    <TextField
      disabled={disabled}
      size="small"
      type={type}
      fullWidth
      placeholder={numeric ? "数值" : "取值"}
      value={values[0] ?? ""}
      onChange={(e) => setAt(0, e.target.value)}
    />
  );
}
