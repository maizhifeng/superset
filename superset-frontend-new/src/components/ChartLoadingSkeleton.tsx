import { keyframes } from "@mui/material";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import useReducedMotion from "@/hooks/useReducedMotion";
import { duration } from "@/theme/tokens";

const barBounce = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50% { transform: scaleY(1); }
`;

const barHeights = [60, 85, 40, 70, 50];

/**
 * Neutral loading placeholder for a chart.
 *
 * The bars are deliberately greyscale: an earlier version tinted them with the
 * five semantic status colours, which made a loading state look like a result
 * (a red bar reads as a failure).  The caption uses ``text.secondary`` (AA on
 * paper) instead of the disabled token, which was close to invisible.
 */
export default function ChartLoadingSkeleton() {
  const reduced = useReducedMotion();

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
        width: "100%",
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
        {barHeights.map((height, i) => (
          <Box
            key={i}
            sx={{
              width: 20,
              height: `${height}%`,
              borderRadius: 0.75,
              bgcolor: "text.disabled",
              opacity: 0.35,
              transformOrigin: "bottom",
              animation: reduced
                ? "none"
                : `${barBounce} ${(duration.slow * 2 + i * duration.quick) / 1000}s ease-in-out infinite`,
              animationDelay: reduced ? "0s" : `${i * 0.1}s`,
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        加载中...
      </Typography>
    </Box>
  );
}
