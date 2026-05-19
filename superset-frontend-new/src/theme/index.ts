import { createTheme } from "@mui/material/styles";
import { supersetPalette } from "./palette";
import typography from "./typography";
import components from "./components";
const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: supersetPalette,
    },
  },
  typography,
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  components,
});

export { theme };
