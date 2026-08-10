import { keyframes } from "@mui/material";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const barBounce = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50% { transform: scaleY(1); }
`;

const loadingBarColors = [
  "primary.main",
  "warning.main",
  "info.main",
  "success.main",
  "error.main",
];

export default function ChartLoadingSkeleton() {
  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        flex: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 0.75,
          height: 80,
        }}
      >
        {loadingBarColors.map((color, i) => (
          <Box
            key={i}
            sx={{
              width: 20,
              height: `${[60, 85, 40, 70, 50][i]}%`,
              borderRadius: 0.75,
              bgcolor: color,
              opacity: 0.4,
              transformOrigin: "bottom",
              animation: `${barBounce} ${0.6 + i * 0.15}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.disabled">
        加载中...
      </Typography>
    </Box>
  );
}
