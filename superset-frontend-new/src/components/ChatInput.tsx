import type { ReactNode } from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import SendIcon from "@mui/icons-material/Send";
import { useRotatingPlaceholder } from "@/hooks/useRotatingPlaceholder";
import { useRotatingShortcutHints } from "@/hooks/useRotatingShortcutHints";

interface ChatInputProps {
  onSend?: (value: string) => void;
  rotatingHints?: string[];
  hintIntervalMs?: number;
  autoFocus?: boolean;
  disableMaxWidth?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

const KEY_COMBO_RE = /[A-Za-z0-9?/]+\+[A-Za-z0-9?/]+/g;

const MODIFIERS = new Set([
  "Shift",
  "Ctrl",
  "Cmd",
  "Alt",
  "Enter",
  "Esc",
  "Tab",
  "Del",
  "BS",
  "Space",
  "Up",
  "Down",
  "Left",
  "Right",
]);

const SEPARATOR_SX = { color: "text.disabled", fontSize: "0.75rem", mx: 0.25 };

const CHIP_BASE = {
  height: 18,
  fontSize: "0.75rem",
  fontWeight: 700,
  fontFamily: "monospace",
  "& .MuiChip-label": { px: 0.5 },
};

const MODIFIER_SX = {
  ...CHIP_BASE,
  bgcolor: "error.main",
  color: "error.contrastText",
  borderColor: "error.main",
};

const KEY_SX = {
  ...CHIP_BASE,
  bgcolor: "info.main",
  color: "info.contrastText",
  borderColor: "info.main",
};

const ACTION_SX = {
  ...CHIP_BASE,
  bgcolor: "success.main",
  color: "success.contrastText",
  borderColor: "success.main",
};

function renderHintWithChips(hint: string) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  KEY_COMBO_RE.lastIndex = 0;
  while ((match = KEY_COMBO_RE.exec(hint)) !== null) {
    const m = match;
    if (m.index > lastIndex) {
      const text = hint.slice(lastIndex, m.index);
      if (text === " ") {
        parts.push(
          <Box key={`s-${lastIndex}`} component="span" sx={{ width: 4 }} />,
        );
      } else if (text.trim()) {
        parts.push(
          <Box key={`t-${lastIndex}`} component="span" sx={SEPARATOR_SX}>
            {text}
          </Box>,
        );
      }
    }
    const keys = m[0].split("+");
    keys.forEach((key, idx) => {
      if (idx > 0) {
        parts.push(
          <Box key={`p-${m.index}-${idx}`} component="span" sx={SEPARATOR_SX}>
            +
          </Box>,
        );
      }
      const isModifier = MODIFIERS.has(key);
      parts.push(
        <Chip
          key={`k-${m.index}-${idx}`}
          label={key}
          size="small"
          sx={isModifier ? MODIFIER_SX : KEY_SX}
        />,
      );
    });
    lastIndex = KEY_COMBO_RE.lastIndex;
  }
  if (lastIndex < hint.length) {
    const remaining = hint.slice(lastIndex);
    const label = remaining.startsWith(" to ") ? remaining.slice(4) : remaining;
    parts.push(
      <Box key={`eq-${lastIndex}`} component="span" sx={SEPARATOR_SX}>
        {" = "}
      </Box>,
    );
    parts.push(
      <Chip key={`action`} label={label} size="small" sx={ACTION_SX} />,
    );
  }
  return parts;
}

export default function ChatInput({
  onSend,
  rotatingHints,
  hintIntervalMs = 8000,
  autoFocus,
  disableMaxWidth,
  placeholder,
  value: controlledValue,
  onChange: controlledOnChange,
}: ChatInputProps) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState("");
  const value = isControlled ? controlledValue : internalValue;
  const setValue = isControlled
    ? (controlledOnChange ?? (() => {}))
    : setInternalValue;

  const registryHints = useRotatingShortcutHints();

  const rotating = useRotatingPlaceholder({
    hints: rotatingHints ?? registryHints,
    intervalMs: hintIntervalMs,
    enabled: !value.trim(),
  });

  const handleSend = () => {
    if (value.trim() && onSend) {
      onSend(value.trim());
      if (!isControlled) setInternalValue("");
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: disableMaxWidth ? "none" : 400,
        position: "relative",
      }}
    >
      <TextField
        fullWidth
        size="small"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
        }}
        autoFocus={autoFocus}
        placeholder={placeholder}
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: 20,
            bgcolor: "background.paper",
            height: 34,
            fontSize: "0.8125rem",
            "& fieldset": { borderColor: "divider" },
            "&:hover fieldset": { borderColor: "text.disabled" },
            "&.Mui-focused fieldset": {
              borderColor: "primary.main",
              borderWidth: 1,
            },
          },
        }}
        slotProps={{
          input: {
            sx: { position: "relative", zIndex: 1 },
            endAdornment: value.trim() ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleSend} sx={{ p: 0.25 }}>
                  <SendIcon sx={{ fontSize: 16, color: "primary.main" }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      {!placeholder && !value.trim() && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            px: 2,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {renderHintWithChips(rotating)}
        </Box>
      )}
    </Box>
  );
}
