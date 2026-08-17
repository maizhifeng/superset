import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import PersonIcon from "@mui/icons-material/Person";
import LockIcon from "@mui/icons-material/Lock";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

export default function Login() {
  const themeMode = useThemeStore((s) => s.theme);
  const REMEMBER_KEY = "superset_remember_username";
  const [remember, setRemember] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.loading);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 登录过期（会话失效）重定向时，登录页显示友好提示而非空白重登。
  const sessionExpired = searchParams.get("reason") === "session_expired";

  const from = (location.state as { from?: string })?.from || "/";

  // 若上次勾选"记住用户名"，则预填。
  const [hasRemembered, setHasRemembered] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setUsername(saved);
        setRemember(true);
        setHasRemembered(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  /** 清除记住的用户名（隐私）。 */
  const clearRemembered = () => {
    localStorage.removeItem(REMEMBER_KEY);
    setHasRemembered(false);
    setRemember(false);
    setUsername("");
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      try {
        if (remember && username.trim()) {
          localStorage.setItem(REMEMBER_KEY, username.trim());
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        /* ignore */
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "登录失败"));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          bgcolor: "background.default",
        }}
      >
        <Box
          component="span"
          sx={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "2px solid",
            borderColor: "primary.main",
            borderTopColor: "transparent",
            animation: "spin 600ms linear infinite",
          }}
        />
      </Box>
    );
  }

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
          background: `
              radial-gradient(ellipse 70% 60% at 15% 25%, color-mix(in srgb, var(--mui-palette-secondary-main) 6%, transparent) 0%, transparent 60%),
              radial-gradient(ellipse 50% 50% at 85% 75%, color-mix(in srgb, var(--mui-palette-primary-main) 5%, transparent) 0%, transparent 60%),
              radial-gradient(ellipse 40% 40% at 50% 50%, color-mix(in srgb, var(--mui-palette-secondary-main) 4%, transparent) 0%, transparent 50%)
            `,
          pointerEvents: "none",
        },
      }}
    >
      <>
        <Box
          sx={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--mui-palette-secondary-main) 7%, transparent) 0%, transparent 70%)",
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
            borderColor:
              "color-mix(in srgb, var(--mui-palette-secondary-main) 10%, transparent)",
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
            borderColor:
              "color-mix(in srgb, var(--mui-palette-primary-main) 8%, transparent)",
            top: "40%",
            left: "20%",
            pointerEvents: "none",
          }}
        />
      </>
      <Card
        sx={{
          maxWidth: 420,
          width: "100%",
          mx: 2,
          zIndex: 1,
          border: "1px solid",
          borderColor: "border.light",
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
                bgcolor: "action.hover",
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
                fontFamily:
                  themeMode === "paper"
                    ? "Newsreader, Georgia, 'Times New Roman', serif"
                    : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
          {sessionExpired && (
            <Alert
              severity="info"
              icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}
              sx={{ mb: 2 }}
            >
              登录已过期，请重新登录以继续。
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit(e);
            }}
          >
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
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 1 }}
              disabled={submitting}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label={showPassword ? "隐藏密码" : "显示密码"}
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <VisibilityOffIcon sx={{ fontSize: 18 }} />
                        ) : (
                          <VisibilityIcon sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  size="small"
                />
              }
              label="记住用户名"
              sx={{ mb: 1, color: "text.secondary" }}
            />
            {hasRemembered && (
              <Box sx={{ mb: 2 }}>
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={clearRemembered}
                  sx={{ textTransform: "none", p: 0, fontSize: "0.75rem" }}
                >
                  清除记住的用户名
                </Button>
              </Box>
            )}
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
