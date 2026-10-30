import type { SxProps, Theme } from "@mui/material";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

export interface ToolbarSelectOption {
  value: string | number;
  label: string;
}

interface ToolbarSelectProps {
  /** Accessible name and muted placeholder shown while the filter is "all". */
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  options: ToolbarSelectOption[];
  minWidth?: number;
  sx?: SxProps<Theme>;
}

/**
 * Compact dropdown used by PageFrame toolbars.
 *
 * A labelled MUI `Select` floats its label above the border once a value is
 * chosen, which makes the filter look taller than the neighbouring search box.
 * This wraps a label-less Select instead: the label is the muted placeholder
 * for the unfiltered state, the chosen option's label replaces it, and every
 * control keeps the toolbar's 36px height.
 */
export default function ToolbarSelect({
  label,
  value,
  onChange,
  options,
  minWidth = 120,
  sx,
}: ToolbarSelectProps) {
  return (
    <Select
      size="small"
      displayEmpty
      value={value}
      onChange={(event) => onChange(event.target.value as string)}
      inputProps={{ "aria-label": label }}
      renderValue={(selected) => {
        // The "all" value is the unfiltered state: show the filter's name as
        // a muted placeholder instead of a floating label above the border.
        if (selected === "" || selected === undefined || selected === null) {
          return (
            <Box component="span" sx={{ color: "text.disabled" }}>
              {label}
            </Box>
          );
        }
        const option = options.find(
          (item) => String(item.value) === String(selected),
        );
        return option ? option.label : label;
      }}
      sx={{
        minWidth,
        height: 36,
        fontSize: "0.8125rem",
        bgcolor: "background.paper",
        "& .MuiSelect-select": {
          py: 0.5,
          display: "flex",
          alignItems: "center",
        },
        ...sx,
      }}
    >
      {options.map((option) => (
        <MenuItem key={String(option.value)} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  );
}
