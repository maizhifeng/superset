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
import MuiAvatar from '@mui/material/Avatar';

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: number;
  children?: ReactNode;
}

const SupersetAvatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, size, children }, ref) => (
    <MuiAvatar
      ref={ref}
      src={src}
      alt={alt}
      sx={{
        ...(size !== undefined && {
          width: size,
          height: size,
          fontSize: size * 0.4,
        }),
      }}
    >
      {children}
    </MuiAvatar>
  ),
);

SupersetAvatar.displayName = 'SupersetAvatar';

export default SupersetAvatar;
