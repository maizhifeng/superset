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

export const CHART_TYPES = [
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
  { value: "auto", icon: <AutoFixHighIcon />, label: "自动" },
  { value: "line", icon: <ShowChartIcon />, label: "折线" },
  { value: "bar", icon: <BarChartIcon />, label: "柱状" },
  { value: "pie", icon: <DonutSmallIcon />, label: "饼图" },
  { value: "table", icon: <TableChartIcon />, label: "表格" },
  { value: "big_number", icon: <PinIcon />, label: "大数字" },
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
        gap: 0.25,
        "& .MuiToggleButton-root": {
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          px: 0.5,
          py: 0.25,
          textTransform: "none",
          fontSize: "0.7rem",
          minWidth: 44,
          display: "flex",
          gap: 0.25,
          position: "relative",
          "& .MuiSvgIcon-root": { fontSize: 13 },
          "&.Mui-selected": {
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { bgcolor: "primary.dark" },
          },
          "&.Mui-disabled": {
            opacity: 0.5,
            borderColor: "error.light",
            bgcolor: "error.light",
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
                        bgcolor: "primary.container",
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
