import { Suspense, lazy, memo } from "react";
import type { DataGridProps } from "@mui/x-data-grid";
import { useMediaQuery, useTheme } from "@mui/material";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useUiPreferences } from "@/store/uiPreferences";

const DataGrid = lazy(() =>
  import("@mui/x-data-grid").then((m) => ({ default: m.DataGrid })),
);

function DataGridTable(props: DataGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // 未显式指定密度时，应用用户的全局偏好。
  const prefDensity = useUiPreferences((s) => s.gridDensity);
  const density = props.density ?? prefDensity;
  return (
    <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        }
      >
        <DataGrid
          {...props}
          density={density}
          autoHeight={false}
          rowHeight={isMobile ? 52 : undefined}
          columnBufferPx={isMobile ? 150 : 200}
          virtualizeColumnsWithAutoRowHeight={false}
          sx={[
            {
              height: "100%",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: "grey.50",
                borderBottom: "1px solid",
                borderColor: "divider",
              },
              "& .MuiDataGrid-columnHeaderTitle": {
                fontWeight: 700,
                fontSize: "0.75rem",
                color: "text.primary",
              },
              "& .MuiDataGrid-columnHeader": {
                "&:focus, &:focus-within": { outline: "none" },
              },
              "& .MuiDataGrid-row": {
                cursor: props.onRowClick ? "pointer" : "default",
                transition:
                  "background-color 150ms ease, box-shadow 150ms ease",
                "&:hover": {
                  backgroundColor: "action.hover",
                  boxShadow: "var(--mui-palette-shadow-sm)",
                },
                "&:nth-of-type(even)": {
                  backgroundColor: "var(--mui-palette-action-hover)",
                },
                "&:nth-of-type(even):hover": {
                  backgroundColor: "action.hover",
                },
              },
              "& .MuiDataGrid-cell": {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 12px",
                borderBottom: "1px solid",
                borderColor: "divider",
                fontSize: "0.8125rem",
                lineHeight: 1.5,
              },
              "& .MuiDataGrid-cell--textLeft": {
                textAlign: "left",
                justifyContent: "flex-start",
              },
              "& .MuiDataGrid-cell:focus": {
                outline: "2px solid var(--mui-palette-primary-main)",
                outlineOffset: -2,
              },
              "& .MuiDataGrid-cell:focus-within": {
                outline: "2px solid var(--mui-palette-primary-main)",
                outlineOffset: -2,
              },
              "& .MuiDataGrid-cellContent": {
                lineHeight: 1.5,
              },
              "& .MuiDataGrid-footerContainer": {
                borderTop: "1px solid",
                borderColor: "divider",
                minHeight: 52,
                px: 2,
                backgroundColor: "grey.50",
              },
              "& .MuiTablePagination-root": {
                fontSize: "0.75rem",
              },
              "& .MuiDataGrid-virtualScroller": {
                minHeight: 0,
              },
            },
            ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
          ]}
        />
      </Suspense>
    </Box>
  );
}

export default memo(DataGridTable);
