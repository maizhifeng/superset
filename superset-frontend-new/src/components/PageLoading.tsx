import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";

export default function PageLoading() {
  return (
    <Box sx={{ p: 3, maxWidth: "lg", mx: "auto" }}>
      <Skeleton
        variant="text"
        width="40%"
        height={32}
        sx={{ mb: 2 }}
        animation="wave"
      />
      <Skeleton
        variant="text"
        width="60%"
        height={20}
        sx={{ mb: 3 }}
        animation="wave"
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 2,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              borderRadius: 2,
              p: 3,
              boxShadow:
                "var(--mui-palette-shadow-card)",
            }}
          >
            <Skeleton
              variant="rounded"
              width={44}
              height={44}
              sx={{ mb: 1.5 }}
              animation="wave"
            />
            <Skeleton
              variant="text"
              width="60%"
              sx={{ mb: 0.5 }}
              animation="wave"
            />
            <Skeleton variant="text" width="40%" animation="wave" />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
