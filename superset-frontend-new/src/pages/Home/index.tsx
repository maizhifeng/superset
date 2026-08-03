import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import PageHeader from "@/components/PageHeader";
import Icon from "@/superset-ui-mui/components/Icon";
import { Grid2 } from "@/superset-ui-mui/components";
import AccentCard from "@/components/AccentCard";

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

export default function Home() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3, maxWidth: "lg", mx: "auto" }}>
      <PageHeader title="欢迎使用 Starfly" subtitle="选择一个模块开始使用" />
      <Grid2 container spacing={2}>
        {links.map((link) => (
          <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={link.path}>
            <AccentCard
              onClick={() => navigate(link.path)}
              icon={
                <Icon name={link.icon} size={22} sx={{ color: link.color }} />
              }
              title={link.title}
              description={link.desc}
            />
          </Grid2>
        ))}
      </Grid2>
    </Box>
  );
}
