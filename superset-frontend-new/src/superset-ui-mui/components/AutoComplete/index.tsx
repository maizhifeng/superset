import { forwardRef } from 'react';
import MuiAutocomplete from '@mui/material/Autocomplete';
import MuiTextField from '@mui/material/TextField';

export interface AutoCompleteOption {
  value: string | number;
  label: string;
}

export interface AutoCompleteProps {
  value?: AutoCompleteOption | AutoCompleteOption[] | null;
  onChange?: (value: AutoCompleteOption | AutoCompleteOption[] | null) => void;
  options: string[] | AutoCompleteOption[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  freeSolo?: boolean;
  multiple?: boolean;
}

function isStringArray(items: string[] | AutoCompleteOption[]): items is string[] {
  return items.length > 0 && typeof items[0] === 'string';
}

function normalizeOptions(items: string[] | AutoCompleteOption[]): AutoCompleteOption[] {
  if (isStringArray(items)) {
    return items.map(item => ({ value: item, label: item }));
  }
  return items;
}

const SupersetAutoComplete = forwardRef<HTMLInputElement, AutoCompleteProps>(
  (
    { value, onChange, options, placeholder, disabled, loading, freeSolo, multiple },
    ref,
  ) => {
    const normalizedOptions = normalizeOptions(options);

    return (
      <MuiAutocomplete
        ref={ref}
        value={value ?? (multiple ? [] : null) as any}
        onChange={(_event, newValue) => {
          if (!onChange) return;
          if (!newValue) {
            onChange(null);
            return;
          }
          if (Array.isArray(newValue)) {
            const mapped = newValue.map(v =>
              typeof v === 'string' ? { value: v, label: v } : v,
            );
            onChange(mapped);
          } else {
            const mapped =
              typeof newValue === 'string'
                ? { value: newValue, label: newValue }
                : newValue;
            onChange(mapped);
          }
        }}
        options={normalizedOptions}
        getOptionLabel={(option: string | AutoCompleteOption) =>
          typeof option === 'string' ? option : option.label
        }
        isOptionEqualToValue={(option: string | AutoCompleteOption, val: string | AutoCompleteOption) =>
          typeof option === 'string'
            ? option === (typeof val === 'string' ? val : val.value)
            : option.value === (typeof val === 'string' ? val : val.value)
        }
        renderInput={params => (
          <MuiTextField
            {...params}
            placeholder={placeholder}
            disabled={disabled}
          />
        )}
        disabled={disabled}
        loading={loading}
        freeSolo={freeSolo}
        multiple={multiple}
        size="small"
      />
    );
  },
);

SupersetAutoComplete.displayName = 'SupersetAutoComplete';

export default SupersetAutoComplete;
