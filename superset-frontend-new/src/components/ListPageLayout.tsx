import { type ReactNode } from "react";
import { keyframes } from "@mui/material";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import TableSkeleton from "@/components/TableSkeleton";

const contentFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

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
  loading,
  error,
  hasData,
  skeleton,
  errorAlert,
  emptyState,
  children,
}: ListPageLayoutProps) {
  if (loading && !hasData) {
    return (
      <Box sx={{ p: 3, pt: 2 }}>
        {skeleton ?? (
          <Box sx={{ mt: 2 }}>
            <TableSkeleton />
          </Box>
        )}
      </Box>
    );
  }

  if (error && !hasData) {
    return (
      <Box sx={{ p: 3, pt: 2 }}>
        {errorAlert ?? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        p: 3,
        pt: 2,
        animation: `${contentFadeIn} 350ms ease-out both`,
      }}
    >
      {!hasData && !loading ? (
        emptyState
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
}
