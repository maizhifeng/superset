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
import MuiBreadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
}

export interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  separator?: ReactNode;
}

const SupersetBreadcrumb = forwardRef<HTMLDivElement, BreadcrumbProps>(
  ({ items, separator }, ref) => (
    <MuiBreadcrumbs ref={ref} separator={separator}>
      {items?.map(({ label, href, icon }, index) => {
        const isLast = index === (items?.length ?? 0) - 1;
        const content = (
          <>
            {icon}
            {label}
          </>
        );
        if (isLast) {
          return (
            <Typography key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} color="text.primary">
              {content}
            </Typography>
          );
        }
        return (
          <Link
            key={index}
            href={href}
            underline="hover"
            color="inherit"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            {content}
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  ),
);

SupersetBreadcrumb.displayName = 'SupersetBreadcrumb';

export default SupersetBreadcrumb;
