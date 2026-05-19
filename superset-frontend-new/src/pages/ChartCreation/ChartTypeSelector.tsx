import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import BarChartIcon from "@mui/icons-material/BarChart";
import DonutSmallIcon from "@mui/icons-material/DonutSmall";
import TableChartIcon from "@mui/icons-material/TableChart";
import PinIcon from "@mui/icons-material/Pin";
import BlockIcon from "@mui/icons-material/Block";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

const CHART_TYPES = [
  "auto",
  "line",
  "bar",
  "pie",
  "table",
  "big_number",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

interface ChartTypeMeta {
  value: ChartType;
  icon: React.ReactNode;
  label: string;
}

const chartTypeMeta: ChartTypeMeta[] = [
  { value: "auto", icon: <AutoFixHighIcon />, label: "Auto" },
  { value: "line", icon: <ShowChartIcon />, label: "Line" },
  { value: "bar", icon: <BarChartIcon />, label: "Bar" },
  { value: "pie", icon: <DonutSmallIcon />, label: "Pie" },
  { value: "table", icon: <TableChartIcon />, label: "Table" },
  { value: "big_number", icon: <PinIcon />, label: "Big Number" },
];

interface ChartTypeSelectorProps {
  value: string;
  suggested?: string | null;
  disabledReasons?: Record<string, string>;
  onChange: (value: string) => void;
}

export default function ChartTypeSelector({
  value,
  suggested,
  disabledReasons = {},
  onChange,
}: ChartTypeSelectorProps) {
  const handleChange = (_: unknown, val: string) => {
    if (val && !disabledReasons[val]) onChange(val);
  };

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={handleChange}
      size="small"
      sx={{
        flexWrap: "wrap",
        gap: 0.5,
        "& .MuiToggleButton-root": {
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          px: 1,
          py: 0.5,
          textTransform: "none",
          fontSize: "0.75rem",
          minWidth: 56,
          display: "flex",
          gap: 0.5,
          position: "relative",
          "& .MuiSvgIcon-root": { fontSize: 15 },
          "&.Mui-selected": {
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { bgcolor: "primary.dark" },
          },
          "&.Mui-disabled": {
            opacity: 0.5,
            borderColor: "error.light",
            bgcolor: "rgba(211, 47, 47, 0.04)",
            cursor: "not-allowed",
            "& .MuiSvgIcon-root": {
              opacity: 0.4,
            },
          },
        },
      }}
    >
      {chartTypeMeta.map((meta) => {
        const reason = disabledReasons[meta.value];
        const isDisabled = !!reason;
        const isSuggested =
          !isDisabled && suggested === meta.value && meta.value !== value;

        return (
          <Tooltip
            key={meta.value}
            title={reason || ""}
            placement="bottom"
            enterDelay={400}
            disableHoverListener={!reason}
          >
            <span>
              <ToggleButton
                value={meta.value}
                disabled={isDisabled}
                sx={
                  isSuggested
                    ? {
                        borderColor: "primary.light",
                        borderWidth: 2,
                        bgcolor: "rgba(32, 167, 201, 0.04)",
                      }
                    : undefined
                }
              >
                <Box
                  sx={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  {meta.icon}
                  {meta.label}
                  {isDisabled && (
                    <BlockIcon
                      sx={{
                        position: "absolute",
                        right: -6,
                        top: -6,
                        fontSize: 12,
                        color: "error.light",
                      }}
                    />
                  )}
                </Box>
              </ToggleButton>
            </span>
          </Tooltip>
        );
      })}
    </ToggleButtonGroup>
  );
}
