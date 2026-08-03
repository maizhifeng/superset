import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";

interface AiDrawerHeaderProps {
  title: string;
  showSettings: boolean;
  showBack: boolean;
  subtitle?: string;
  onBack: () => void;
  onSettings: () => void;
  onClose: () => void;
}

export default function AiDrawerHeader({
  title,
  showSettings,
  showBack,
  subtitle,
  onBack,
  onSettings,
  onClose,
}: AiDrawerHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        px: 2,
        py: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {showBack && (
        <IconButton size="small" onClick={onBack} sx={{ mr: 0.5 }}>
          <ArrowBackIcon sx={{ fontSize: 20 }} />
        </IconButton>
      )}
      <AutoAwesome sx={{ fontSize: 20, color: "primary.main", mr: 1 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ lineHeight: 1.2, display: "block", fontSize: "0.6875rem" }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {showSettings && (
        <IconButton
          size="small"
          onClick={onSettings}
          aria-label="设置"
          data-testid="SettingsIcon"
          sx={{ mr: 0.25 }}
        >
          <SettingsIcon sx={{ fontSize: 20 }} />
        </IconButton>
      )}
      <IconButton size="small" onClick={onClose}>
        <CloseIcon sx={{ fontSize: 20 }} />
      </IconButton>
    </Box>
  );
}
