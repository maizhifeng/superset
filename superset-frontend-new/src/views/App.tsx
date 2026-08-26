import { useCallback, type ComponentType } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import PageTransition from "@/components/PageTransition";
import KeyboardShortcutHelpModal from "@/components/KeyboardShortcutHelpModal";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import { useAuthStore } from "@/store/authStore";
import { useHelpModalStore } from "@/store/helpModal";
import { routePermissions } from "@/config/routePermissions";

const Login = lazy(() => import("@/pages/Login"));
const Home = lazy(() => import("@/pages/Home"));
const ChartList = lazy(() => import("@/pages/ChartList"));
const ChartCreation = lazy(() => import("@/pages/ChartCreation"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const DashboardList = lazy(() => import("@/pages/DashboardList"));
const SqlLab = lazy(() => import("@/pages/SqlLab"));
const DatabaseList = lazy(() => import("@/pages/DatabaseList"));
const DatabaseDetail = lazy(() => import("@/pages/DatabaseDetail"));
const DatasetList = lazy(() => import("@/pages/DatasetList"));
const DatasetCreation = lazy(() => import("@/pages/DatasetCreation"));
const DatasetEdit = lazy(() => import("@/pages/DatasetEdit"));
const ProjectConfigCenter = lazy(() => import("@/pages/ProjectConfigCenter"));
const SavedQueryList = lazy(() => import("@/pages/SavedQueryList"));
const AlertReportList = lazy(() => import("@/pages/AlertReportList"));
const QueryHistoryList = lazy(() => import("@/pages/QueryHistoryList"));
const SystemAdmin = lazy(() => import("@/pages/SystemAdmin"));
const BriefingList = lazy(() => import("@/pages/Briefing"));
const BriefingDetail = lazy(() => import("@/pages/Briefing/detail"));

interface RouteConfig {
  path: string;
  Component: ComponentType;
  layout: "default" | "none";
}

const routes: RouteConfig[] = [
  { path: "/", Component: Home, layout: "default" },
  { path: "/chart/list", Component: ChartList, layout: "default" },
  { path: "/explore", Component: ChartCreation, layout: "default" },
  { path: "/explore/*", Component: ChartCreation, layout: "default" },
  { path: "/dashboard/list", Component: DashboardList, layout: "default" },
  { path: "/dashboard/:id", Component: Dashboard, layout: "default" },
  { path: "/sqllab", Component: SqlLab, layout: "default" },
  { path: "/database/list", Component: DatabaseList, layout: "default" },
  { path: "/database/:id", Component: DatabaseDetail, layout: "default" },
  { path: "/dataset/list", Component: DatasetList, layout: "default" },
  { path: "/dataset/create", Component: DatasetCreation, layout: "default" },
  { path: "/dataset/edit/:id", Component: DatasetEdit, layout: "default" },
  {
    path: "/project/settings",
    Component: ProjectConfigCenter,
    layout: "default",
  },
  {
    path: "/saved_query/list",
    Component: SavedQueryList,
    layout: "default",
  },
  { path: "/alert/list", Component: AlertReportList, layout: "default" },
  { path: "/query_history", Component: QueryHistoryList, layout: "default" },
  { path: "/system/admin", Component: SystemAdmin, layout: "default" },
  { path: "/briefing", Component: BriefingList, layout: "default" },
  {
    path: "/briefing/:id",
    Component: BriefingDetail,
    layout: "default",
  },
];

// Redirect legacy routes to their consolidated tabbed pages.
const legacyRedirects: { path: string; to: string }[] = [
  // Top-level report entry redirects to the briefing list.
  { path: "/report", to: "/briefing" },
  // Pre-consolidation briefing URLs (daily-only) forward to /briefing.
  { path: "/briefing/daily", to: "/briefing" },
  { path: "/settings", to: "/system/admin?tab=menu" },
  { path: "/admin/users", to: "/system/admin?tab=users" },
  { path: "/admin/roles", to: "/system/admin?tab=roles" },
  { path: "/project/config", to: "/project/settings?tab=game" },
  { path: "/project/channel", to: "/project/settings?tab=channel" },
  {
    path: "/project/profit-sharing",
    to: "/project/settings?tab=profit-sharing",
  },
];

// Legacy /briefing/daily/:id URLs keep working by forwarding the id to the
// consolidated /briefing/:id detail route.
function LegacyBriefingDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/briefing/${id ?? ""}`} replace />;
}

function LoadingFallback() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

function ProtectedLayout({
  children,
  requiredRoles,
}: {
  children: React.ReactNode;
  requiredRoles?: string[];
}) {
  return (
    <ProtectedRoute requiredRoles={requiredRoles}>
      <AppLayout>
        <PageTransition>{children}</PageTransition>
      </AppLayout>
    </ProtectedRoute>
  );
}

function GlobalShortcuts() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const helpOpen = useHelpModalStore((s) => s.open);
  const toggleHelp = useHelpModalStore((s) => s.toggleHelp);
  const closeHelp = useHelpModalStore((s) => s.closeHelp);

  useShortcutWithHelp("shift+/", toggleHelp, {
    label: "打开快捷键帮助",
    category: "global",
    description: "按 Shift+? 查看所有快捷键",
  });

  useShortcutWithHelp("g q", () => navigate("/sqllab"), {
    label: "跳转到 SQL 实验室",
    category: "navigation",
    description: "按 G + Q 直接跳转到 SQL 实验室",
  });

  useShortcutWithHelp("g b", () => navigate("/dashboard/list"), {
    label: "跳转到仪表板",
    category: "navigation",
    description: "按 G + B 浏览所有仪表板",
  });

  useShortcutWithHelp("g d", () => navigate("/dataset/list"), {
    label: "跳转到数据集",
    category: "navigation",
    description: "按 G + D 管理数据集",
  });

  useShortcutWithHelp("g c", () => navigate("/chart/list"), {
    label: "跳转到图表",
    category: "navigation",
    description: "按 G + C 查看所有图表",
  });

  useShortcutWithHelp("g h", () => navigate("/"), {
    label: "跳转到首页",
    category: "navigation",
    description: "按 G + H 返回首页",
  });

  const handleCloseHelp = useCallback(() => closeHelp(), [closeHelp]);

  if (!isAuthenticated) return null;

  return (
    <KeyboardShortcutHelpModal open={helpOpen} onClose={handleCloseHelp} />
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PageTransition>
              <Login />
            </PageTransition>
          }
        />

        {routes.map(({ path, Component, layout: _layout }) => {
          const requiredRoles = routePermissions[path];
          return (
            <Route
              key={path}
              path={path}
              element={
                <ProtectedLayout requiredRoles={requiredRoles}>
                  <Component />
                </ProtectedLayout>
              }
            />
          );
        })}

        {legacyRedirects.map(({ path, to }) => (
          <Route
            key={path}
            path={path}
            element={<Navigate to={to} replace />}
          />
        ))}

        <Route
          key="legacy-briefing-detail"
          path="/briefing/daily/:id"
          element={<LegacyBriefingDetailRedirect />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GlobalShortcuts />
    </Suspense>
  );
}
