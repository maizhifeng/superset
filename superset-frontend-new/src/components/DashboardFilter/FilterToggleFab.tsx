import { useState } from "react";
import Badge from "@mui/material/Badge";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import FilterListIcon from "@mui/icons-material/FilterList";
import ClearAllIcon from "@mui/icons-material/CleaningServices";
import AddIcon from "@mui/icons-material/Add";

interface FilterToggleFabProps {
  activeCount: number;
  hiddenCount: number;
  hiddenFilters: { id: string; name: string }[];
  onOpenDrawer: () => void;
  onClearAll: () => void;
  onAddFilter: (id: string) => void;
}

export default function FilterToggleFab({
  activeCount,
  hiddenCount,
  hiddenFilters,
  onOpenDrawer,
  onClearAll,
  onAddFilter,
}: FilterToggleFabProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title={activeCount > 0 ? `${activeCount} 个活跃筛选` : "筛选"}>
        <IconButton onClick={handleClick} size="small" sx={{ p: 0.5 }}>
          <Badge
            badgeContent={activeCount}
            color="primary"
            overlap="circular"
            slotProps={{
              badge: { sx: { height: 16, minWidth: 16, fontSize: 10 } },
            }}
          >
            <FilterListIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 180, maxHeight: 300 } } }}
      >
        <MenuItem
          onClick={() => {
            handleClose();
            onOpenDrawer();
          }}
          dense
        >
          <ListItemIcon>
            <FilterListIcon fontSize="small" />
          </ListItemIcon>
          筛选面板
        </MenuItem>
        {activeCount > 0 && (
          <MenuItem
            onClick={() => {
              handleClose();
              onClearAll();
            }}
            dense
          >
            <ListItemIcon>
              <ClearAllIcon fontSize="small" />
            </ListItemIcon>
            清除全部
          </MenuItem>
        )}
        {hiddenCount > 0 && <Divider />}
        {hiddenFilters.slice(0, 20).map((f) => (
          <MenuItem
            key={f.id}
            onClick={() => {
              handleClose();
              onAddFilter(f.id);
            }}
            dense
            sx={{ fontSize: "0.8125rem" }}
          >
            <ListItemIcon>
              <AddIcon fontSize="small" sx={{ color: "primary.main" }} />
            </ListItemIcon>
            {f.name}
          </MenuItem>
        ))}
        {hiddenCount > 20 && (
          <MenuItem
            disabled
            dense
            sx={{ fontSize: "0.75rem", color: "text.secondary" }}
          >
            +{hiddenCount - 20} 更多
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
