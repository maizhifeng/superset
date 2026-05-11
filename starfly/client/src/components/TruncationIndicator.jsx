import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import AlertTriangleIcon from '@mui/icons-material/ReportProblem';
import { Badge } from '@/components/ui/badge';
import { formatDisplayValue } from '@/utils/formatters';

export default function TruncationIndicator({ truncated, totalRowCount, rowCount, limitUsed, onExtendLimit, extendedLimitEnabled, warning }) {
  if (!truncated) return null;

  const extendedLimit = limitUsed * 5;

  return (
    <Alert severity="warning" icon={<AlertTriangleIcon fontSize="small" />} sx={{ mb: 1, py: 0.5, fontSize: '0.75rem' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 500, fontSize: '0.75rem' }}>数据已截断</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>显示 {formatDisplayValue(rowCount)} / {formatDisplayValue(totalRowCount)} 行</Typography>
        {!extendedLimitEnabled && (
          <Button size="small" variant="outlined" sx={{ ml: 'auto', px: 1, py: 0, fontSize: '0.6875rem', minHeight: 20 }} onClick={onExtendLimit}>加载更多 ({formatDisplayValue(extendedLimit)} 行)</Button>
        )}
        {extendedLimitEnabled && <Badge variant="warning">已扩展上限</Badge>}
        {warning && <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>{warning}</Typography>}
      </Box>
    </Alert>
  );
}
