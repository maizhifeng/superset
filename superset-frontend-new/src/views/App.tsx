import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';

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
const SavedQueryList = lazy(() => import('@/pages/SavedQueryList'));
const AlertReportList = lazy(() => import('@/pages/AlertReportList'));
const QueryHistoryList = lazy(() => import('@/pages/QueryHistoryList'));

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
        <Route path="/saved_query/list" element={<ProtectedLayout><SavedQueryList /></ProtectedLayout>} />
        <Route path="/alert/list" element={<ProtectedLayout><AlertReportList /></ProtectedLayout>} />
        <Route path="/query_history" element={<ProtectedLayout><QueryHistoryList /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
