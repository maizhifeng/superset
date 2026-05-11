/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { forwardRef, type ReactElement, type ReactNode } from 'react';
import MuiTooltip from '@mui/material/Tooltip';

export type TooltipPlacement =
  | 'bottom-end'
  | 'bottom-start'
  | 'bottom'
  | 'left-end'
  | 'left-start'
  | 'left'
  | 'right-end'
  | 'right-start'
  | 'right'
  | 'top-end'
  | 'top-start'
  | 'top';

export interface TooltipProps {
  title: ReactNode;
  children: ReactElement;
  placement?: TooltipPlacement;
}

const SupersetTooltip = forwardRef<HTMLDivElement, TooltipProps>(
  ({ title, children, placement }, ref) => (
    <MuiTooltip ref={ref} title={title} placement={placement} arrow>
      {children}
    </MuiTooltip>
  ),
);

SupersetTooltip.displayName = 'SupersetTooltip';

export default SupersetTooltip;
