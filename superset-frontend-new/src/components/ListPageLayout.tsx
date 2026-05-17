import { type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import TableSkeleton from '@/components/TableSkeleton';

interface ListPageLayoutProps {
  loading: boolean;
  error: string | null;
  hasData: boolean;
  skeleton?: ReactNode;
  errorAlert?: ReactNode;
  emptyState: ReactNode;
  children: ReactNode;
}

export default function ListPageLayout({
  loading, error, hasData,
  skeleton, errorAlert, emptyState, children,
}: ListPageLayoutProps) {
  if (loading && !hasData) {
    return (
      <Box sx={{ p: 3, pt: 2 }}>
        {skeleton ?? <Box sx={{ mt: 2 }}><TableSkeleton /></Box>}
      </Box>
    );
  }

  if (error && !hasData) {
    return (
      <Box sx={{ p: 3, pt: 2 }}>
        {errorAlert ?? <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, pt: 2 }}>
      {!hasData && !loading ? emptyState : children}
    </Box>
  );
}
