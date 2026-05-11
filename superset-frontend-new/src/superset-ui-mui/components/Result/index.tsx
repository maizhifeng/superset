import { forwardRef, type ReactNode } from 'react';
import MuiBox from '@mui/material/Box';
import MuiTypography from '@mui/material/Typography';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmber from '@mui/icons-material/WarningAmber';
import ReportProblem from '@mui/icons-material/ReportProblem';
import SentimentDissatisfied from '@mui/icons-material/SentimentDissatisfied';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { SxProps, Theme } from '@mui/material/styles';

export type ResultStatus = 'success' | 'error' | 'info' | 'warning' | '404' | '403' | '500';

export interface ResultProps {
  status?: ResultStatus;
  title?: ReactNode;
  subTitle?: ReactNode;
  extra?: ReactNode;
}

const iconMap: Record<ResultStatus, { icon: React.ComponentType<SvgIconProps>; color: string }> = {
  success: { icon: CheckCircleOutlined, color: 'success.main' },
  error: { icon: ErrorOutlined, color: 'error.main' },
  info: { icon: InfoOutlined, color: 'info.main' },
  warning: { icon: WarningAmber, color: 'warning.main' },
  '404': { icon: ReportProblem, color: 'warning.main' },
  '403': { icon: SentimentDissatisfied, color: 'warning.main' },
  '500': { icon: ErrorOutlined, color: 'error.main' },
};

const SupersetResult = forwardRef<HTMLDivElement, ResultProps>(
  ({ status = 'info', title, subTitle, extra }, ref) => {
    const { icon: Icon, color } = iconMap[status];
    const iconSx: SxProps<Theme> = { fontSize: 72, color };

    return (
      <MuiBox
        ref={ref}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          py: 6,
          px: 2,
        }}
      >
        <Icon sx={iconSx} />
        {title && (
          <MuiTypography variant="h5" sx={{ mt: 2 }}>
            {title}
          </MuiTypography>
        )}
        {subTitle && (
          <MuiTypography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {subTitle}
          </MuiTypography>
        )}
        {extra && <MuiBox sx={{ mt: 3 }}>{extra}</MuiBox>}
      </MuiBox>
    );
  },
);

SupersetResult.displayName = 'SupersetResult';

export default SupersetResult;
