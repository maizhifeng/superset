import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { useNotificationStore } from "@/store/notificationStore";

export default function GlobalSnackbar() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const n = notifications[0];

  if (!n) return null;

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      onClose={() => dismiss(n.id)}
      autoHideDuration={4000}
      sx={{ bottom: { xs: 8, sm: 24 } }}
    >
      <Alert
        severity={n.severity}
        variant="filled"
        onClose={() => dismiss(n.id)}
        action={
          n.action ? (
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                n.action?.onClick();
                dismiss(n.id);
              }}
            >
              {n.action.label}
            </Button>
          ) : undefined
        }
        sx={{
          minWidth: 280,
          maxWidth: 480,
          borderRadius: 2,
          boxShadow: "0 4px 12px rgba(44,36,22,0.1), 0 8px 24px rgba(44,36,22,0.08)",
          "& .MuiAlert-icon": {
            color: n.severity === "success" ? "#5a8f6a" : undefined,
          },
        }}
      >
        {n.message}
      </Alert>
    </Snackbar>
  );
}
