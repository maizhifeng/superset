import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import BarChartIcon from "@mui/icons-material/BarChart";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import api from "@/api";
import { useRecentCharts } from "@/store/recentCharts";

export default function ExploreWelcome() {
  const navigate = useNavigate();
  const recentItems = useRecentCharts((s) => s.items);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (recentItems.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      recentItems.map((item) =>
        api
          .get<{ result: { slice_name?: string } }>(`/chart/${item.id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id: item.id,
            title: res.data.result?.slice_name ?? `图表 ${item.id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) =>
        setItems(res.filter((x): x is { id: number; title: string } => !!x)),
      )
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [recentItems]);

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

      {items.length > 0 && (
        <Box
          sx={{
            mt: 2,
            width: "100%",
            maxWidth: 380,
            textAlign: "left",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.5, fontWeight: 600 }}
          >
            最近编辑的图表
          </Typography>
          <Box
            sx={{
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            {items.map((it, i) => (
              <Box
                key={it.id}
                onClick={() => navigate(`/explore?slice_id=${it.id}`)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  cursor: "pointer",
                  borderBottom:
                    i < items.length - 1 ? "1px solid" : undefined,
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <BarChartIcon sx={{ fontSize: 15, color: "primary.main" }} />
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: "0.8125rem",
                  }}
                >
                  {it.title}
                </Typography>
                <ChevronRightIcon
                  sx={{ fontSize: 16, color: "text.disabled" }}
                />
              </Box>
            ))}
          </Box>
        </Box>
      )}

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
