import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

const EXAMPLES = [
  { label: "月度收入", query: "revenue by month" },
  { label: "头部客户", query: "top customers" },
  { label: "销售趋势", query: "sales trends" },
  { label: "用户活跃", query: "user activity" },
  { label: "预测", query: "forecast" },
];

interface SearchExamplesProps {
  onSelect: (query: string) => void;
}

export default function SearchExamples({ onSelect }: SearchExamplesProps) {
  return (
    <Box
      sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.5, px: 0.5 }}
    >
      {EXAMPLES.map((ex) => (
        <Chip
          key={ex.query}
          label={ex.label}
          size="small"
          variant="outlined"
          onClick={() => onSelect(ex.query)}
          sx={{
            fontSize: "0.75rem",
            color: "text.secondary",
            borderColor: "divider",
            "&:hover": { borderColor: "primary.main", color: "primary.main" },
          }}
        />
      ))}
    </Box>
  );
}
