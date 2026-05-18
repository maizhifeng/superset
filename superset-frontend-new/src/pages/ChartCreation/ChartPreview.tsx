import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts';
import { echarts } from '@/utils/echarts';
import DataPreviewTable from '@/components/DataPreviewTable';
import ChartTypeSelector from './ChartTypeSelector';

interface ChartPreviewProps {
  datasourceId: string;
  vizType: string;
  resolvedType: string;
  hasValidType: boolean;
  metrics: string[];
  chartData: Record<string, unknown> | null;
  loadingData: boolean;
  suggestedVizType?: string;
  disabledReasons: Record<string, string>;
  onChartTypeChange: (val: string) => void;
  chartLibReady: boolean;
  option: EChartsOption | null;
  bigNumberValue: string | null;
}

export default function ChartPreview({
  datasourceId, vizType, resolvedType, hasValidType, metrics,
  chartData, loadingData, suggestedVizType, disabledReasons,
  onChartTypeChange, chartLibReady, option, bigNumberValue,
}: ChartPreviewProps) {
  return (
    <Box sx={{ flex: { md: 1 }, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {datasourceId && (
          <ChartTypeSelector
            value={vizType}
            suggested={suggestedVizType}
            disabledReasons={disabledReasons}
            onChange={onChartTypeChange}
          />
        )}
      </Box>

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', minHeight: 200, overflow: 'auto' }}>
        {!datasourceId ? (
          <Typography variant="body2" color="text.disabled">Select a dataset to see preview</Typography>
        ) : !hasValidType ? (
          <Typography variant="body2" color="text.disabled">Analyzing data for best chart type...</Typography>
        ) : metrics.length === 0 ? (
          <Typography variant="body2" color="text.disabled">Select at least one metric</Typography>
        ) : loadingData && !chartData ? (
          <CircularProgress size={24} />
        ) : resolvedType === 'table' ? (
          <DataPreviewTable
            data={chartData}
            maxRows={500}
            formatCell={(key, val) => {
              if (val === null || val === undefined) return '';
              if (typeof val === 'number' && /year|date|time/i.test(key)) {
                const d = new Date(val);
                const y = d.getFullYear();
                if (y > 1900 && y < 2100) return d.toLocaleDateString();
              }
              return String(val);
            }}
          />
        ) : bigNumberValue && resolvedType === 'big_number' ? (
          <Typography variant="h2" sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '3rem' }, lineHeight: 1.2 }}>
            {bigNumberValue}
          </Typography>
        ) : option && chartLibReady ? (
          <ReactEChartsCore
            echarts={echarts}
            option={option}
            style={{ height: '100%', width: '100%', minHeight: 250 }}
            notMerge
            lazyUpdate
          />
        ) : option ? (
          <CircularProgress size={20} />
        ) : chartData ? (
          <Typography variant="body2" color="text.disabled">No data returned</Typography>
        ) : (
          <CircularProgress size={24} />
        )}
      </Box>
    </Box>
  );
}
