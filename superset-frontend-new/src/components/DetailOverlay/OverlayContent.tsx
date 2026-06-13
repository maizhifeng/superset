import { lazy, Suspense } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { NavCategory } from "@/store/navStore";

const ChartList = lazy(() => import("@/pages/ChartList"));
const DashboardList = lazy(() => import("@/pages/DashboardList"));
const DatasetList = lazy(() => import("@/pages/DatasetList"));
const SavedQueryList = lazy(() => import("@/pages/SavedQueryList"));
const SqlLab = lazy(() => import("@/pages/SqlLab"));
const Settings = lazy(() => import("@/pages/Settings"));
const ChartEditor = lazy(() => import("@/pages/ChartCreation/ChartEditor"));

function Loader() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

interface OverlayContentProps {
  type: NavCategory | "sqllab" | "chart-editor";
  id?: number | string;
}

export default function OverlayContent({ type, id }: OverlayContentProps) {
  const renderContent = () => {
    switch (type) {
      case "dashboard":
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6">仪表板列表</Typography>
            <Suspense fallback={<Loader />}>
              <DashboardList />
            </Suspense>
          </Box>
        );
      case "chart":
        if (id) {
          return (
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Suspense fallback={<Loader />}>
                <ChartEditor compact />
              </Suspense>
            </Box>
          );
        }
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6">图表列表</Typography>
            <Suspense fallback={<Loader />}>
              <ChartList />
            </Suspense>
          </Box>
        );
      case "dataset":
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6">数据集列表</Typography>
            <Suspense fallback={<Loader />}>
              <DatasetList />
            </Suspense>
          </Box>
        );
      case "saved_query":
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6">已保存查询</Typography>
            <Suspense fallback={<Loader />}>
              <SavedQueryList />
            </Suspense>
          </Box>
        );
      case "sqllab":
        return (
          <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Suspense fallback={<Loader />}>
              <SqlLab />
            </Suspense>
          </Box>
        );
      case "settings":
        return (
          <Suspense fallback={<Loader />}>
            <Settings />
          </Suspense>
        );
      default:
        return (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">未知页面</Typography>
          </Box>
        );
    }
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto" }}>
      {renderContent()}
    </Box>
  );
}
