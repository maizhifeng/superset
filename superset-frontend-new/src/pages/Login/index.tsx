import { useState } from "react";
import { useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import PersonIcon from "@mui/icons-material/Person";
import LockIcon from "@mui/icons-material/Lock";
import InputAdornment from "@mui/material/InputAdornment";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const login = useAuthStore((s) => s.login);
  const location = useLocation();
  const themeMode = useThemeStore((s) => s.theme);
  const isVibrant = themeMode === "vibrant";

  const from = (location.state as { from?: string })?.from || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      window.location.href = from;
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "登录失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        bgcolor: "background.default",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: isVibrant
            ? `
              radial-gradient(ellipse 70% 60% at 15% 25%, rgba(99,102,241,0.06) 0%, transparent 60%),
              radial-gradient(ellipse 50% 50% at 85% 75%, rgba(225,29,143,0.05) 0%, transparent 60%),
              radial-gradient(ellipse 40% 40% at 50% 50%, rgba(139,92,246,0.04) 0%, transparent 50%)
            `
            : `
              radial-gradient(ellipse 60% 50% at 20% 30%, rgba(184,101,58,0.03) 0%, transparent 70%),
              radial-gradient(ellipse 50% 40% at 80% 70%, rgba(201,160,74,0.03) 0%, transparent 70%)
            `,
          pointerEvents: "none",
        },
      }}
    >
      {isVibrant ? (
        <>
          <Box
            sx={{
              position: "absolute",
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(66,133,244,0.07) 0%, transparent 70%)",
              top: "-5%",
              right: "-5%",
              pointerEvents: "none",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              width: 140,
              height: 140,
              borderRadius: "50%",
              border: "1px solid",
              borderColor: "rgba(66,133,244,0.08)",
              bottom: "10%",
              left: "5%",
              pointerEvents: "none",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              width: 60,
              height: 60,
              borderRadius: "20%",
              transform: "rotate(45deg)",
              border: "1px solid",
              borderColor: "rgba(13,148,136,0.08)",
              top: "40%",
              left: "20%",
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        <>
          <Box
            sx={{
              position: "absolute",
              width: 120,
              height: 120,
              borderRadius: "50%",
              border: "1px solid",
              borderColor: "rgba(184,101,58,0.06)",
              top: "15%",
              right: "20%",
              pointerEvents: "none",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "1px solid",
              borderColor: "rgba(201,160,74,0.06)",
              bottom: "20%",
              left: "15%",
              pointerEvents: "none",
            }}
          />
        </>
      )}
      <Card
        sx={{
          maxWidth: 420,
          width: "100%",
          mx: 2,
          zIndex: 1,
          border: "1px solid",
          borderColor: "border.light",
          borderTop: isVibrant ? "3px solid" : "1px solid",
          borderTopColor: isVibrant ? "#4285F4" : undefined,
          animation: "cardEntrance 500ms cubic-bezier(0.25,0.1,0.15,1) both",
          "@keyframes cardEntrance": {
            from: { opacity: 0, transform: "translateY(24px) scale(0.98)" },
            to: { opacity: 1, transform: "translateY(0) scale(1)" },
          },
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: "center", mb: 4 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                bgcolor: "rgba(184,101,58,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 2,
              }}
            >
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  opacity: 0.8,
                }}
              />
            </Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 650,
                fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
                fontSize: "1.75rem",
                letterSpacing: "-0.01em",
              }}
            >
              starfly
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.5,
                fontSize: "0.8125rem",
              }}
            >
              登录以继续
            </Typography>
          </Box>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              sx={{ mb: 2 }}
              autoFocus
              disabled={submitting}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon
                        sx={{ fontSize: 18, color: "text.disabled" }}
                      />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              fullWidth
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3 }}
              disabled={submitting}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
            >
              {submitting ? "登录中..." : "登录"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
