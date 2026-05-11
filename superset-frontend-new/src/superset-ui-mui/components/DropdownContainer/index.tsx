import {
  forwardRef,
  useState,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import Popover from '@mui/material/Popover';

type DropdownPlacement =
  | 'bottomLeft'
  | 'bottomRight'
  | 'bottomCenter'
  | 'topLeft'
  | 'topRight'
  | 'topCenter';

export interface DropdownContainerProps {
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  overlay?: ReactNode;
  children: ReactElement;
  placement?: DropdownPlacement;
}

type Origin = { vertical: 'top' | 'bottom' | 'center'; horizontal: 'left' | 'right' | 'center' };

const placementOriginMap: Record<DropdownPlacement, { anchorOrigin: Origin; transformOrigin: Origin }> = {
  bottomLeft: {
    anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
    transformOrigin: { vertical: 'top', horizontal: 'left' },
  },
  bottomRight: {
    anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
    transformOrigin: { vertical: 'top', horizontal: 'right' },
  },
  bottomCenter: {
    anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
    transformOrigin: { vertical: 'top', horizontal: 'center' },
  },
  topLeft: {
    anchorOrigin: { vertical: 'top', horizontal: 'left' },
    transformOrigin: { vertical: 'bottom', horizontal: 'left' },
  },
  topRight: {
    anchorOrigin: { vertical: 'top', horizontal: 'right' },
    transformOrigin: { vertical: 'bottom', horizontal: 'right' },
  },
  topCenter: {
    anchorOrigin: { vertical: 'top', horizontal: 'center' },
    transformOrigin: { vertical: 'bottom', horizontal: 'center' },
  },
};

const SupersetDropdownContainer = forwardRef<HTMLDivElement, DropdownContainerProps>(
  ({ visible, onVisibleChange, overlay, children, placement }, ref) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      children.props.onClick?.(event);
      setAnchorEl(event.currentTarget);
      onVisibleChange?.(!visible);
    };

    const trigger = cloneElement(children, {
      onClick: handleClick,
    });

    const origin = placementOriginMap[placement ?? 'bottomLeft'];

    return (
      <div ref={ref}>
        {trigger}
        <Popover
          open={Boolean(visible && anchorEl)}
          anchorEl={anchorEl}
          onClose={() => onVisibleChange?.(false)}
          anchorOrigin={origin.anchorOrigin}
          transformOrigin={origin.transformOrigin}
        >
          {overlay}
        </Popover>
      </div>
    );
  },
);

SupersetDropdownContainer.displayName = 'SupersetDropdownContainer';

export default SupersetDropdownContainer;
