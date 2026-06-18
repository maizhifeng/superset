import Box from "@mui/material/Box";
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";
import { keyframes } from "@mui/system";

interface StatusBarProps {
  tip?: { title: string; message: string } | null;
}

const scrollAnimation = keyframes`
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
`;

export default function StatusBar({ tip }: StatusBarProps) {
  const tipText = tip ? `${tip.title} — ${tip.message}` : "";

  return (
    <Box
      sx={{
        height: 28,
        display: "flex",
        alignItems: "center",
        bgcolor: "grey.100",
        borderBottom: "1px solid",
        borderColor: "divider",
        px: 0.5,
        gap: 0.5,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >

      <TipsAndUpdatesIcon
        sx={{ fontSize: 14, flexShrink: 0, color: "primary.main", opacity: 0.8 }}
      />

      <Box
        sx={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          height: "100%",
          display: "flex",
          alignItems: "center",
        }}
      >
        {tipText && (
          <Box
            sx={{
              display: "flex",
              whiteSpace: "nowrap",
              animation: `${scrollAnimation} ${Math.max(tipText.length * 0.08, 10)}s linear infinite`,
              fontSize: "0.75rem",
              color: "text.secondary",
              gap: 4,
            }}
          >
            <Box component="span">{tipText}</Box>
            <Box component="span">{tipText}</Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
