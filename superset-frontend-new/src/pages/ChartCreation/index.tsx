import Box from "@mui/material/Box";
import ChartEditor from "./ChartEditor";

export default function ChartCreation() {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <ChartEditor />
    </Box>
  );
}
