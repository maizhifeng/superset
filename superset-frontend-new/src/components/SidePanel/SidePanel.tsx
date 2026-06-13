import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import CloseIcon from "@mui/icons-material/Close";

interface SidePanelProps {
  open: boolean;
  title: string;
  items: { id: number | string; label: string }[];
  loading: boolean;
  activeItemId?: number | string | null;
  onSelect: (id: number | string) => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const PANEL_WIDTH = 200;
const TRANSITION =
  "width 350ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 300ms ease";

export default function SidePanel({
  open,
  title,
  items,
  loading,
  activeItemId,
  onSelect,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: SidePanelProps) {
  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      sx={{
        position: "absolute",
        left: 48,
        top: 0,
        height: "100%",
        width: open ? PANEL_WIDTH : 0,
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: TRANSITION,
        pointerEvents: open ? "auto" : "none",
        zIndex: (theme) => theme.zIndex.drawer,
        boxShadow: open
          ? "2px 0 8px rgba(0,0,0,0.08)"
          : "none",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          minHeight: 44,
          flexShrink: 0,
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, flex: 1, minWidth: 0, fontSize: "0.8125rem" }}
          noWrap
        >
          {title}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: "auto",
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              暂无数据
            </Typography>
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {items.map((item) => (
              <ListItemButton
                key={item.id}
                dense
                selected={activeItemId === item.id}
                onClick={() => onSelect(item.id)}
                sx={{
                  px: 2,
                  py: 0.75,
                  "&.Mui-selected": {
                    bgcolor: "action.selected",
                    borderRight: "2px solid",
                    borderColor: "primary.main",
                  },
                }}
              >
                <ListItemText
                  primary={item.label}
                  slotProps={{ primary: { variant: "body2", noWrap: true } }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}
