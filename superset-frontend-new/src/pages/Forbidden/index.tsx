import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { useNavigate } from "react-router-dom";
import LockIcon from "@mui/icons-material/Lock";

export default function Forbidden() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 2,
        p: 3,
      }}
    >
      <LockIcon sx={{ fontSize: 64, color: "text.secondary" }} />
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        权限不足
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ textAlign: "center" }}
      >
        您没有访问此页面的权限，请联系管理员。
      </Typography>
      <Button variant="contained" onClick={() => navigate("/")}>
        返回首页
      </Button>
    </Box>
  );
}
