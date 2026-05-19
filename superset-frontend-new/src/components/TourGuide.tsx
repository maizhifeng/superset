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

const PIPELINE_STEP = 3;

const pipelineNodes = [
  {
    icon: <StorageIcon />,
    label: "Database",
    desc: "Connect your data source",
    color: "#1565c0",
    bg: "#e3f2fd",
  },
  {
    icon: <TableChartIcon />,
    label: "Dataset",
    desc: "Map tables & define columns",
    color: "#2e7d32",
    bg: "#e8f5e9",
  },
  {
    icon: <BarChartIcon />,
    label: "Chart",
    desc: "Pick viz type & drag fields",
    color: "#e65100",
    bg: "#fff3e0",
  },
  {
    icon: <DashboardIcon />,
    label: "Dashboard",
    desc: "Combine & share insights",
    color: "#6a1b9a",
    bg: "#f3e5f5",
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
    title: "Welcome to Starfly",
    description:
      "Your data exploration platform. Browse dashboards, build charts, and query data — all in one place.",
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
          { icon: <DashboardIcon />, label: "Dashboards", color: "#6a1b9a" },
          { icon: <BarChartIcon />, label: "Charts", color: "#e65100" },
          { icon: <CodeIcon />, label: "SQL Lab", color: "#1565c0" },
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
              bgcolor: `${item.color}10`,
              border: "1px solid",
              borderColor: `${item.color}30`,
              minWidth: 90,
            }}
          >
            <Box sx={{ color: item.color, fontSize: 24, lineHeight: 1 }}>
              {item.icon}
            </Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: item.color }}
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
    title: "Search & Navigate",
    description:
      "Press / to search anything. Use keyboard combos to jump between pages instantly.",
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
            Search dashboards, charts, datasets...
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
            { key: "G+Q", label: "SQL Lab" },
            { key: "G+B", label: "Dashboards" },
            { key: "G+D", label: "Datasets" },
            { key: "G+C", label: "Charts" },
            { key: "G+H", label: "Home" },
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
    title: "Keyboard Shortcuts",
    description:
      "Shift+? opens the full shortcut reference. Common combos to speed up your workflow.",
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
          { keys: "Ctrl+Enter", label: "Run query" },
          { keys: "Ctrl+S", label: "Save" },
          { keys: "Ctrl+Z", label: "Undo" },
          { keys: "Shift+?", label: "Shortcuts" },
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
              bgcolor: "grey.50",
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
    title: "Architecture Overview",
    description:
      "Starfly organizes your data into four layers. Each builds on the previous one — from source to insight.",
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
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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
    title: "1. Connect a Database",
    description:
      "Start here. Connect PostgreSQL, MySQL, BigQuery, or any supported database. This is the foundation all data flows from.",
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
    title: "2. Create a Dataset",
    description:
      "A dataset maps a database table inside Starfly. Pick a table and define which columns are dimensions (categories) and metrics (numbers).",
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
    title: "3. Build Charts",
    description:
      "In Explore, pick a dataset, choose a chart type, and drag in dimensions and metrics. Preview updates live as you configure.",
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
          { label: "Bar", icon: "▇", color: "#e65100" },
          { label: "Line", icon: "━", color: "#1565c0" },
          { label: "Pie", icon: "●", color: "#2e7d32" },
          { label: "Table", icon: "⊞", color: "#6a1b9a" },
          { label: "Big #", icon: "123", color: "#c62828" },
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
              bgcolor: `${t.color}10`,
              border: "1px solid",
              borderColor: `${t.color}30`,
              minWidth: 60,
            }}
          >
            <Typography
              variant="body2"
              sx={{ color: t.color, fontWeight: 700, lineHeight: 1 }}
            >
              {t.icon}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: t.color, fontWeight: 600 }}
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
    title: "4. Assemble Dashboards",
    description:
      "Combine multiple charts on a drag-and-drop grid. Add cross-filtering, compare dimensions, and share with your team.",
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
            bgcolor: "grey.50",
            border: "1px solid",
            borderColor: "divider",
            width: 200,
          }}
        >
          {[
            { c: "#e65100", s: 2 },
            { c: "#1565c0", s: 1 },
            { c: "#1565c0", s: 1 },
            { c: "#2e7d32", s: 1 },
            { c: "#6a1b9a", s: 1 },
            { c: "#2e7d32", s: 1 },
            { c: "#6a1b9a", s: 1 },
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
    title: "Bonus: SQL Lab",
    description:
      "Skip the pipeline and write raw SQL. Explore, join, and visualize results directly. Save queries or turn them into datasets.",
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
              Back
            </Button>
          ) : (
            <Button
              size="small"
              onClick={handleClose}
              sx={{ color: "text.secondary", minWidth: 64 }}
            >
              Skip
            </Button>
          )}
        </Box>
        <Button
          variant="contained"
          size="medium"
          onClick={handleNext}
          sx={{ minWidth: 80, borderRadius: 2 }}
        >
          {isLast ? "Done" : "Next"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
