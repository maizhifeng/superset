import { useState, useEffect, useRef } from "react";
import type { SxProps, Theme } from "@mui/material";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import IconButton from "@mui/material/IconButton";

interface FilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  sx?: SxProps<Theme>;
  compact?: boolean;
}

export default function FilterBar({
  value,
  onChange,
  placeholder = "Search...",
  sx,
  compact = false,
}: FilterBarProps) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleChange = (next: string) => {
    setLocal(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        onChange(next);
      }
    }, 300);
  };

  const handleClear = () => {
    setLocal("");
    clearTimeout(timerRef.current);
    onChange("");
  };

  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      sx={{
        minWidth: 300,
        ...sx,
        ...(compact && {
          "& .MuiInputBase-root": { height: 32, fontSize: "0.8125rem" },
          "& .MuiOutlinedInput-input": { py: 0.25 },
        }),
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: "text.disabled" }} />
            </InputAdornment>
          ),
          endAdornment: local ? (
            <InputAdornment position="end">
              <IconButton size="small" edge="end" onClick={handleClear}>
                <ClearIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}
