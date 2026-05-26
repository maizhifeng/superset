import { useState } from "react";
import Button from "@mui/material/Button";
import Badge from "@mui/material/Badge";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import FilterListIcon from "@mui/icons-material/FilterList";
import ClearAllIcon from "@mui/icons-material/CleaningServices";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

interface FilterToolbarButtonProps {
  activeCount: number;
  hiddenFilters: { id: string; name: string }[];
  onOpenDrawer: () => void;
  onClearAll: () => void;
  onAddFilter: (id: string) => void;
}

export default function FilterToolbarButton({
  activeCount,
  hiddenFilters,
  onOpenDrawer,
  onClearAll,
  onAddFilter,
}: FilterToolbarButtonProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <Button
        onClick={onOpenDrawer}
        startIcon={
          <Badge
            badgeContent={activeCount}
            color="primary"
            overlap="circular"
            slotProps={{
              badge: { sx: { height: 18, minWidth: 18, fontSize: 11 } },
            }}
          >
            <FilterListIcon sx={{ fontSize: 22 }} />
          </Badge>
        }
        sx={{
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.875rem",
          color: activeCount > 0 ? "primary.main" : "text.secondary",
          px: 0.5,
          py: 0,
          minWidth: 0,
          whiteSpace: "nowrap",
          lineHeight: 1.2,
        }}
      >
        筛选
      </Button>
      {(activeCount > 0 || hiddenFilters.length > 0) && (
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ p: 0.125, ml: -0.25 }}
        >
          <ArrowDropDownIcon sx={{ fontSize: 20, color: "text.disabled" }} />
        </IconButton>
      )}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 180, maxHeight: 300 } } }}
      >
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
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
              setAnchorEl(null);
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
        {hiddenFilters.length > 0 && <Divider />}
        {hiddenFilters.slice(0, 20).map((f) => (
          <MenuItem
            key={f.id}
            onClick={() => {
              setAnchorEl(null);
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
        {hiddenFilters.length > 20 && (
          <MenuItem
            disabled
            dense
            sx={{ fontSize: "0.75rem", color: "text.secondary" }}
          >
            +{hiddenFilters.length - 20} 更多
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
