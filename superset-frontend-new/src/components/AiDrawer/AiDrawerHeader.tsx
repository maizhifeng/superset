import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";

interface AiDrawerHeaderProps {
  title: string;
  showBack: boolean;
  subtitle?: string;
  onBack: () => void;
  onClose: () => void;
}

export default function AiDrawerHeader({
  title,
  showBack,
  subtitle,
  onBack,
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
            color="text.secondary"
            noWrap
            sx={{ fontSize: "0.6875rem", lineHeight: 1.2, display: "block" }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      <IconButton size="small" onClick={onClose}>
        <CloseIcon sx={{ fontSize: 20 }} />
      </IconButton>
    </Box>
  );
}
