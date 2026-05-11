import { forwardRef, useState, type CSSProperties } from 'react';
import Box from '@mui/material/Box';

export interface ImageProps {
  src?: string;
  alt?: string;
  fallback?: string;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

const SupersetImage = forwardRef<HTMLDivElement, ImageProps>(
  ({ src, alt, fallback, width, height, style }, ref) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [hasError, setHasError] = useState(false);

    const handleError = () => {
      if (fallback && !hasError) {
        setImgSrc(fallback);
        setHasError(true);
      }
    };

    return (
      <Box ref={ref} sx={{ width, height }} style={style}>
        <img
          src={imgSrc}
          alt={alt}
          onError={handleError}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </Box>
    );
  },
);

SupersetImage.displayName = 'SupersetImage';

export default SupersetImage;
