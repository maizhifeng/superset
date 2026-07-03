import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import ExploreIcon from "@mui/icons-material/Explore";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import StorageIcon from "@mui/icons-material/Storage";
import TableChartIcon from "@mui/icons-material/TableChart";
import BarChartIcon from "@mui/icons-material/BarChart";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CodeIcon from "@mui/icons-material/Code";
import { useDismissible } from "@/hooks/useDismissible";

const paletteVar = (key: string) => `var(--mui-palette-${key}-main)`;
const paletteTint = (key: string, pct: number) =>
  `color-mix(in srgb, var(--mui-palette-${key}-main) ${pct}%, transparent)`;

const PIPELINE_STEP = 3;

const pipelineNodes = [
  {
    icon: <StorageIcon />,
    label: "数据库",
    desc: "连接数据源",
    color: "info.main",
    bg: "status.infoBg",
  },
  {
    icon: <TableChartIcon />,
    label: "数据集",
    desc: "映射表与定义列",
    color: "success.main",
    bg: "status.successBg",
  },
  {
    icon: <BarChartIcon />,
    label: "图表",
    desc: "选择可视化类型与拖拽字段",
    color: "warning.main",
    bg: "status.warningBg",
  },
  {
    icon: <DashboardIcon />,
    label: "仪表板",
    desc: "组合与分享洞察",
    color: "secondary.main",
    bg: "secondary.container",
  },
];

interface StepDef {
  icon: React.ReactNode;
  title: string;
  description: string;
  graphic: React.ReactNode;
}

