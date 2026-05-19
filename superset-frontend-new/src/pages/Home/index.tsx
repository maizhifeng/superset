import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import PageHeader from "@/components/PageHeader";
import Icon from "@/superset-ui-mui/components/Icon";
import { fadeInUp } from "@/theme/keyframes";
import { Grid2 } from "@/superset-ui-mui/components";

const links = [
  {
    title: "Charts",
    path: "/chart/list",
    icon: "chart",
    desc: "Create and manage charts",
    color: "primary.main",
  },
  {
    title: "Dashboards",
    path: "/dashboard/list",
    icon: "dashboard",
    desc: "Organize charts into dashboards",
    color: "success.main",
  },
  {
    title: "SQL Lab",
    path: "/sqllab",
    icon: "code",
    desc: "Write and run SQL queries",
    color: "secondary.main",
  },
  {
    title: "Databases",
    path: "/database/list",
    icon: "database",
    desc: "Connect to your data sources",
    color: "warning.main",
  },
  {
    title: "Datasets",
    path: "/dataset/list",
    icon: "table",
    desc: "Manage your data tables",
    color: "info.main",
  },
  {
    title: "Query History",
    path: "/query_history",
    icon: "history",
    desc: "View past queries",
    color: "error.main",
  },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3, maxWidth: "lg", mx: "auto" }}>
      <PageHeader
        title="Welcome to Starfly"
        subtitle="Select a section to get started"
      />
      <Grid2 container spacing={2}>
        {links.map((link, i) => (
          <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={link.path}>
            <Paper
              key={link.path}
              elevation={0}
              onClick={() => navigate(link.path)}
              sx={{
                p: 3,
                borderRadius: 2,
                cursor: "pointer",
                boxShadow:
                  "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.06)",
                transition:
                  "box-shadow 200ms cubic-bezier(0, 0, 0.2, 1), transform 200ms cubic-bezier(0, 0, 0.2, 1)",
                animation: `${fadeInUp} 300ms ease-out both`,
                animationDelay: `${i * 50}ms`,
                "&:hover": {
                  boxShadow:
                    "0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.10)",
                  transform: "translateY(-2px)",
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
                  bgcolor: "action.hover",
                }}
              >
                <Icon name={link.icon} size={22} sx={{ color: link.color }} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                {link.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {link.desc}
              </Typography>
            </Paper>
          </Grid2>
        ))}
      </Grid2>
    </Box>
  );
}
