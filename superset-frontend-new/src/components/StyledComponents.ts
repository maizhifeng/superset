import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";

export const PageContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  maxWidth: "lg",
  margin: "0 auto",
}));

export const FlexRow = styled(Box)({
  display: "flex",
  alignItems: "center",
});

export const FlexBetween = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

export const ScrollY = styled(Box)({
  flex: 1,
  overflow: "auto",
  minHeight: 0,
});

export const ContentSection = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  borderRadius: 12,
  backgroundColor: "var(--mui-palette-surface-main)",
  border: "1px solid var(--mui-palette-divider)",
}));

export const SectionTitle = styled(Box)(({ theme }) => ({
  fontWeight: 600,
  fontSize: "0.875rem",
  marginBottom: theme.spacing(1),
  color: "var(--mui-palette-text-primary)",
}));

export const ToolbarRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  flexShrink: 0,
}));

export const EmptyStateBox = styled(Box)({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  color: "var(--mui-palette-text-secondary)",
});
