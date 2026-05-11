// ============================================================
// 路由配置 — 懒加载、ProtectedRoute 鉴权包裹策略
// ============================================================
// 所有页面（除 /login 外）均通过 ProtectedRoute 和 Layout 包裹。
// MetricList 使用 React.lazy 懒加载以减小首屏体积。
// ============================================================
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { DrawerStackProvider } from './contexts/DrawerStackContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardList from './pages/DashboardList';
import DashboardView from './pages/DashboardView';
import Datasets from './pages/Datasets';
import DBConfig from './pages/DBConfig';
import CohortAnalysis from './pages/CohortAnalysis';
import SystemStatus from './pages/SystemStatus';

const MetricList = React.lazy(() => import('./pages/MetricList'));

function App() {
  return (
    <ErrorBoundary showDetails={typeof localStorage !== 'undefined' && localStorage.getItem('debug_errors') === 'true'}>
      <ToastProvider>
        <DrawerStackProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Navigate to="/dashboards" replace />} />
            <Route path="/dashboards" element={<ProtectedRoute><Layout><DashboardList /></Layout></ProtectedRoute>} />
            <Route path="/dashboards/:id" element={<ProtectedRoute><Layout><DashboardView /></Layout></ProtectedRoute>} />
            <Route path="/metrics" element={<ProtectedRoute><Layout><Suspense fallback={null}><MetricList /></Suspense></Layout></ProtectedRoute>} />
            <Route path="/datasets" element={<ProtectedRoute><Layout><Datasets /></Layout></ProtectedRoute>} />
            <Route path="/db-config" element={<ProtectedRoute><Layout><DBConfig /></Layout></ProtectedRoute>} />
            <Route path="/cohort" element={<ProtectedRoute><Layout><CohortAnalysis /></Layout></ProtectedRoute>} />
            <Route path="/system" element={<ProtectedRoute><Layout><SystemStatus /></Layout></ProtectedRoute>} />
          </Routes>
        </DrawerStackProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;

{/* hot-reload-test: 06:35:33 */}