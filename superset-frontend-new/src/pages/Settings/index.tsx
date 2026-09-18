import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import type { ReactNode } from "react";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import DensitySmallIcon from "@mui/icons-material/DensitySmall";
import DensityMediumIcon from "@mui/icons-material/DensityMedium";
import DensityLargeIcon from "@mui/icons-material/DensityLarge";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import PageHeader from "@/components/PageHeader";
import { useMenuSettings } from "@/store/menuSettings";
import { useHelpModalStore } from "@/store/helpModal";
import { useUiPreferences, type GridDensity } from "@/store/uiPreferences";
import { useNotificationStore } from "@/store/notificationStore";
import CodeIcon from "@mui/icons-material/Code";

const DENSITY_OPTIONS: {
  value: GridDensity;
  label: string;
  icon: ReactNode;
}[] = [
  {
    value: "compact",
    label: "紧凑",
    icon: <DensitySmallIcon sx={{ fontSize: 18 }} />,
  },
  {
    value: "standard",
    label: "标准",
    icon: <DensityMediumIcon sx={{ fontSize: 18 }} />,
  },
  {
    value: "comfortable",
    label: "舒适",
    icon: <DensityLargeIcon sx={{ fontSize: 18 }} />,
  },
];

export default function Settings() {
  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);
  const toggle = useMenuSettings((s) => s.toggle);
  const moveItem = useMenuSettings((s) => s.moveItem);
  const reset = useMenuSettings((s) => s.reset);
  const saveSettings = useMenuSettings((s) => s.saveSettings);
  const fetchSettings = useMenuSettings((s) => s.fetchSettings);
  const gridDensity = useUiPreferences((s) => s.gridDensity);
  const setGridDensity = useUiPreferences((s) => s.setGridDensity);
  const openHelp = useHelpModalStore((s) => s.openHelp);
  const notify = useNotificationStore((s) => s.notify);

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ items, enabled }, null, 2),
      );
      notify({ severity: "success", message: "已复制导航配置 (JSON)" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const persistOrRevert = async () => {
    try {
      await saveSettings();
    } catch {
      notify({ severity: "error", message: "保存失败，已恢复服务器配置" });
      await fetchSettings();
    }
  };

  const handleToggle = (id: string) => {
    toggle(id);
    void persistOrRevert();
  };

  const handleMoveItem = (id: string, direction: "up" | "down") => {
    moveItem(id, direction);
    void persistOrRevert();
  };

  const handleReset = () => {
    reset();
    void persistOrRevert();
  };

  return (
    <Box sx={{ p: 4 }}>
      <PageHeader
        title="设置"
        subtitle="导航与路由管理"
        actions={
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CodeIcon />}
              onClick={() => void handleCopyConfig()}
              sx={{ textTransform: "none" }}
            >
              复制配置
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
              sx={{ textTransform: "none" }}
            >
              恢复默认菜单
            </Button>
          </Box>
        }
      />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        开关同时控制侧边导航与路由访问：关闭后所有用户都无法访问对应页面，直接输入
        URL 也会被拦截。
      </Typography>

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
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            标签
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            路径
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, textAlign: "center" }}
          >
            排序
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, textAlign: "center" }}
          >
            启用
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
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                color: "text.disabled",
              }}
            >
              <DragIndicatorIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {item.label}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
                    onClick={() => handleMoveItem(item.id, "up")}
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
                    onClick={() => handleMoveItem(item.id, "down")}
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
                onChange={() => handleToggle(item.id)}
                size="small"
              />
            </Box>
          </Box>
        ))}
      </Paper>

      <Paper
        sx={{
          mt: 3,
          borderRadius: 2,
          boxShadow: "var(--mui-palette-shadow-card)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2.5,
            py: 1.75,
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              表格密度
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.25 }}
            >
              控制各列表页数据表格的行高，紧凑可查看更多行。
            </Typography>
          </Box>
          <ToggleButtonGroup
            color="primary"
            exclusive
            size="small"
            value={gridDensity}
            onChange={(_, value) => {
              if (value) setGridDensity(value as GridDensity);
            }}
            aria-label="表格密度"
          >
            {DENSITY_OPTIONS.map((opt) => (
              <ToggleButton
                key={opt.value}
                value={opt.value}
                sx={{ textTransform: "none", gap: 0.5 }}
              >
                {opt.icon}
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Paper>

      <Paper
        sx={{
          mt: 3,
          borderRadius: 2,
          boxShadow: "var(--mui-palette-shadow-card)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2.5,
            py: 1.75,
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              快捷键与帮助
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.25 }}
            >
              查看全局与 SQL 实验室的键盘快捷键，快速完成常用操作。
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<KeyboardIcon sx={{ fontSize: 16 }} />}
            onClick={openHelp}
          >
            查看快捷键
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
