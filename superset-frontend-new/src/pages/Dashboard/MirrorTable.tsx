import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Chip from '@mui/material/Chip';
import DataPreviewTable from '@/components/DataPreviewTable';
import type { CompareDimension } from '@/pages/Dashboard/ChartCard';

interface MirrorTableProps {
  dimensions: CompareDimension[];
  data?: Record<string, unknown>;
  onClose: () => void;
}

export default function MirrorTable({ dimensions, data, onClose }: MirrorTableProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
          px: 1.5, py: 0.5, bgcolor: 'primary.50',
          borderTop: '1px solid', borderBottom: '1px solid',
          borderColor: 'primary.200',
          flexShrink: 0,
        }}
      >
        <FilterAltIcon sx={{ fontSize: 14, color: 'primary.700' }} />
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.700' }}>
          Comparing by:
        </Typography>
        {dimensions.map((d, i) => (
          <Chip
            key={i}
            label={`${d.dimension} IN (${d.values.join(', ')})`}
            size="small"
            variant="outlined"
            sx={{ fontSize: 11, color: 'primary.700', borderColor: 'primary.300' }}
          />
        ))}
        <IconButton size="small" onClick={onClose} sx={{ p: 0.25, ml: 'auto' }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <DataPreviewTable data={data} maxRows={100} />
      </Box>
    </Box>
  );
}
