import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import TableSkeleton from "@/components/TableSkeleton";
import { keyframes } from "@mui/material";

const contentFadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
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
        animation: `${contentFadeIn} 400ms cubic-bezier(0.25, 0.1, 0.15, 1) both`,
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
