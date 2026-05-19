import { useState, useRef } from "react";
import Box from "@mui/material/Box";
import Popover from "@mui/material/Popover";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import AddIcon from "@mui/icons-material/Add";

export interface PickerOption {
  value: string;
  label: string;
  group?: string;
}

interface PickerFieldProps {
  label: string;
  options: PickerOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  loading?: boolean;
  placeholder?: string;
  singleSelect?: boolean;
  hideGroups?: boolean;
  hideHeader?: boolean;
}

export default function PickerField({
  label,
  options,
  selected,
  onChange,
  loading,
  placeholder = "Select...",
  singleSelect,
  hideGroups,
  hideHeader,
}: PickerFieldProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const grouped = hideGroups
    ? { "": options }
    : options.reduce<Record<string, PickerOption[]>>((acc, opt) => {
        const g = opt.group || "Other";
        if (!acc[g]) acc[g] = [];
        acc[g].push(opt);
        return acc;
      }, {});

  const toggleOption = (value: string) => {
    if (singleSelect) {
      onChange([value]);
      setAnchorEl(null);
    } else if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    if (a === "Metrics" || a === "Dimensions" || a === "Datasets") return -1;
    if (b === "Metrics" || b === "Dimensions" || b === "Datasets") return 1;
    return a.localeCompare(b);
  });

  return (
    <>
      <Box
        ref={containerRef}
        onClick={(e) => !loading && setAnchorEl(e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 0.75,
          p: 1.5,
          borderRadius: 1.5,
          border: "1px solid",
          borderColor: anchorEl ? "primary.main" : "divider",
          bgcolor: "background.paper",
          cursor: loading ? "default" : "pointer",
          minHeight: 48,
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          "&:hover": {
            borderColor: "primary.light",
            boxShadow: "0 0 0 2px rgba(32, 167, 201, 0.1)",
          },
        }}
      >
        {loading ? (
          <CircularProgress size={16} sx={{ mx: "auto" }} />
        ) : selected.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              color: "text.disabled",
              width: "100%",
            }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
            <Typography variant="body2">{placeholder}</Typography>
          </Box>
        ) : (
          selected.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <Chip
                key={v}
                label={opt?.label || v}
                size="small"
                onDelete={() => onChange(selected.filter((s) => s !== v))}
                onMouseDown={(e) => e.stopPropagation()}
                sx={{ maxWidth: 160, minHeight: 28 }}
              />
            );
          })
        )}
      </Box>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: containerRef.current?.offsetWidth || 320,
              maxHeight: 360,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "primary.light",
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box sx={{ py: 0.5 }}>
          {!hideHeader && (
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: "grey.50",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {singleSelect ? "" : `${selected.length} selected`}
              </Typography>
            </Box>
          )}

          <Box sx={{ overflowY: "auto", maxHeight: 280, py: 0.5 }}>
            {sortedGroups.map(([groupName, groupOptions]) => (
              <Box key={groupName}>
                {groupName && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      px: 2,
                      py: 0.75,
                      fontWeight: 600,
                      color: "text.secondary",
                      bgcolor: "action.hover",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: "0.65rem",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    {groupName}
                  </Typography>
                )}
                {groupOptions.map((opt) => {
                  const isSelected = selected.includes(opt.value);
                  return (
                    <Box
                      key={opt.value}
                      component="button"
                      type="button"
                      onClick={() => toggleOption(opt.value)}
                      sx={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        px: 2,
                        py: 1.25,
                        border: "none",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        cursor: "pointer",
                        textAlign: "left",
                        bgcolor: isSelected
                          ? "rgba(32, 167, 201, 0.08)"
                          : "transparent",
                        color: "inherit",
                        minHeight: 44,
                        transition: "background-color 100ms ease",
                        "&:hover": {
                          bgcolor: isSelected
                            ? "rgba(32, 167, 201, 0.12)"
                            : "action.hover",
                        },
                        "&:last-of-type": { borderBottom: "none" },
                      }}
                    >
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: 0.5,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "2px solid",
                          borderColor: isSelected ? "primary.main" : "grey.400",
                          bgcolor: isSelected ? "primary.main" : "transparent",
                          transition: "all 120ms ease",
                        }}
                      >
                        {isSelected && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: 0.25,
                              bgcolor: "primary.contrastText",
                            }}
                          />
                        )}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: isSelected ? 600 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {opt.label}
                        </Typography>
                        {opt.group && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.disabled",
                              display: "block",
                              fontSize: "0.65rem",
                            }}
                          >
                            {opt.group}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            ))}
            {options.length === 0 && (
              <Box
                sx={{
                  px: 2,
                  py: 3,
                  textAlign: "center",
                  color: "text.secondary",
                }}
              >
                <Typography variant="body2">No options available</Typography>
              </Box>
            )}
          </Box>

          <Box
            sx={{
              px: 2,
              py: 1,
              borderTop: "1px solid",
              borderColor: "divider",
              display: "flex",
              justifyContent: "flex-end",
              bgcolor: "grey.50",
            }}
          >
            <Chip
              label={
                singleSelect
                  ? "Done"
                  : selected.length > 0
                    ? `${selected.length} selected`
                    : "Close"
              }
              size="small"
              onClick={() => setAnchorEl(null)}
              variant="outlined"
              color="primary"
              sx={{ fontWeight: 500 }}
            />
          </Box>
        </Box>
      </Popover>
    </>
  );
}
