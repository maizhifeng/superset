import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import PageHeader from "@/components/PageHeader";
import Icon from "@/superset-ui-mui/components/Icon";
import { paperReveal } from "@/theme/keyframes";
import { colorSlide } from "@/theme/keyframes";
import { Grid2 } from "@/superset-ui-mui/components";
import { useThemeStore } from "@/store/themeStore";
import { cardAccents } from "@/theme/vibrantPalette";

interface HomeLink {
  title: string;
  path: string;
  icon: string;
  desc: string;
  color: string;
}

const links: HomeLink[] = [
  {
    title: "图表",
    path: "/chart/list",
    icon: "chart",
    desc: "创建和管理图表",
    color: "primary.main",
  },
  {
    title: "仪表板",
    path: "/dashboard/list",
    icon: "dashboard",
    desc: "将图表组织到仪表板中",
    color: "success.main",
  },
  {
    title: "SQL 实验室",
    path: "/sqllab",
    icon: "code",
    desc: "编写和运行 SQL 查询",
    color: "secondary.main",
  },
  {
    title: "数据库",
    path: "/database/list",
    icon: "database",
    desc: "连接到您的数据源",
    color: "warning.main",
  },
  {
    title: "数据集",
    path: "/dataset/list",
    icon: "table",
    desc: "管理您的数据表",
    color: "info.main",
  },
  {
    title: "查询历史",
    path: "/query_history",
    icon: "history",
    desc: "查看过往查询",
    color: "error.main",
  },
];

function HomeCard({ link, index }: { link: HomeLink; index: number }) {
  const navigate = useNavigate();
  const themeMode = useThemeStore((s) => s.theme);
  const isVibrant = themeMode === "vibrant";
  const accentColor = cardAccents[index % cardAccents.length];

  return (
    <Paper
      elevation={0}
      onClick={() => navigate(link.path)}
      sx={{
        p: 3,
        borderRadius: 2,
        cursor: "pointer",
        border: isVibrant ? "none" : "1px solid",
        borderColor: isVibrant ? undefined : "border.light",
        borderTop: isVibrant ? "3px solid" : "1px solid",
        borderTopColor: isVibrant ? accentColor : undefined,
        bgcolor: "surface.main",
        boxShadow: isVibrant
          ? `0 1px 2px rgba(30,41,59,0.02), 0 2px 6px ${accentColor}15, 0 4px 12px rgba(30,41,59,0.03)`
          : "0 1px 2px rgba(44,36,22,0.02), 0 1px 4px rgba(44,36,22,0.03), 0 2px 8px rgba(44,36,22,0.02)",
        transition: "box-shadow 250ms cubic-bezier(0.25,0.1,0.15,1), transform 250ms cubic-bezier(0.25,0.1,0.15,1)",
        animation: `${isVibrant ? colorSlide : paperReveal} 400ms cubic-bezier(0.25,0.1,0.15,1) both`,
        animationDelay: `${index * 70}ms`,
        "&:hover": {
          boxShadow: isVibrant
            ? `0 2px 4px ${accentColor}10, 0 8px 20px ${accentColor}18, 0 12px 32px rgba(30,41,59,0.05)`
            : "0 2px 4px rgba(44,36,22,0.03), 0 4px 12px rgba(44,36,22,0.05), 0 8px 24px rgba(184,101,58,0.04)",
          transform: "translateY(-3px)",
        },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 1.5,
          bgcolor: isVibrant
            ? `${accentColor}12`
            : "rgba(184,101,58,0.04)",
        }}
      >
        <Icon name={link.icon} size={22} sx={{ color: isVibrant ? accentColor : link.color }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
        {link.title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {link.desc}
      </Typography>
    </Paper>
  );
}

export default function Home() {
  return (
    <Box sx={{ p: 3, maxWidth: "lg", mx: "auto" }}>
      <PageHeader
title="欢迎使用 Starfly"
subtitle="选择一个模块开始使用"
      />
      <Grid2 container spacing={2}>
        {links.map((link, i) => (
          <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={link.path}>
            <HomeCard link={link} index={i} />
          </Grid2>
        ))}
      </Grid2>
    </Box>
  );
}
