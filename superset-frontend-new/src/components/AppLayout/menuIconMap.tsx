import type { ReactNode } from "react";
import DashboardIcon from "@mui/icons-material/Dashboard";
import BarChartIcon from "@mui/icons-material/BarChart";
import TableChartIcon from "@mui/icons-material/TableChart";
import SaveIcon from "@mui/icons-material/Save";
import CodeIcon from "@mui/icons-material/Code";
import StorageIcon from "@mui/icons-material/Storage";
import NotificationsIcon from "@mui/icons-material/Notifications";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PeopleIcon from "@mui/icons-material/People";
import SecurityIcon from "@mui/icons-material/Security";
import ArticleIcon from "@mui/icons-material/Article";

export const menuIconMap: Record<string, ReactNode> = {
  dashboards: <DashboardIcon sx={{ fontSize: 20 }} />,
  charts: <BarChartIcon sx={{ fontSize: 20 }} />,
  datasets: <TableChartIcon sx={{ fontSize: 20 }} />,
  "saved_query/list": <SaveIcon sx={{ fontSize: 20 }} />,
  sqllab: <CodeIcon sx={{ fontSize: 20 }} />,
  "database/list": <StorageIcon sx={{ fontSize: 20 }} />,
  "alert/list": <NotificationsIcon sx={{ fontSize: 20 }} />,
  query_history: <HistoryIcon sx={{ fontSize: 20 }} />,
  project_config: <AccountTreeIcon sx={{ fontSize: 20 }} />,
  briefing: <ArticleIcon sx={{ fontSize: 20 }} />,
  admin_users: <PeopleIcon sx={{ fontSize: 20 }} />,
  admin_roles: <SecurityIcon sx={{ fontSize: 20 }} />,
  system_admin: <AdminPanelSettingsIcon sx={{ fontSize: 20 }} />,
};

export const defaultIcon = <SettingsIcon sx={{ fontSize: 20 }} />;
