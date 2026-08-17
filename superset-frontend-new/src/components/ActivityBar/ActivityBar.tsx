import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

export interface ActivityBarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

interface ActivityBarProps {
  items: ActivityBarItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onItemEnter?: (id: string) => void;
  onItemLeave?: () => void;
  searchButton?: React.ReactNode;
  searchDialog?: React.ReactNode;
  aiButton?: React.ReactNode;
  userMenu?: React.ReactNode;
}

export default function ActivityBar({
  items,
  activeId,
  onSelect,
  onItemEnter,
  onItemLeave,
  searchButton,
  searchDialog,
  aiButton,
  userMenu,
}: ActivityBarProps) {
  return (
    <Box
      sx={{
        width: 48,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0,
        pt: 0.5,
        pb: 1,
        gap: 0.5,
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flex: 1 }}>
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <Tooltip
              key={item.id}
              title={item.label}
              placement="right"
              slotProps={{ popper: { sx: { pointerEvents: "none" } } }}
            >
              <Box
                sx={{ position: "relative" }}
                onMouseEnter={() => onItemEnter?.(item.id)}
                onMouseLeave={onItemLeave}
              >
                {isActive && (
                  <Box
                    sx={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 20,
                      bgcolor: "primary.main",
                      borderRadius: "0 2px 2px 0",
                    }}
                  />
                )}
                <IconButton
                  size="small"
                  onClick={() => onSelect(item.id)}
                  sx={{
                    width: 36,
                    height: 36,
                    color: isActive ? "primary.main" : "text.secondary",
                    bgcolor: isActive ? "action.selected" : "transparent",
                    borderRadius: 1.5,
                    "&:hover": {
                      bgcolor: isActive ? "action.selected" : "action.hover",
                    },
                  }}
                >
                  {item.icon}
                </IconButton>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      {userMenu && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {searchButton}
          {aiButton}
        </Box>
      )}
      {userMenu && <Box sx={{ mt: "auto", pt: 0.5 }}>{userMenu}</Box>}
      {searchDialog}
    </Box>
  );
}
