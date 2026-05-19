import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import type { CrumbItem } from "./config";

interface AppBreadcrumbsProps {
  items: CrumbItem[];
  customStatus?: string;
  customLabel?: string;
  onCrumbClick: (crumb: CrumbItem, e: React.MouseEvent<HTMLElement>) => void;
}

export default function AppBreadcrumbs({
  items,
  customStatus,
  customLabel,
  onCrumbClick,
}: AppBreadcrumbsProps) {
  return (
    <Breadcrumbs
      separator={
        <NavigateNextIcon sx={{ fontSize: 11, color: "text.disabled" }} />
      }
      maxItems={4}
      itemsAfterCollapse={2}
      itemsBeforeCollapse={1}
      sx={{
        fontStyle: "italic",
        "& .MuiBreadcrumbs-ol": { gap: 0, flexWrap: "nowrap" },
      }}
    >
      {items.map((crumb, i) =>
        crumb.isId ? (
          <Button
            key={crumb.path}
            size="small"
            onClick={(e) => onCrumbClick(crumb, e)}
            endIcon={<ArrowDropDownIcon sx={{ fontSize: 15 }} />}
            sx={{
              textTransform: "none",
              fontWeight: i === items.length - 1 ? 600 : 400,
              fontSize: "0.875rem",
              fontStyle: "italic",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              color:
                i === items.length - 1 ? "text.secondary" : "text.disabled",
              px: 0.25,
              flexShrink: 0,
              letterSpacing: 0,
              lineHeight: 1.2,
            }}
          >
            {customStatus && i === items.length - 1 && (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor:
                    customStatus === "published"
                      ? "success.main"
                      : "warning.main",
                  mr: 0.375,
                  flexShrink: 0,
                }}
              />
            )}
            {customLabel || crumb.label}
          </Button>
        ) : (
          <Typography
            key={crumb.path}
            component={RouterLink}
            to={crumb.path}
            sx={{
              fontSize: "0.875rem",
              fontWeight: i === items.length - 1 ? 600 : 400,
              fontStyle: "italic",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              color:
                i === items.length - 1 ? "text.secondary" : "text.disabled",
              px: 0.25,
              flexShrink: 0,
              letterSpacing: 0,
              lineHeight: 1.2,
            }}
            onClick={() => {}}
          >
            {crumb.label}
          </Typography>
        ),
      )}
    </Breadcrumbs>
  );
}
