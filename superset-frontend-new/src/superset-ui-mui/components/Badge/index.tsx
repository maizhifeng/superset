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
import { forwardRef, type ReactNode } from 'react';
import MuiBadge from '@mui/material/Badge';

export type BadgeColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
export type BadgeSize = 'small' | 'medium' | 'large';
export type BadgeOverlap = 'rectangular' | 'circular';

export interface BadgeProps {
  count?: number;
  color?: BadgeColor;
  size?: BadgeSize;
  overlap?: BadgeOverlap;
  children?: ReactNode;
}

const sizeMap: Record<BadgeSize, { width: number; height: number; fontSize: number }> = {
  small: { width: 14, height: 14, fontSize: 10 },
  medium: { width: 18, height: 18, fontSize: 12 },
  large: { width: 22, height: 22, fontSize: 14 },
};

const SupersetBadge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ count, color, size, overlap, children }, ref) => {
    const sizeStyle = size ? sizeMap[size] : undefined;

    return (
      <MuiBadge
        ref={ref}
        badgeContent={count}
        color={color ?? 'primary'}
        overlap={overlap}
        sx={{
          ...(sizeStyle && {
            '& .MuiBadge-badge': {
              minWidth: sizeStyle.width,
              height: sizeStyle.height,
              fontSize: sizeStyle.fontSize,
            },
          }),
        }}
      >
        {children}
      </MuiBadge>
    );
  },
);

SupersetBadge.displayName = 'SupersetBadge';

export default SupersetBadge;
