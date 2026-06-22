import { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";
import ModelSelector from "@/components/AgentApp/ModelSelector";

interface SmartInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  currentModel?: string;
  modelList?: { id: string; name?: string }[];
  onModelChange?: (model: string) => void;
}

const SLASH_COMMANDS = [
  { command: "/explain", description: "解释当前内容" },
  { command: "/sql", description: "生成 SQL 查询" },
  { command: "/chart", description: "创建图表" },
  { command: "/help", description: "查看帮助" },
];

export default function SmartInput({
  onSend,
  onStop,
  streaming,
  disabled,
  currentModel,
  modelList,
  onModelChange,
}: SmartInputProps) {
  const [value, setValue] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.startsWith("/")) {
      const query = value.toLowerCase();
      setFilteredCommands(
        SLASH_COMMANDS.filter((c) => c.command.startsWith(query)),
      );
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  }, [value]);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg || streaming) return;
    setValue("");
    setShowCommands(false);
    onSend(msg);
  }, [value, streaming, onSend]);

  const handleCommandSelect = useCallback((command: string) => {
    setValue(`${command} `);
    setShowCommands(false);
    inputRef.current?.querySelector("textarea")?.focus();
  }, []);

  return (
    <Box sx={{ position: "relative" }}>
      {showCommands && filteredCommands.length > 0 && (
        <Box
          sx={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            mb: 0.5,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          {filteredCommands.map((cmd) => (
            <Box
              key={cmd.command}
              onClick={() => handleCommandSelect(cmd.command)}
              sx={{
                px: 1.5,
                py: 1,
                cursor: "pointer",
                display: "flex",
                gap: 1.5,
                alignItems: "center",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Box
                component="span"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "primary.main",
                }}
              >
                {cmd.command}
              </Box>
              <Box
                component="span"
                sx={{ fontSize: "0.75rem", color: "text.secondary" }}
              >
                {cmd.description}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
        <TextField
          ref={inputRef}
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="输入问题… 使用 / 查看命令"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (showCommands && filteredCommands.length > 0) {
                handleCommandSelect(filteredCommands[0].command);
              } else {
                handleSend();
              }
            }
          }}
          slotProps={{
            input: {
              startAdornment: currentModel && onModelChange ? (
                <InputAdornment position="start" sx={{ mr: 0.75 }}>
                  <ModelSelector
                    current={currentModel || ""}
                    models={modelList || []}
                    onSelect={onModelChange || (() => {})}
                    compact
                  />
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
              fontSize: "0.8125rem",
              bgcolor: "background.default",
            },
          }}
        />
        {streaming ? (
          <IconButton color="error" onClick={onStop} size="small">
            <StopIcon />
          </IconButton>
        ) : (
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!value.trim()}
            size="small"
          >
            <SendIcon />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
