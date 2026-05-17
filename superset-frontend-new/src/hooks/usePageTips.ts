import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export interface PageTip {
  id: string;
  title: string;
  message: string;
  icon?: string;
}

const PAGE_TIPS: Record<string, PageTip> = {
  home: {
    id: 'home',
    title: 'Home',
    message: 'Browse recent dashboards and charts from here.',
  },
  dashboard_list: {
    id: 'dashboard_list',
    title: 'Dashboards',
    message: 'Press / to quickly search, or click + to create a new dashboard.',
  },
  chart_list: {
    id: 'chart_list',
    title: 'Charts',
    message: 'Browse and manage your saved charts. Press / to search.',
  },
  explore: {
    id: 'explore',
    title: 'Explore',
    message: 'Build and preview charts. Drag dimensions and metrics from the left panel.',
  },
  sqllab: {
    id: 'sqllab',
    title: 'SQL Lab',
    message: 'Write SQL queries and visualize results. Ctrl+Enter to run, Ctrl+Shift+F to format.',
  },
  dataset_list: {
    id: 'dataset_list',
    title: 'Datasets',
    message: 'Manage your datasets and their column-level metadata.',
  },
  database_list: {
    id: 'database_list',
    title: 'Databases',
    message: 'Connect to new databases or manage existing connections.',
  },
  dashboard: {
    id: 'dashboard',
    title: 'Dashboard',
    message: 'Use the + button in the bottom-right corner to filter, refresh, and jump between charts.',
  },
  saved_query_list: {
    id: 'saved_query_list',
    title: 'Saved Queries',
    message: 'Your saved SQL queries are listed here for quick reuse.',
  },
  alert_list: {
    id: 'alert_list',
    title: 'Alerts & Reports',
    message: 'Set up alerts and scheduled reports for your data.',
  },
  query_history: {
    id: 'query_history',
    title: 'Query History',
    message: 'Review past SQL queries executed in SQL Lab.',
  },
};

function matchTip(pathname: string): PageTip | null {
  const p = pathname.replace(/\/+$/, '');
  if (p === '/' || p === '') return PAGE_TIPS.home;

  for (const [key, tip] of Object.entries(PAGE_TIPS)) {
    if (key === 'home') continue;
    const pattern = key === 'dashboard'
      ? '/dashboard/'
      : key === 'explore'
        ? '/explore'
        : `/${key.replace(/_/g, '/')}`;
    if (p === pattern || p.startsWith(pattern + '/')) return tip;
  }

  if (p.startsWith('/dashboard/')) return PAGE_TIPS.dashboard;
  if (p.startsWith('/explore')) return PAGE_TIPS.explore;
  if (p.startsWith('/sqllab')) return PAGE_TIPS.sqllab;

  return null;
}

export function usePageTip(): PageTip | null {
  const { pathname } = useLocation();
  return useMemo(() => matchTip(pathname), [pathname]);
}
