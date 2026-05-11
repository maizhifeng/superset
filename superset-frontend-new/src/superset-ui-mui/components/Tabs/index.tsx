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
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';

export interface TabItem {
  key: string;
  label: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  activeKey?: string;
  onChange?: (key: string) => void;
  items?: TabItem[];
  centered?: boolean;
}

const SupersetTabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ activeKey, onChange, items, centered }, ref) => (
    <div ref={ref}>
      <MuiTabs
        value={activeKey}
        onChange={(_event, value) => onChange?.(value)}
        centered={centered}
      >
        {items?.map(({ key, label, disabled }) => (
          <MuiTab key={key} value={key} label={label} disabled={disabled} />
        ))}
      </MuiTabs>
      {items?.map(({ key, children }) => (
        <div key={key} role="tabpanel" hidden={activeKey !== key}>
          {activeKey === key && children}
        </div>
      ))}
    </div>
  ),
);

SupersetTabs.displayName = 'SupersetTabs';

export default SupersetTabs;
