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
import MuiCard, { CardProps as MuiCardProps } from '@mui/material/Card';
import MuiCardContent from '@mui/material/CardContent';
import MuiCardActions from '@mui/material/CardActions';

export interface CardProps extends Omit<MuiCardProps, 'title'> {
  title?: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode;
  hoverable?: boolean;
  loading?: boolean;
}

const SupersetCard = forwardRef<HTMLDivElement, CardProps>(
  ({ title, extra, actions, hoverable, loading, children, sx, ...rest }, ref) => {
    const hoverSx = hoverable
      ? {
          cursor: 'pointer',
          transition: 'box-shadow 0.3s, transform 0.3s',
          '&:hover': {
            boxShadow: 4,
            transform: 'translateY(-2px)',
          },
        }
      : undefined;

    const mergedSx = hoverSx ? { ...sx, ...hoverSx } : sx;

    if (loading) {
      return (
        <MuiCard ref={ref} sx={mergedSx} {...rest}>
          <MuiCardContent>
            <MuiCardContent sx={{ opacity: 0.3 }}>{children}</MuiCardContent>
          </MuiCardContent>
        </MuiCard>
      );
    }

    return (
      <MuiCard ref={ref} sx={mergedSx} {...rest}>
        {(title || extra) && (
          <MuiCardContent
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pb: 0,
            }}
          >
            {title && <span>{title}</span>}
            {extra && <span>{extra}</span>}
          </MuiCardContent>
        )}
        <MuiCardContent>{children}</MuiCardContent>
        {actions && (
          <MuiCardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
            {actions}
          </MuiCardActions>
        )}
      </MuiCard>
    );
  },
);

SupersetCard.displayName = 'SupersetCard';

export default SupersetCard;
