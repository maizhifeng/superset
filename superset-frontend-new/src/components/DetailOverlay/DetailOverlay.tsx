import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import CloseIcon from "@mui/icons-material/Close";
import OverlayContent from "@/components/DetailOverlay/OverlayContent";

interface DetailOverlayProps {
  open: boolean;
  type: string;
  id?: number | string;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  dashboard: "仪表板",
  chart: "图表",
  dataset: "数据集",
  saved_query: "已保存查询",
  sqllab: "SQL 实验室",
  settings: "设置",
};

export default function DetailOverlay({
  open,
  type,
  id,
  onClose,
}: DetailOverlayProps) {
  const title = id
    ? `${typeLabels[type] || type} 详情`
    : typeLabels[type] || type;

  return (
    <Drawer
      variant="temporary"
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: false }}
      slotProps={{
        paper: {
          sx: {
            width: "100vw",
            height: "100vh",
            top: 0,
            bgcolor: "background.default",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 2,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            minHeight: 48,
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: 600, flex: 1 }}>
            {title}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto" }}>
          <OverlayContent
            type={type as Parameters<typeof OverlayContent>[0]["type"]}
            id={id}
          />
        </Box>
      </Box>
    </Drawer>
  );
}
