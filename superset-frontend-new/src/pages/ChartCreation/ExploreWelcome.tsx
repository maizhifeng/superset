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
        开始构建图表
      </Typography>
      <Typography
        variant="body2"
        color="text.disabled"
        sx={{ textAlign: "center", maxWidth: 360 }}
      >
        从上方下拉列表选择数据集，然后选择维度和指标。
        {}
        Starfly 会根据您的数据建议图表类型。
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
        <Typography variant="caption">选择数据集</Typography>
        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
      </Box>
    </Box>
  );
}
