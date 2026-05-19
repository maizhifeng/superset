import { keyframes } from "@mui/material";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

export default function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          px: 2,
          py: 1.5,
          bgcolor: "background.paper",
          borderBottom: "2px solid",
          borderColor: "primary.light",
        }}
      >
        <Skeleton variant="text" width="20%" sx={{ mr: 2 }} animation="wave" />
        <Skeleton variant="text" width="30%" sx={{ mr: 2 }} animation="wave" />
        <Skeleton variant="text" width="15%" sx={{ mr: 2 }} animation="wave" />
        <Skeleton variant="text" width="15%" sx={{ mr: 2 }} animation="wave" />
        <Skeleton variant="text" width="10%" animation="wave" />
      </Box>
      {Array.from({ length: rows }).map((_, i) => (
        <Box
          key={i}
          sx={{
            display: "flex",
            px: 2,
            py: 1.5,
            borderBottom: i < rows - 1 ? "1px solid" : undefined,
            borderColor: "divider",
            bgcolor: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)",
            animation: `${fadeIn} 300ms ease-out both`,
            animationDelay: `${i * 40}ms`,
          }}
        >
          <Skeleton
            variant="text"
            width="20%"
            sx={{ mr: 2 }}
            animation="wave"
          />
          <Skeleton
            variant="text"
            width="30%"
            sx={{ mr: 2 }}
            animation="wave"
          />
          <Skeleton
            variant="text"
            width="15%"
            sx={{ mr: 2 }}
            animation="wave"
          />
          <Skeleton
            variant="text"
            width="15%"
            sx={{ mr: 2 }}
            animation="wave"
          />
          <Skeleton variant="text" width="10%" animation="wave" />
        </Box>
      ))}
    </Box>
  );
}
