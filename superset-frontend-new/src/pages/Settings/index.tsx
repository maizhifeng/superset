import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PageHeader from "@/components/PageHeader";
import { useMenuSettings } from "@/store/menuSettings";

export default function Settings() {
  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);
  const toggle = useMenuSettings((s) => s.toggle);
  const moveItem = useMenuSettings((s) => s.moveItem);

  return (
    <Box sx={{ p: 4 }}>
      <PageHeader title="设置" subtitle="导航菜单管理" />

      <Paper
        sx={{
          borderRadius: 2,
          boxShadow: "var(--mui-palette-shadow-card)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 1fr 120px 72px",
            alignItems: "center",
            px: 2.5,
            py: 1.25,
            bgcolor: "action.hover",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            标签
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            路径
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textAlign: "center" }}>
            排序
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textAlign: "center" }}>
            可见
          </Typography>
        </Box>

        {items.map((item, i) => (
          <Box
            key={item.id}
            sx={{
              display: "grid",
              gridTemplateColumns: "48px 1fr 1fr 120px 72px",
              alignItems: "center",
              px: 2.5,
              py: 1.25,
              borderBottom: i < items.length - 1 ? "1px solid" : undefined,
              borderColor: "divider",
              transition: "background-color 150ms",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", color: "text.disabled" }}>
              <DragIndicatorIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {item.label}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: "0.8125rem",
              }}
            >
              {item.path}
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 0.25 }}>
              <Tooltip title="上移">
                <span>
                  <IconButton
                    size="small"
                    disabled={i === 0}
                    onClick={() => moveItem(item.id, "up")}
                    sx={{
                      opacity: i === 0 ? 0.3 : 1,
                      "&.Mui-disabled": { opacity: 0.3 },
                    }}
                  >
                    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="下移">
                <span>
                  <IconButton
                    size="small"
                    disabled={i === items.length - 1}
                    onClick={() => moveItem(item.id, "down")}
                    sx={{
                      opacity: i === items.length - 1 ? 0.3 : 1,
                      "&.Mui-disabled": { opacity: 0.3 },
                    }}
                  >
                    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Switch
                checked={enabled[item.id] ?? true}
                onChange={() => toggle(item.id)}
                size="small"
              />
            </Box>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
