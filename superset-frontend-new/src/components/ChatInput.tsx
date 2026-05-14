import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SendIcon from '@mui/icons-material/Send';

interface ChatInputProps {
  placeholder?: string;
  onSend?: (value: string) => void;
}

export default function ChatInput({ placeholder = 'Ask about this dashboard...', onSend }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    if (value.trim() && onSend) {
      onSend(value.trim());
      setValue('');
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 400 }}>
      <TextField
        fullWidth
        size="small"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
        placeholder={placeholder}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 20,
            bgcolor: 'background.paper',
            height: 34,
            fontSize: '0.8125rem',
            '& fieldset': { borderColor: 'divider' },
            '&:hover fieldset': { borderColor: 'text.disabled' },
            '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: 1 },
          },
        }}
        slotProps={{
          input: {
            endAdornment: value.trim() ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleSend} sx={{ p: 0.25 }}>
                  <SendIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
    </Box>
  );
}
