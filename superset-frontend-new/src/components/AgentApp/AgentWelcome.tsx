import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import AssessmentIcon from "@mui/icons-material/Assessment";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import type { AgentSession } from "@/components/AgentApp/types";

interface QuickIntent {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

const quickIntents: QuickIntent[] = [
  {
    id: "analyze",
    label: "数据分析",
    icon: <ShowChartIcon sx={{ fontSize: 28 }} />,
    prompt: "分析近7天各渠道的消耗和新增用户趋势",
  },
  {
    id: "query",
    label: "数据查询",
    icon: <AutoAwesomeIcon sx={{ fontSize: 28 }} />,
    prompt: "查询昨天各游戏的消耗和CPA数据",
  },
  {
    id: "report",
    label: "生成报表",
    icon: <AssessmentIcon sx={{ fontSize: 28 }} />,
    prompt: "生成上周的广告投放周报",
  },
  {
    id: "compare",
    label: "对比分析",
    icon: <CompareArrowsIcon sx={{ fontSize: 28 }} />,
    prompt: "对比本周和上周各渠道的消耗变化",
  },
];

interface AgentWelcomeProps {
  onSelectIntent: (prompt: string) => void;
  recentSessions?: AgentSession[];
  onSelectSession?: (id: string) => void;
}

export default function AgentWelcome({
  onSelectIntent,
  recentSessions,
  onSelectSession,
}: AgentWelcomeProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        px: 3,
        gap: 4,
      }}
    >
      <Box sx={{ textAlign: "center" }}>
        <AutoAwesomeIcon sx={{ fontSize: 48, color: "primary.main", mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          AI Agent
        </Typography>
        <Typography variant="body2" color="text.secondary">
          用自然语言描述你的数据分析需求
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 2,
          maxWidth: 720,
          width: "100%",
        }}
      >
        {quickIntents.map((intent) => (
          <Card
            key={intent.id}
            variant="outlined"
            sx={{
              transition: "box-shadow 200ms, border-color 200ms",
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: 1,
              },
            }}
          >
            <CardActionArea
              onClick={() => onSelectIntent(intent.prompt)}
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "center",
              }}
            >
              <Box sx={{ color: "primary.main" }}>{intent.icon}</Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {intent.label}
              </Typography>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      {recentSessions && recentSessions.length > 0 && onSelectSession && (
        <Box sx={{ maxWidth: 720, width: "100%" }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            最近会话
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {recentSessions.slice(0, 5).map((session) => (
              <Card
                key={session.id}
                variant="outlined"
                sx={{ "&:hover": { borderColor: "primary.main" } }}
              >
                <CardActionArea
                  onClick={() => onSelectSession(session.id)}
                  sx={{ px: 2, py: 1.5 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {session.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {session.messages.length} 条消息
                  </Typography>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
