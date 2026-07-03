import { forwardRef, useCallback, useRef, useState, useMemo, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import { ChatBox } from "@mui/x-chat";
import type { ChatPartRendererProps, ChatPartRenderer } from "@mui/x-chat-headless";
import type {
  ChatReasoningMessagePart,
  ChatConversation,
  ChatMessage,
  ChatDynamicToolMessagePart,
  ChatUser,
} from "@mui/x-chat-headless";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import Avatar from "@mui/material/Avatar";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import { getPiAgentAdapter } from "@/api/piAgentAdapter";
import { useAuthStore } from "@/store/authStore";
import { useAgentStore } from "@/store/agentStore";

const reasoningRenderer: ChatPartRenderer<ChatReasoningMessagePart> =
  ({ part }: ChatPartRendererProps<ChatReasoningMessagePart>) => {
    const streaming = part.state === "streaming";
    return (
      <Box
        component="details"
        open={streaming}
        sx={{
          my: 1,
          bgcolor: "grey.50",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        <Box
          component="summary"
          sx={{
            fontWeight: 600,
            color: streaming ? "text.secondary" : "success.main",
            fontSize: "0.75rem",
            py: 0.75,
            px: 1.5,
            cursor: "pointer",
          }}
        >
          {streaming ? "🤔 思考中…" : "💡 思考完成"}
        </Box>
        <Box
          sx={{
            px: 1.5,
            pb: 1.5,
            maxHeight: 120,
            overflow: "auto",
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {part.text}
          </Typography>
        </Box>
      </Box>
    );
  };

const toolRenderer: ChatPartRenderer<ChatDynamicToolMessagePart> =
  ({ part }: ChatPartRendererProps<ChatDynamicToolMessagePart>) => {
    const ti = part.toolInvocation;
    const stateLabel =
      ti.state === "output-available"
        ? "✅ 完成"
        : ti.state === "input-available"
          ? "🔧 调用中"
          : ti.state === "approval-requested"
            ? "⚠️ 需要确认"
            : "⏳ 处理中";

    const outputText =
      typeof ti.output === "string"
        ? ti.output
        : ti.output && typeof ti.output === "object" && "result" in ti.output
          ? (ti.output as { result: string }).result
          : "";

    return (
      <Box
        component="details"
        sx={{
          my: 0.5,
          bgcolor: "grey.50",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
        }}
      >
        <Box
          component="summary"
          sx={{
            fontWeight: 500,
            fontSize: "0.75rem",
            color: "text.secondary",
            py: 0.5,
            px: 1.5,
            cursor: "pointer",
          }}
        >
          {stateLabel} {ti.title ?? ti.toolName}
        </Box>
        <Box sx={{ px: 1.5, pb: 1 }}>
          {ti.input !== undefined && (
            <>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  display: "block",
                  mt: 0.5,
                  mb: 0.25,
                  color: "text.secondary",
                }}
              >
                调用参数
              </Typography>
              <Typography
                variant="caption"
                component="pre"
                sx={{
                  fontSize: "0.7rem",
                  color: "text.secondary",
                  bgcolor: "grey.100",
                  p: 1,
                  borderRadius: 1,
                  overflow: "auto",
                  my: 0.5,
                }}
              >
                {JSON.stringify(ti.input, null, 2)}
              </Typography>
            </>
          )}
          {outputText && (
            <>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  display: "block",
                  mt: ti.input !== undefined ? 1 : 0.5,
                  mb: 0.25,
                  color: "text.secondary",
                }}
              >
                执行结果
              </Typography>
              {renderOutputContent(outputText)}
            </>
          )}
        </Box>
      </Box>
    );
  };

function renderOutputContent(text: string) {
  const lines = text.trim().split("\n");
  // detect markdown table (second line is separator: |---|---|)
  if (
    lines.length >= 2 &&
    lines[0].trim().startsWith("|") &&
    lines[1].trim().startsWith("|") &&
    /^[\s|:\-]+$/.test(lines[1].trim())
  ) {
    const headers = lines[0]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const rows = lines.slice(2).map((line) =>
      line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean),
    );
    if (headers.length > 0 && rows.length > 0) {
      return (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ my: 0.5 }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                {headers.map((h, i) => (
                  <TableCell key={i} sx={{ fontWeight: 600, fontSize: "0.75rem" }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, ri) => (
                <TableRow key={ri}>
                  {row.map((cell, ci) => (
                    <TableCell key={ci} sx={{ fontSize: "0.75rem" }}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }
  }
  // fallback: plain text
  return (
    <Typography
      variant="caption"
      component="pre"
      sx={{
        fontSize: "0.7rem",
        color: "text.secondary",
        bgcolor: "grey.100",
        p: 1,
        borderRadius: 1,
        overflow: "auto",
        my: 0.5,
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </Typography>
  );
}

const suggestions = [
  {
    label: "渠道商洞察",
    value:
      "分析近7天各渠道商的返点后消耗、新增进入和2日留存率数据，找出表现最佳和最差的渠道商",
  },
  {
    label: "媒体分析",
    value:
      "分析近7天各媒体的返点后消耗、新增进入和2日留存率数据，找出表现最佳和最差的媒体",
  },
  {
    label: "游戏分析",
    value:
      "对比各游戏的返点后消耗和ROI表现，列出Top 5高ROI和低ROI游戏",
  },
  {
    label: "异常监测",
    value:
      "检查近7天各渠道商和游戏的返点后消耗、新增进入和ROI是否存在异常波动，标出异常点",
  },
];

function ModelSelector() {
  const [open, setOpen] = useState(false);
  const [modelList, setModelList] = useState<{ id: string; name?: string }[]>([]);
  const [currentModel, setCurrentModel] = useState(
    typeof window !== "undefined"
      ? localStorage.getItem("pi_agent_model") || "gemma-4-e2b-it"
      : "gemma-4-e2b-it",
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    const wsUrl =
      import.meta.env.VITE_PI_AGENT_WS_URL || "ws://localhost:9000/agent/ws";
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "model_list" && Array.isArray(msg.models)) {
          setModelList(msg.models);
          ws.close();
        }
      } catch {}
    };
    ws.onopen = () => {
      const token =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("superset_token")
          : null;
      if (token) {
        ws.send(JSON.stringify({ type: "auth", access_token: token }));
      }
    };
    return () => ws.close();
  }, []);

  const handleSelect = useCallback((id: string) => {
    setCurrentModel(id);
    try {
      localStorage.setItem("pi_agent_model", id);
    } catch {}
    setOpen(false);
  }, []);

  const displayName =
    modelList.find((m) => m.id === currentModel)?.name || currentModel;

  return (
    <Box ref={ref} sx={{ position: "relative", display: "inline-flex" }}>
      <Box
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.4,
          px: 0.6,
          py: 0.2,
          borderRadius: 0.75,
          cursor: "pointer",
          fontSize: "0.68rem",
          color: "primary.main",
          bgcolor: "color-mix(in srgb, var(--mui-palette-accent-teal) 8%, transparent)",
          border: "1px solid",
          borderColor: "color-mix(in srgb, var(--mui-palette-accent-teal) 20%, transparent)",
          userSelect: "none",
          "&:hover": {
            bgcolor: "color-mix(in srgb, var(--mui-palette-accent-teal) 12%, transparent)",
            borderColor: "color-mix(in srgb, var(--mui-palette-accent-teal) 35%, transparent)",
          },
        }}
      >
        <Typography
          component="span"
          sx={{ fontSize: "0.68rem", fontWeight: 500, whiteSpace: "nowrap" }}
        >
          {displayName}
        </Typography>
        <Box
          component="span"
          sx={{
            width: 0,
            height: 0,
            borderLeft: "3px solid transparent",
            borderRight: "3px solid transparent",
            borderTop: "3.5px solid",
            borderTopColor: "primary.main",
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "none",
            flexShrink: 0,
          }}
        />
      </Box>
      {open && (
        <Box
          sx={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            mb: 0.5,
            minWidth: 160,
            maxHeight: 300,
            overflow: "auto",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            boxShadow: "var(--mui-palette-shadow-popover)",
            zIndex: 1300,
          }}
        >
          {modelList.map((m) => (
            <Box
              key={m.id}
              onClick={() => handleSelect(m.id)}
              sx={{
                px: 1.5,
                py: 0.75,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                bgcolor:
                  m.id === currentModel
                    ? "color-mix(in srgb, var(--mui-palette-accent-teal) 8%, transparent)"
                    : "transparent",
                borderLeft:
                  m.id === currentModel
                    ? "3px solid"
                    : "3px solid transparent",
                borderColor:
                  m.id === currentModel ? "primary.main" : "transparent",
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: m.id === currentModel ? 600 : 400,
                  color:
                    m.id === currentModel ? "primary.main" : "text.primary",
                  lineHeight: 1.3,
                }}
              >
                {m.name || m.id}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", fontSize: "0.65rem" }}
              >
                {m.id}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff <= 0) return "now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function CustomConversationList(_props: Record<string, unknown>) {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const switchSession = useAgentStore((s) => s.switchSession);
  const user = useAuthStore((s) => s.user);

  const userAvatar = useMemo(
    () => avatarDataUrl(((user?.username || "U")[0]).toUpperCase()),
    [user?.username],
  );

  const items = useMemo(
    () => sessions.map((s) => {
      const conv = sessionToConversation(s, userAvatar);
      return { ...conv, selected: s.id === activeSessionId };
    }),
    [sessions, activeSessionId, userAvatar],
  );

  return (
    <Box
      role="listbox"
      aria-label="Conversations"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      {items.map((item) => (
        <Box
          key={item.id}
          role="option"
          aria-selected={item.selected}
          onClick={() => switchSession(item.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              switchSession(item.id);
            }
          }}
          tabIndex={item.selected ? 0 : -1}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1.5,
            cursor: "pointer",
            bgcolor: item.selected ? "action.selected" : "transparent",
            borderBottom: "1px solid",
            borderColor: "divider",
            "&:hover": {
              bgcolor: item.selected ? "action.selected" : "action.hover",
            },
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: -2,
            },
          }}
        >
          <Avatar src={item.avatarUrl} sx={{ width: 40, height: 40 }}>
            {(item.title || "?")[0].toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontWeight: item.selected ? 600 : 400,
                  flex: 1,
                }}
              >
                {item.title}
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ ml: 1, flexShrink: 0, fontSize: "0.65rem" }}
              >
                {formatRelativeTime(item.lastMessageAt)}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: "block", mt: 0.25 }}
            >
              {item.subtitle || "暂无消息"}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ComposerToolbar() {
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
      <ModelSelector />
    </Box>
  );
}

const HeaderActions = forwardRef<HTMLDivElement, Record<string, unknown>>(
  function HeaderActions(_props, ref) {
    const sessions = useAgentStore((s) => s.sessions);
    const activeSessionId = useAgentStore((s) => s.activeSessionId);

    return (
      <Box ref={ref} sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        <Tooltip title="新建对话" placement="bottom">
          <IconButton
            size="small"
            onClick={() => {
              useAgentStore.getState().createSession();
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="删除对话" placement="bottom">
          <span>
            <IconButton
              size="small"
              disabled={sessions.length <= 1}
              onClick={() => {
                if (activeSessionId && sessions.length > 1) {
                  useAgentStore.getState().deleteSession(activeSessionId);
                }
              }}
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    );
  },
);

function avatarDataUrl(label: string, bg = "#1976d2"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="600" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function sessionToConversation(
  s: {
    id: string;
    title?: string;
    createdAt: number;
    messages: { role: string; timestamp?: number; content: { type: string; body?: string; summary?: string } }[];
  },
  userAvatar: string,
): ChatConversation {
  const firstUserMsg = s.messages.find(
    (m) => m.role === "user" && m.content?.type === "text",
  );
  let title = s.title || "新对话";
  if (firstUserMsg?.content?.body) {
    title = firstUserMsg.content.body.slice(0, 50);
  } else if (s.title && s.title !== "新对话") {
    title = s.title;
  }
  const lastMsg = s.messages[s.messages.length - 1];
  let subtitle = "";
  let lastTime = s.createdAt;
  if (lastMsg) {
    if (lastMsg.timestamp) lastTime = lastMsg.timestamp;
    if (lastMsg.content.type === "agent_done" && lastMsg.content.summary) {
      subtitle = lastMsg.content.summary.slice(0, 120);
    } else if (lastMsg.content.type === "text" && lastMsg.content.body) {
      subtitle = lastMsg.content.body;
    }
  }
  const initial = (title[0] || "?").toUpperCase();
  return {
    id: s.id,
    title,
    subtitle,
    avatarUrl: userAvatar || avatarDataUrl(initial),
    lastMessageAt: new Date(lastTime).toISOString(),
  };
}

export default function PiAgentChat() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const adapter = getPiAgentAdapter(user?.username ?? "anonymous");
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const switchSession = useAgentStore((s) => s.switchSession);

  const userName = user?.username || "U";
  const currentUser: ChatUser = {
    id: userName,
    displayName: userName,
    avatarUrl: avatarDataUrl(userName[0].toUpperCase(), theme.palette.primary.main),
    role: "user",
  };
  const assistantUser: ChatUser = {
    id: "ai-assistant",
    displayName: "AI",
    avatarUrl: avatarDataUrl("A", theme.palette.secondary.main),
    role: "assistant",
  };
  const members = [currentUser, assistantUser];

  const userAvatar = useMemo(
    () => avatarDataUrl(((user?.username || "U")[0]).toUpperCase(), theme.palette.primary.main),
    [user?.username, theme.palette.primary.main],
  );

  // Ensure at least one session exists
  useEffect(() => {
    const store = useAgentStore.getState();
    if (store.sessions.length === 0 || !store.activeSessionId) {
      store.createSession();
    }
  }, [sessions.length]);

  const conversations = useMemo(
    () => sessions.map((s) => sessionToConversation(s, userAvatar)),
    [sessions, userAvatar],
  );

  const handleActiveConversationChange = useCallback(
    (id: string | undefined) => {
      if (id) switchSession(id);
    },
    [switchSession],
  );

  const handleMessagesChange = useCallback(
    (msgs: ChatMessage[]) => {
      const sid = activeSessionId;
      if (!sid) return;
      const store = useAgentStore.getState();
      store.setSessionMessages(
        sid,
        msgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            const text = m.parts
              .map((p) => ("text" in p ? p.text : ""))
              .filter(Boolean)
              .join("");
            const rawParts = m.parts.map((p) => {
              if (p.type === "dynamic-tool") {
                const ti = (p as any).toolInvocation;
                return {
                  type: "dynamic-tool",
                  toolInvocation: {
                    toolCallId: ti.toolCallId,
                    toolName: ti.toolName,
                    title: ti.title,
                    state: ti.state === "output-available" ? "output-available" : "completed",
                    input: ti.input,
                    output: ti.output,
                    args: ti.args,
                  },
                };
              }
              if (p.type === "reasoning") {
                return {
                  type: "reasoning",
                  text: (p as any).text,
                  state: (p as any).state === "streaming" ? "complete" : (p as any).state,
                };
              }
              if ("text" in p) {
                return { type: "text", text: p.text };
              }
              return null;
            }).filter(Boolean);
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              content: text
                ? ({ type: "text" as const, body: text } as const)
                : ({ type: "text" as const, body: "" } as const),
              rawParts: rawParts.length > 0 ? (rawParts as Record<string, unknown>[]) : undefined,
              timestamp: Date.now(),
            };
          }),
      );
    },
    [activeSessionId],
  );

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
      }}
    >
      <Box
        sx={{
          width: 300,
          flexShrink: 0,
          borderRight: "1px solid",
          borderColor: "divider",
          overflow: "auto",
          bgcolor: "background.paper",
        }}
      >
        <CustomConversationList />
      </Box>
        <ChatBox
          key={activeSessionId || "empty"}
          adapter={adapter}
          members={members}
          currentUser={currentUser}
          conversations={conversations}
          initialActiveConversationId={activeSessionId ?? undefined}
          onActiveConversationChange={handleActiveConversationChange}
          onMessagesChange={handleMessagesChange}
          suggestions={suggestions}
        suggestionsAutoSubmit
        layoutMode="standard"
        features={{
          conversationList: false,
          suggestions: true,
          attachments: false,
          scrollToBottom: true,
          autoScroll: true,
        }}
        partRenderers={{
          reasoning: reasoningRenderer,
          "dynamic-tool": toolRenderer,
        }}
        slots={{
          composerToolbar: ComposerToolbar,
          conversationHeaderActions: HeaderActions,
        }}
        slotProps={{
          scrollToBottom: {
            sx: {
              "&:hover": {
                transform: "translateX(-50%)",
                boxShadow: "var(--mui-palette-shadow-md)",
              },
            },
          },
        }}
        sx={{ flex: 1 }}
      />
    </Box>
  );
}
