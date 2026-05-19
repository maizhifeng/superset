import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import BarChartIcon from "@mui/icons-material/BarChart";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

export default function ExploreWelcome() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        py: 6,
        px: 2,
        gap: 1.5,
      }}
    >
      <BarChartIcon
        sx={{ fontSize: 48, color: "primary.light", opacity: 0.5 }}
      />
      <Typography
        variant="h6"
        sx={{ fontWeight: 600, color: "text.secondary" }}
      >
        Start Building Your Chart
      </Typography>
      <Typography
        variant="body2"
        color="text.disabled"
        sx={{ textAlign: "center", maxWidth: 360 }}
      >
        Select a dataset from the dropdown above, then choose dimensions and
        metrics.
        {}
        Starfly will suggest a chart type based on your data.
      </Typography>
      <Box
        sx={{
          mt: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
          color: "text.disabled",
          fontSize: "0.75rem",
        }}
      >
        <Typography variant="caption">Select dataset</Typography>
        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
      </Box>
    </Box>
  );
}
