import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ChatIcon from "@mui/icons-material/Chat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useAgentStore } from "@/store/agentStore";
import { usePiAgent } from "@/hooks/usePiAgent";

export default function AgentSessionSidebar() {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const createSession = useAgentStore((s) => s.createSession);
  const switchSession = useAgentStore((s) => s.switchSession);
  const deleteSession = useAgentStore((s) => s.deleteSession);

  const { isSessionRunning } = usePiAgent();

  return (
    <Box
      sx={{
        width: 260,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          会话列表
        </Typography>
        <Tooltip title="新建会话" placement="right">
          <IconButton
            size="small"
            onClick={createSession}
            sx={{ color: "primary.main" }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {sessions.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <ChatIcon sx={{ fontSize: 32, color: "text.disabled", mb: 1 }} />
            <Typography variant="caption" color="text.secondary">
              暂无会话
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={createSession}
              sx={{ mt: 1, textTransform: "none" }}
            >
              新建会话
            </Button>
          </Box>
        ) : (
          <List dense disablePadding>
            {sessions.map((session) => {
              const running = isSessionRunning(session.id);
              return (
              <ListItemButton
                key={session.id}
                selected={session.id === activeSessionId}
                onClick={() => switchSession(session.id)}
                sx={{
                  px: 1.5,
                  py: 1,
                  gap: 0.75,
                  "&.Mui-selected": {
                    bgcolor: "action.selected",
                    borderRight: "3px solid",
                    borderColor: "primary.main",
                  },
                }}
              >
                {session.summary ? (
                  <CheckCircleIcon sx={{ fontSize: 14, color: "success.main", flexShrink: 0 }} />
                ) : running ? (
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: "primary.main",
                      flexShrink: 0,
                      animation: "pulse 1.5s ease-in-out infinite",
                      "@keyframes pulse": {
                        "0%, 100%": { opacity: 0.4 },
                        "50%": { opacity: 1 },
                      },
                    }}
                  />
                ) : (
                  <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
                )}
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: session.id === activeSessionId ? 600 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {session.title}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {`${session.messages.length} 条消息`}
                    </Typography>
                  }
                />
                <Tooltip title="删除" placement="left">
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    sx={{
                      color: "text.disabled",
                      "&:hover": { color: "error.main" },
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
              );
            })}
          </List>
        )}
      </Box>
    </Box>
  );
}
