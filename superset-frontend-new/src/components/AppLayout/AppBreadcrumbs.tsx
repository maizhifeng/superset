import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import MenuList from "@mui/material/MenuList";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import type { BreadcrumbOption } from "@/store/breadcrumbStore";
import type { CrumbItem } from "./config";

interface AppBreadcrumbsProps {
  items: CrumbItem[];
  customStatus?: string;
  customLabel?: string;
  onCrumbClick: (crumb: CrumbItem, e: React.MouseEvent<HTMLElement>) => void;
  onOptionSelect?: (option: BreadcrumbOption) => void;
}

/** Delay that lets the pointer travel from the crumb into the dropdown. */
const CLOSE_DELAY_MS = 400;

export default function AppBreadcrumbs({
  items,
  customStatus,
  customLabel,
  onCrumbClick,
  onOptionSelect,
}: AppBreadcrumbsProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuOptions, setMenuOptions] = useState<BreadcrumbOption[]>([]);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    console.debug("crumb-cancel");
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setMenuAnchor(null);
      closeTimer.current = null;
    }, CLOSE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  const openMenu = (target: HTMLElement, options: BreadcrumbOption[]) => {
    cancelClose();
    setMenuOptions(options);
    setMenuAnchor(target);
  };

  const closeMenu = () => {
    cancelClose();
    console.debug("crumb-close");
    setMenuAnchor(null);
  };

  return (
    <>
      <Breadcrumbs
        separator={
          <NavigateNextIcon sx={{ fontSize: 11, color: "text.disabled" }} />
        }
        maxItems={4}
        itemsAfterCollapse={2}
        itemsBeforeCollapse={1}
        sx={{
          "& .MuiBreadcrumbs-ol": { gap: 0, flexWrap: "nowrap" },
        }}
      >
        {items.map((crumb, i) => {
          const hasMenu = Boolean(crumb.options && crumb.options.length > 0);
          if (crumb.isId) {
            return (
              <Button
                key={crumb.path}
                size="small"
                aria-haspopup={hasMenu ? "menu" : undefined}
                aria-expanded={hasMenu ? Boolean(menuAnchor) : undefined}
                onMouseEnter={
                  hasMenu
                    ? (event) =>
                        openMenu(event.currentTarget, crumb.options ?? [])
                    : undefined
                }
                onMouseLeave={hasMenu ? scheduleClose : undefined}
                onClick={(event) => {
                  if (!hasMenu) {
                    onCrumbClick(crumb, event);
                    return;
                  }
                  if (menuAnchor) {
                    closeMenu();
                  } else {
                    openMenu(event.currentTarget, crumb.options ?? []);
                  }
                }}
                endIcon={
                  hasMenu ? (
                    <ArrowDropDownIcon sx={{ fontSize: 15 }} />
                  ) : (
                    <ArrowDropDownIcon sx={{ fontSize: 15 }} />
                  )
                }
                sx={{
                  textTransform: "none",
                  fontWeight: i === items.length - 1 ? 600 : 400,
                  fontSize: "0.875rem",
                  color: "text.primary",
                  px: 0.25,
                  flexShrink: 0,
                  letterSpacing: 0,
                  lineHeight: 1.2,
                  "&:hover": { bgcolor: "action.hover" },
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
            );
          }
          return (
            <Typography
              key={crumb.path}
              component={RouterLink}
              to={crumb.path}
              sx={{
                fontSize: "0.875rem",
                fontWeight: i === items.length - 1 ? 600 : 400,
                color:
                  i === items.length - 1
                    ? "text.primary"
                    : "text.secondary",
                px: 0.25,
                flexShrink: 0,
                letterSpacing: 0,
                lineHeight: 1.2,
                textDecoration: "none",
                "&:hover": {
                  color: "text.primary",
                  textDecoration: "underline",
                },
              }}
              onClick={() => {}}
            >
              {crumb.label}
            </Typography>
          );
        })}
      </Breadcrumbs>
      <Popper
        open={Boolean(menuAnchor)}
        anchorEl={menuAnchor}
        placement="bottom-start"
        modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
      >
        <Paper
          elevation={8}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          sx={{ minWidth: 180, py: 0.5 }}
        >
          <MenuList dense sx={{ py: 0 }}>
            {menuOptions.map((option) => (
              <MenuItem
                key={option.path}
                selected={option.selected}
                onClick={() => {
                  closeMenu();
                  onOptionSelect?.(option);
                }}
                sx={{ fontSize: "0.8125rem" }}
              >
                {option.label}
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popper>
    </>
  );
}
