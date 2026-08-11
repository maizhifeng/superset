import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface ThinkingBlockProps {
  text: string;
  done?: boolean;
}

export default function ThinkingBlock({ text, done }: ThinkingBlockProps) {
  return (
    <Box
      component="details"
      open={!done}
      sx={{
        my: 1,
        bgcolor: "grey.50",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Box
        component="summary"
        sx={{
          fontWeight: 600,
          color: done ? "success.main" : "text.secondary",
          fontSize: "0.75rem",
          py: 0.75,
          px: 1.5,
          cursor: "pointer",
        }}
      >
        {done ? "💡 思考完成" : "🤔 思考中…"}
      </Box>
      <Box sx={{ px: 1.5, pb: 1.5, maxHeight: 160, overflow: "auto" }}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {text}
        </Typography>
      </Box>
    </Box>
  );
}
