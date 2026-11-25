/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import LocalizedDatePicker from "@/components/LocalizedDatePicker";
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

const datePickerSx = { width: 148 };

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
      <LocalizedDatePicker
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
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <LocalizedDatePicker
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
        <LocalizedDatePicker
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
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
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
