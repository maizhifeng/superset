import { forwardRef, type ReactNode } from 'react';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Typography from '@mui/material/Typography';

export interface StepItem {
  title: ReactNode;
  description?: ReactNode;
  status?: 'wait' | 'process' | 'finish' | 'error';
}

export interface StepsProps {
  current?: number;
  items?: StepItem[];
  direction?: 'horizontal' | 'vertical';
}

const statusToStepProps: Record<
  NonNullable<StepItem['status']>,
  { active?: boolean; completed?: boolean; error?: boolean }
> = {
  wait: {},
  process: { active: true },
  finish: { completed: true },
  error: { error: true },
};

const SupersetSteps = forwardRef<HTMLDivElement, StepsProps>(
  ({ current, items, direction }, ref) => (
    <Stepper
      ref={ref}
      activeStep={current}
      orientation={direction ?? 'horizontal'}
    >
      {items?.map((item, index) => (
        <Step
          key={index}
          {...(item.status ? statusToStepProps[item.status] : {})}
        >
          <StepLabel
            optional={
              item.description ? (
                <Typography variant="caption">{item.description}</Typography>
              ) : undefined
            }
          >
            {item.title}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  ),
);

SupersetSteps.displayName = 'SupersetSteps';

export default SupersetSteps;
