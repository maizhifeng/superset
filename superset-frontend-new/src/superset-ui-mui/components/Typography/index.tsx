import MuiTypography, { TypographyProps as MuiTypographyProps } from '@mui/material/Typography';

export interface TypographyProps extends MuiTypographyProps {
  weight?: number | string;
}

export default function Typography({ weight, sx, ...rest }: TypographyProps) {
  return (
    <MuiTypography
      sx={{
        fontWeight: weight,
        ...sx,
      }}
      {...rest}
    />
  );
}

export type { TypographyProps as MuiTypographyProps };
