import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import BarChartIcon from "@mui/icons-material/BarChart";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import FunctionsIcon from "@mui/icons-material/Functions";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StorageIcon from "@mui/icons-material/Storage";
import api from "@/api";
import { useRecentCharts } from "@/store/recentCharts";

const STEPS: { icon: React.ReactNode; title: string; description: string }[] = [
  {
    icon: <StorageIcon fontSize="small" />,
    title: "1. 选择数据集",
    description: "从顶部第一个卡片中选择要分析的数据集。",
  },
  {
    icon: <FunctionsIcon fontSize="small" />,
    title: "2. 配置分组与指标",
    description: "拖入维度与指标，Starfly 会根据数据推荐图表类型。",
  },
  {
    icon: <PlayArrowIcon fontSize="small" />,
    title: "3. 预览并保存",
    description: "Ctrl+Enter 运行预览，Ctrl+S 保存图表。",
  },
];

/**
 * Landing state for the chart editor before a dataset is chosen.
 *
 * Renders a bounded, dashed "canvas" panel with a short three-step guide,
 * secondary entry points and the recently edited charts, so the editor does not
 * read as a blank page.
 */
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
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 1.5, md: 3 },
        overflow: "auto",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 860,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          px: { xs: 2.5, md: 4.5 },
          py: { xs: 3, md: 4 },
          borderRadius: 3,
          border: "1px dashed",
          borderColor: "outline",
          bgcolor: "surface.variant",
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              mx: "auto",
              mb: 1.5,
              borderRadius: "16px",
              display: "grid",
              placeItems: "center",
              bgcolor: "primary.container",
              color: "primary.onContainer",
            }}
          >
            <BarChartIcon sx={{ fontSize: 28 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            开始构建图表
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.75, maxWidth: 420, mx: "auto" }}
          >
            选择一个数据集，配置分组与指标，即可实时预览并保存图表。
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 1.5,
          }}
        >
          {STEPS.map((step) => (
            <Box
              key={step.title}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.75,
                p: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "bg.muted",
                  color: "primary.main",
                }}
              >
                {step.icon}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {step.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {step.description}
              </Typography>
            </Box>
          ))}
        </Box>

        {items.length > 0 && (
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.75, fontWeight: 600 }}
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
              {items.slice(0, 4).map((it, i, arr) => (
                <Box
                  key={it.id}
                  onClick={() => navigate(`/explore?slice_id=${it.id}`)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1.5,
                    py: 0.9,
                    cursor: "pointer",
                    borderBottom: i < arr.length - 1 ? "1px solid" : undefined,
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
            display: "flex",
            justifyContent: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<StorageIcon />}
            onClick={() => navigate("/dataset/list")}
          >
            浏览数据集
          </Button>
          <Button
            size="small"
            variant="text"
            startIcon={<CloudQueueIcon />}
            onClick={() => navigate("/sqllab")}
          >
            打开 SQL 实验室
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
