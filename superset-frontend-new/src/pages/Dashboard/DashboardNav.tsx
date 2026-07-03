import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import BarChartIcon from "@mui/icons-material/BarChart";
import SearchOffIcon from "@mui/icons-material/SearchOff";

interface DashboardNavProps {
  open: boolean;
  items: { id: number; name: string }[];
  onClose: () => void;
}

export default function DashboardNav({
  open,
  items,
  onClose,
}: DashboardNavProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            maxHeight: 500,
            borderRadius: 2,
            boxShadow:
              "var(--mui-palette-shadow-modal)",
            "& .MuiBackdrop-root": {
              backgroundColor: "var(--mui-palette-shadow-backdrop)",
              backdropFilter: "blur(2px)",
            },
          },
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <List>
          {items.map((item) => (
            <ListItem key={item.id} disablePadding>
              <ListItemButton
                onClick={() => {
                  onClose();
                  const el = document.querySelector(
                    `[data-chart-index="${item.id}"]`,
                  );
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                sx={{ py: 2.5, px: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <BarChartIcon
                    sx={{ fontSize: 20, color: "text.secondary" }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={item.name}
                  slotProps={{ primary: { sx: { fontSize: "0.875rem" } } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
          {items.length === 0 && (
            <ListItem
              dense
              sx={{
                justifyContent: "center",
                flexDirection: "column",
                gap: 0.5,
                py: 2,
              }}
            >
              <SearchOffIcon sx={{ fontSize: 24, color: "text.disabled" }} />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: "0.8125rem" }}
              >
                未找到图表
              </Typography>
            </ListItem>
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
}