const STEPS: StepDef[] = [
  {
    icon: <ExploreIcon sx={{ fontSize: 48 }} />,
    title: "欢迎使用 Starfly",
    description:
      "您的数据探索平台。浏览仪表板、构建图表、查询数据——一站式完成。",
    graphic: (
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          justifyContent: "center",
          flexWrap: "wrap",
          mt: 1,
        }}
      >
        {[
          { icon: <DashboardIcon />, label: "仪表板", key: "secondary" },
          { icon: <BarChartIcon />, label: "图表", key: "warning" },
          { icon: <CodeIcon />, label: "SQL 实验室", key: "info" },
        ].map((item) => (
          <Box
            key={item.label}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
              px: 2,
              py: 1.5,
              borderRadius: 2,
              bgcolor: paletteTint(item.key, 6),
              border: "1px solid",
              borderColor: paletteTint(item.key, 19),
              minWidth: 90,
            }}
          >
            <Box sx={{ color: paletteVar(item.key), fontSize: 24, lineHeight: 1 }}>
              {item.icon}
            </Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: paletteVar(item.key) }}
            >
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
    ),
  },
  {
    icon: <SearchIcon sx={{ fontSize: 48 }} />,
    title: "搜索与导航",
    description:
      "按 / 搜索任何内容。使用快捷键在页面间快速跳转。",
    graphic: (
      <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: "grey.100",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <SearchIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <Typography
            variant="body2"
            color="text.disabled"
            sx={{ fontStyle: "italic" }}
          >
            搜索仪表板、图表、数据集...
          </Typography>
          <Chip label="/" size="small" sx={{ fontWeight: 700 }} />
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 0.5,
            flexWrap: "wrap",
          }}
        >
          {[
            { key: "G+Q", label: "SQL 实验室" },
            { key: "G+B", label: "仪表板" },
            { key: "G+D", label: "数据集" },
            { key: "G+C", label: "图表" },
            { key: "G+H", label: "首页" },
          ].map((s) => (
            <Chip
              key={s.key}
              label={
                <Box sx={{ display: "flex", gap: 0.25, alignItems: "center" }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, fontFamily: "monospace" }}
                  >
                    {s.key}
                  </Typography>
                  <Typography variant="caption" sx={{ ml: 0.25 }}>
                    {s.label}
                  </Typography>
                </Box>
              }
              size="small"
              variant="outlined"
              color="primary"
            />
          ))}
        </Box>
      </Box>
    ),
  },
  {
    icon: <KeyboardIcon sx={{ fontSize: 48 }} />,
    title: "快捷键",
    description:
      "Shift+? 打开完整快捷键参考。常用组合键加速工作流。",
    graphic: (
      <Box
        sx={{
          mt: 1,
          display: "flex",
          justifyContent: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        {[
          { keys: "Ctrl+Enter", label: "运行查询" },
          { keys: "Ctrl+S", label: "保存" },
          { keys: "Ctrl+Z", label: "撤销" },
          { keys: "Shift+?", label: "快捷键" },
        ].map((s) => (
          <Box
            key={s.keys}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.25,
              px: 1.25,
              py: 1,
              borderRadius: 1.5,
              bgcolor: "bg.muted",
              border: "1px solid",
              borderColor: "divider",
              minWidth: 80,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "primary.main",
              }}
            >
              {s.keys}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
    ),
  },
  {
    icon: <AccountTreeIcon sx={{ fontSize: 48 }} />,
    title: "架构概览",
    description:
      "Starfly 将您的数据组织为四层。从数据源到洞察，层层递进。",
    graphic: (
      <Box
        sx={{
          mt: 2,
          mx: "auto",
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {pipelineNodes.flatMap((node, i) => {
          const elements = [
            <Box
              key={node.label}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.5,
                px: 1.5,
                py: 1.25,
                borderRadius: 2,
                bgcolor: node.bg,
                border: "1px solid",
                borderColor: node.color,
                minWidth: 110,
                boxShadow: "var(--mui-palette-shadow-md)",
              }}
            >
              <Box sx={{ color: node.color, fontSize: 24, lineHeight: 1 }}>
                {node.icon}
              </Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: node.color,
                  fontSize: "0.75rem",
                }}
              >
                {node.label}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: node.color,
                  opacity: 0.7,
                  fontSize: "0.75rem",
                  textAlign: "center",
                }}
              >
                {node.desc}
              </Typography>
            </Box>,
          ];
          if (i < pipelineNodes.length - 1) {
            elements.push(
              <Box
                key={`arrow-${i}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  px: { xs: 0, sm: 0.25 },
                  py: { xs: 0.25, sm: 0 },
                  color: "text.disabled",
                }}
              >
                <ArrowForwardIcon
                  sx={{
                    fontSize: 18,
                    transform: { xs: "rotate(90deg)", sm: "none" },
                  }}
                />
              </Box>,
            );
          }
          return elements;
        })}
      </Box>
    ),
  },
  {
    icon: <StorageIcon sx={{ fontSize: 48 }} />,
    title: "1. 连接数据库",
    description:
      "从这里开始。连接 PostgreSQL、MySQL、BigQuery 等支持的数据库。这是所有数据的源头。",
    graphic: (
      <Box
        sx={{
          mt: 1,
          display: "flex",
          justifyContent: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        {[
          "PostgreSQL",
          "MySQL",
          "BigQuery",
          "Snowflake",
          "SQLite",
          "DRUID",
        ].map((db) => (
          <Chip
            key={db}
            label={db}
            variant="outlined"
            color="primary"
            size="small"
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>
    ),
  },
  {
    icon: <TableChartIcon sx={{ fontSize: 48 }} />,
    title: "2. 创建数据集",
    description:
      "数据集将数据库表映射到 Starfly。选择表并定义哪些列是维度（类别）和度量（数值）。",
    graphic: (
      <Box
        sx={{
          mt: 1,
          display: "flex",
          justifyContent: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Box
            sx={{
              display: "inline-flex",
              flexDirection: "column",
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                bgcolor: "primary.main",
                color: "common.white",
                fontSize: "0.75rem",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              orders
            </Box>
            {[
              { name: "id", type: "INT" },
              { name: "amount", type: "FLOAT" },
              { name: "created_at", type: "DATE" },
              { name: "user_id", type: "INT" },
            ].map((col) => (
              <Box
                key={col.name}
                sx={{
                  display: "flex",
                  gap: 1.5,
                  px: 1.5,
                  py: 0.25,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  fontSize: "0.75rem",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, fontFamily: "monospace" }}
                >
                  {col.name}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {col.type}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    ),
  },
  {
    icon: <BarChartIcon sx={{ fontSize: 48 }} />,
    title: "3. 构建图表",
    description:
      "在探索中，选择数据集、选择图表类型，拖入维度和度量。配置时预览实时更新。",
    graphic: (
      <Box
        sx={{
          mt: 1,
          display: "flex",
          justifyContent: "center",
          gap: 0.75,
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "柱状", icon: "▇", key: "warning" },
          { label: "折线", icon: "━", key: "info" },
          { label: "饼图", icon: "●", key: "success" },
          { label: "表格", icon: "⊞", key: "secondary" },
          { label: "大数字", icon: "123", key: "error" },
        ].map((t) => (
          <Box
            key={t.label}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.25,
              px: 1.25,
              py: 1,
              borderRadius: 1.5,
              bgcolor: paletteTint(t.key, 6),
              border: "1px solid",
              borderColor: paletteTint(t.key, 19),
              minWidth: 60,
            }}
          >
            <Typography
              variant="body2"
              sx={{ color: paletteVar(t.key), fontWeight: 700, lineHeight: 1 }}
            >
              {t.icon}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: paletteVar(t.key), fontWeight: 600 }}
            >
              {t.label}
            </Typography>
          </Box>
        ))}
      </Box>
    ),
  },
  {
    icon: <DashboardIcon sx={{ fontSize: 48 }} />,
    title: "4. 组装仪表板",
    description:
      "在拖拽网格上组合多个图表。添加交叉筛选、对比维度，并与团队分享。",
    graphic: (
      <Box
        sx={{
          mt: 1,
          display: "flex",
          justifyContent: "center",
          gap: 0.5,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0.5,
            p: 1,
            borderRadius: 1.5,
            bgcolor: "bg.muted",
            border: "1px solid",
            borderColor: "divider",
            width: 200,
          }}
        >
          {[
            { c: "warning.main", s: 2 },
            { c: "info.main", s: 1 },
            { c: "info.main", s: 1 },
            { c: "success.main", s: 1 },
            { c: "secondary.main", s: 1 },
            { c: "success.main", s: 1 },
            { c: "secondary.main", s: 1 },
          ].map((cell, i) => (
            <Box
              key={i}
              sx={{
                gridColumn: `span ${cell.s}`,
                height: 20,
                borderRadius: 0.75,
                bgcolor: cell.c,
                opacity: 0.35,
              }}
            />
          ))}
        </Box>
      </Box>
    ),
  },
  {
    icon: <CodeIcon sx={{ fontSize: 48 }} />,
    title: "Bonus: SQL 实验室",
    description:
      "跳过管线，直接编写 SQL。直接探索、关联和可视化结果。保存查询或转为数据集。",
    graphic: (
      <Box
        sx={{
          mt: 1,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Box
          sx={{
            display: "inline-flex",
            flexDirection: "column",
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: "divider",
            overflow: "hidden",
            bgcolor: "#1e1e1e",
            minWidth: 200,
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              bgcolor: "#2d2d2d",
            }}
          >
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <Box
                key={c}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: c,
                }}
              />
            ))}
          </Box>
          <Box sx={{ px: 1.5, py: 1, textAlign: "left" }}>
            {[
              { text: "SELECT", color: "#c586c0" },
              { text: "  date,", color: "#9cdcfe" },
              { text: "  SUM(amount) AS total", color: "#9cdcfe" },
              { text: "FROM orders", color: "#569cd6" },
              { text: "WHERE date > '2024-01-01'", color: "#ce9178" },
              { text: "GROUP BY date", color: "#569cd6" },
            ].map((line, i) => (
              <Typography
                key={i}
                variant="caption"
                sx={{
                  display: "block",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  lineHeight: 1.6,
                  color: line.color,
                }}
              >
                {line.text}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
    ),
  },
];

export default function TourGuide() {
  const [dismissed, dismiss] = useDismissible("tour_v2");
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    if (!dismissed) setStep(0);
  }, [dismissed]);

  if (dismissed) return null;

  const handleClose = () => dismiss();
  const handleNext = () => (isLast ? dismiss() : setStep((s) => s + 1));
  const handlePrev = () => setStep((s) => Math.max(0, s - 1));

  return (
    <Dialog open={!dismissed} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle component="div" sx={{ textAlign: "center", pt: 4, pb: 0 }}>
        <Box
          sx={{
            color: step >= PIPELINE_STEP ? "secondary.main" : "primary.main",
            mb: 1.5,
          }}
        >
          {current.icon}
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {current.title}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ textAlign: "center", px: 4, pb: 1 }}>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{
            maxWidth: 480,
            mx: "auto",
            lineHeight: 1.6,
            minHeight: 48,
          }}
        >
          {current.description}
        </Typography>
        {current.graphic}
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ mt: 2.5, justifyContent: "center" }}
        >
          {STEPS.map((_, i) => (
            <Box
              key={i}
              sx={{
                width: i === step ? 24 : 8,
                height: 8,
                borderRadius: 4,
                bgcolor: i === step ? "primary.main" : "grey.300",
                transition: "all 250ms",
              }}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, justifyContent: "space-between" }}>
        <Box>
          {step > 0 ? (
            <Button
              size="small"
              onClick={handlePrev}
              sx={{ color: "text.secondary", minWidth: 64 }}
            >
              返回
            </Button>
          ) : (
            <Button
              size="small"
              onClick={handleClose}
              sx={{ color: "text.secondary", minWidth: 64 }}
            >
              跳过
            </Button>
          )}
        </Box>
        <Button
          variant="contained"
          size="medium"
          onClick={handleNext}
          sx={{ minWidth: 80, borderRadius: 2 }}
        >
          {isLast ? "完成" : "下一步"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
