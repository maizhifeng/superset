import { useEffect, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { useToolbar, useToolbarStore } from "@/store/toolbarStore";

interface PageFrameProps {
  /** Toolbar registration key of the page (used to inline its tools). */
  page: string;
  title: string;
  /** Short summary shown under the title, e.g. "共 24 项". */
  subtitle?: ReactNode;
  /** Shows a loading placeholder instead of the subtitle while data loads. */
  loading?: boolean;
  /** Extra page-level actions rendered next to the primary tool. */
  actions?: ReactNode;
  /** Page-specific filters rendered in the toolbar row. */
  toolbar?: ReactNode;
  children: ReactNode;
  /** Extra styles for the content area (usually a flex-filling card). */
  contentSx?: SxProps<Theme>;
  /** Tighter chrome for analysis-style pages that stack several panels. */
  compact?: boolean;
  /** Hide the title/subtitle block (breadcrumbs already identify the page). */
  hideTitle?: boolean;
}

/**
 * Standard frame for list/content pages.
 *
 * Renders a large page title, the page's primary action and — instead of the
 * crowded 44px global top bar — the page's filters/export/refresh controls in a
 * dedicated toolbar row. Pages that use this frame call
 * ``useToolbarStore.setInlinePage`` so ``TopBar`` stops duplicating the tools.
 */
export default function PageFrame({
  page,
  title,
  subtitle,
  loading = false,
  actions,
  toolbar,
  children,
  contentSx,
  compact = false,
  hideTitle = false,
}: PageFrameProps) {
  const tools = useToolbar();
  const setInlinePage = useToolbarStore((s) => s.setInlinePage);

  useEffect(() => {
    setInlinePage(page);
    return () => setInlinePage(null);
  }, [page, setInlinePage]);

  const primaryTools = tools.filter(
    (tool) =>
      tool.variant !== "menu" &&
      tool.render == null &&
      (tool.fabIcon || tool.primary),
  );
  const barTools = tools.filter(
    (tool) => tool.variant !== "menu" && tool.render != null,
  );
  const menuTools = tools.filter((tool) => tool.variant === "menu");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        p: compact ? { xs: 1.5, md: 2 } : { xs: 1.5, md: 3 },
        pt: compact ? { xs: 1.5, md: 1.5 } : { xs: 1.5, md: 2 },
        gap: compact ? 1 : 1.5,
      }}
    >
      {!hideTitle && (
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "baseline",
            gap: compact ? 1.5 : 0,
            flexDirection: compact ? "row" : "column",
          }}
        >
          <Typography
            variant={compact ? "h5" : "h4"}
            sx={{
              fontWeight: 700,
              letterSpacing: compact ? "-0.2px" : "-0.25px",
              lineHeight: 1.2,
              flexShrink: 0,
            }}
          >
            {title}
          </Typography>
          {(loading || subtitle) && (
            <Tooltip
              title={
                compact && !loading && typeof subtitle === "string"
                  ? subtitle
                  : ""
              }
            >
              <Typography
                variant={compact ? "caption" : "body2"}
                color="text.secondary"
                sx={{
                  mt: compact ? 0 : 0.5,
                  display: "block",
                  minWidth: 0,
                  overflow: compact ? "hidden" : undefined,
                  textOverflow: compact ? "ellipsis" : undefined,
                  whiteSpace: compact ? "nowrap" : undefined,
                }}
              >
                {loading ? "加载中…" : subtitle}
              </Typography>
            </Tooltip>
          )}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          {actions}
          {primaryTools.map((tool) => (
            <Button
              key={tool.id}
              variant="contained"
              size="small"
              color={
                !tool.fabColor || tool.fabColor === "default"
                  ? "primary"
                  : tool.fabColor
              }
              startIcon={tool.fabIcon}
              onClick={tool.action}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              {tool.fabLabel}
            </Button>
          ))}
        </Box>
      </Box>
      )}

      {(toolbar ||
        barTools.length > 0 ||
        menuTools.length > 0 ||
        (hideTitle && Boolean(actions))) && (
        <Box
          data-testid="pageframe-toolbar"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: { xs: "nowrap", md: "wrap" },
            overflowX: { xs: "auto", md: "visible" },
            pb: { xs: 0.5, md: 0 },
            minWidth: 0,
            // Filters and search must share one height, or the row looks
            // ragged: MUI's small outlined controls differ between TextField
            // (40px) and Select (37px in this theme).
            "& .MuiOutlinedInput-root": { height: 36 },
          }}
        >
          {toolbar}
          {barTools.map((tool) => (
            <Box
              key={tool.id}
              sx={{ display: "flex", alignItems: "center", minWidth: 0 }}
            >
              {tool.render}
            </Box>
          ))}
          {menuTools.length > 0 && (
            <>
              <Tooltip title="更多操作">
                <IconButton
                  size="small"
                  aria-label="更多操作"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                  sx={{ color: "text.secondary" }}
                >
                  <MoreHorizIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {menuTools.map((tool) => (
                  <MenuItem
                    key={tool.id}
                    onClick={() => {
                      setMenuAnchor(null);
                      tool.action?.();
                    }}
                    sx={{ fontSize: "0.8125rem" }}
                  >
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      {tool.fabIcon}
                    </ListItemIcon>
                    <ListItemText primary={tool.fabLabel} />
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
          {hideTitle && actions && (
            <Box
              sx={{
                ml: "auto",
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexShrink: 0,
              }}
            >
              {actions}
            </Box>
          )}
        </Box>
      )}

      <Box
        sx={[
          {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            position: "relative",
          },
          ...(Array.isArray(contentSx) ? contentSx : [contentSx]),
        ]}
      >
        {children}
      </Box>
    </Box>
  );
}
