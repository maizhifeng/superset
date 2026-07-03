import Box from "@mui/material/Box";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import LightMdRenderer from "@/components/LightMdRenderer";
import { blink } from "@/theme/keyframes";

export default function StreamingMessage({ text }: { text: string }) {
  return (
    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-start" }}>
      <SmartToyIcon
        sx={{ fontSize: 20, mt: 0.5, color: "primary.main", flexShrink: 0 }}
      />
      <Box
        sx={{
          maxWidth: "92%",
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          fontSize: "0.8125rem",
          lineHeight: 1.6,
          wordBreak: "break-word",
          boxShadow: "var(--mui-palette-shadow-sm)",
          overflow: "hidden",
        }}
      >
        <LightMdRenderer content={text} />
        <Box
          component="span"
          sx={{
            animation: `${blink} 1s step-end infinite`,
            color: "primary.main",
            fontWeight: 700,
          }}
        >
          ▎
        </Box>
      </Box>
    </Box>
  );
}
