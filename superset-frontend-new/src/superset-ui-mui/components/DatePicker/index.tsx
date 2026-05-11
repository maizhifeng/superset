import { forwardRef } from 'react';
import { DatePicker as MuiDatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { type Dayjs } from 'dayjs';

export interface DatePickerProps {
  value?: string | null;
  onChange?: (value: string | null) => void;
  label?: string;
  disabled?: boolean;
  format?: string;
}

const SupersetDatePicker = forwardRef<HTMLDivElement, DatePickerProps>(
  ({ value, onChange, label, disabled, format = 'YYYY-MM-DD' }, ref) => {
    const dayjsValue = value ? dayjs(value, format) : null;

    const handleChange = (newValue: Dayjs | null) => {
      if (!onChange) return;
      onChange(newValue ? newValue.format(format) : null);
    };

    return (
      <MuiDatePicker
        ref={ref}
        value={dayjsValue}
        onChange={handleChange}
        label={label}
        disabled={disabled}
        format={format}
        slotProps={{ textField: { fullWidth: true } }}
      />
    );
  },
);

SupersetDatePicker.displayName = 'SupersetDatePicker';

export default SupersetDatePicker;
