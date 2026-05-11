import { forwardRef, useRef, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

export interface UploadProps {
  onUpload?: (file: File) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  showPreview?: boolean;
}

const SupersetUpload = forwardRef<HTMLDivElement, UploadProps>(
  ({ onUpload, accept, multiple, disabled, children, showPreview }, ref) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewRef = useRef<string | null>(null);

    const handleClick = () => {
      fileInputRef.current?.click();
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      if (multiple) {
        for (let i = 0; i < files.length; i++) {
          onUpload?.(files[i]);
        }
      } else {
        const file = files[0];
        if (showPreview) {
          previewRef.current = URL.createObjectURL(file);
        }
        onUpload?.(file);
      }

      event.target.value = '';
    };

    return (
      <Box ref={ref}>
        {children ? (
          <Box onClick={handleClick}>{children}</Box>
        ) : (
          <Button
            variant="outlined"
            component="span"
            disabled={disabled}
            onClick={handleClick}
          >
            Upload
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        {showPreview && previewRef.current && (
          <Box sx={{ mt: 1 }}>
            <Box
              component="img"
              src={previewRef.current}
              alt="Preview"
              sx={{ maxWidth: 200, maxHeight: 200, borderRadius: 1 }}
            />
          </Box>
        )}
      </Box>
    );
  },
);

SupersetUpload.displayName = 'SupersetUpload';

export default SupersetUpload;
