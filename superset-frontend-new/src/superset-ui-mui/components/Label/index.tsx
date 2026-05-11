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
import { forwardRef } from 'react';
import MuiChip from '@mui/material/Chip';

export type LabelType = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface LabelProps {
  text?: string;
  color?: string;
  type?: LabelType;
}

const typeToColor: Record<LabelType, string> = {
  default: '#8c8c8c',
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
  info: '#1890ff',
};

const SupersetLabel = forwardRef<HTMLDivElement, LabelProps>(
  ({ text, color, type }, ref) => {
    const resolvedColor = color ?? (type ? typeToColor[type] : typeToColor.default);

    return (
      <MuiChip
        ref={ref}
        label={text}
        variant="outlined"
        size="small"
        sx={{
          color: resolvedColor,
          borderColor: resolvedColor,
          fontWeight: 500,
          fontSize: '0.75rem',
          height: 22,
          '& .MuiChip-label': {
            px: 1,
          },
        }}
      />
    );
  },
);

SupersetLabel.displayName = 'SupersetLabel';

export default SupersetLabel;
