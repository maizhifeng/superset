import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

const EXAMPLES = [
  { label: 'revenue by month', query: 'revenue by month' },
  { label: 'top customers', query: 'top customers' },
  { label: 'sales trends', query: 'sales trends' },
  { label: 'user activity', query: 'user activity' },
  { label: 'forecast', query: 'forecast' },
];

interface SearchExamplesProps {
  onSelect: (query: string) => void;
}

export default function SearchExamples({ onSelect }: SearchExamplesProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5, px: 0.5 }}>
      {EXAMPLES.map(ex => (
        <Chip
          key={ex.query}
          label={ex.label}
          size="small"
          variant="outlined"
          onClick={() => onSelect(ex.query)}
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            borderColor: 'divider',
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
          }}
        />
      ))}
    </Box>
  );
}
