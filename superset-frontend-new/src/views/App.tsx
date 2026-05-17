import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import KeyboardShortcutHelpModal from '@/components/KeyboardShortcutHelpModal';
import { useShortcutWithHelp } from '@/hooks/useShortcut';
import { useAuthStore } from '@/store/authStore';

const Login = lazy(() => import('@/pages/Login'));
const Home = lazy(() => import('@/pages/Home'));
const ChartList = lazy(() => import('@/pages/ChartList'));
const ChartCreation = lazy(() => import('@/pages/ChartCreation'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const DashboardList = lazy(() => import('@/pages/DashboardList'));
const SqlLab = lazy(() => import('@/pages/SqlLab'));
const DatabaseList = lazy(() => import('@/pages/DatabaseList'));
const DatasetList = lazy(() => import('@/pages/DatasetList'));
const DatasetCreation = lazy(() => import('@/pages/DatasetCreation'));
const DatasetEdit = lazy(() => import('@/pages/DatasetEdit'));
const SavedQueryList = lazy(() => import('@/pages/SavedQueryList'));
const AlertReportList = lazy(() => import('@/pages/AlertReportList'));
const QueryHistoryList = lazy(() => import('@/pages/QueryHistoryList'));
const Settings = lazy(() => import('@/pages/Settings'));

function LoadingFallback() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
    >
      <CircularProgress />
    </Box>
  );
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function GlobalShortcuts() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [helpOpen, setHelpOpen] = useState(false);
  if (!isAuthenticated) return null;

  useShortcutWithHelp(
    'shift+/',
    () => setHelpOpen(prev => !prev),
    { label: 'Open Keyboard Shortcuts Help', category: 'global', description: 'Press Shift+? to view all keyboard shortcuts at a glance.' },
  );

  useShortcutWithHelp(
    'g q',
    () => navigate('/sqllab'),
    { label: 'Navigate to SQL Lab', category: 'navigation', description: 'Press G then Q to jump directly to SQL Lab.' },
  );

  useShortcutWithHelp(
    'g b',
    () => navigate('/dashboard/list'),
    { label: 'Navigate to Dashboards', category: 'navigation', description: 'Press G then B to browse all dashboards.' },
  );

  useShortcutWithHelp(
    'g d',
    () => navigate('/dataset/list'),
    { label: 'Navigate to Datasets', category: 'navigation', description: 'Press G then D to manage your datasets.' },
  );

  useShortcutWithHelp(
    'g c',
    () => navigate('/chart/list'),
    { label: 'Navigate to Charts', category: 'navigation', description: 'Press G then C to see all your charts.' },
  );

  useShortcutWithHelp(
    'g h',
    () => navigate('/'),
    { label: 'Navigate to Home', category: 'navigation', description: 'Press G then H to return to the home page.' },
  );

  const handleCloseHelp = useCallback(() => setHelpOpen(false), []);

  return (
    <KeyboardShortcutHelpModal open={helpOpen} onClose={handleCloseHelp} />
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedLayout><Home /></ProtectedLayout>} />
        <Route path="/chart/list" element={<ProtectedLayout><ChartList /></ProtectedLayout>} />
        <Route path="/explore" element={<ProtectedLayout><ChartCreation /></ProtectedLayout>} />
        <Route path="/explore/*" element={<ProtectedLayout><ChartCreation /></ProtectedLayout>} />
        <Route path="/dashboard/list" element={<ProtectedLayout><DashboardList /></ProtectedLayout>} />
        <Route path="/dashboard/:id" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/sqllab" element={<ProtectedLayout><SqlLab /></ProtectedLayout>} />
        <Route path="/database/list" element={<ProtectedLayout><DatabaseList /></ProtectedLayout>} />
        <Route path="/dataset/list" element={<ProtectedLayout><DatasetList /></ProtectedLayout>} />
        <Route path="/dataset/create" element={<ProtectedLayout><DatasetCreation /></ProtectedLayout>} />
        <Route path="/dataset/edit/:id" element={<ProtectedLayout><DatasetEdit /></ProtectedLayout>} />
        <Route path="/saved_query/list" element={<ProtectedLayout><SavedQueryList /></ProtectedLayout>} />
        <Route path="/alert/list" element={<ProtectedLayout><AlertReportList /></ProtectedLayout>} />
        <Route path="/query_history" element={<ProtectedLayout><QueryHistoryList /></ProtectedLayout>} />
        <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GlobalShortcuts />
    </Suspense>
  );
}
