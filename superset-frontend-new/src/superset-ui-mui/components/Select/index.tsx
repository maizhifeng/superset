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
import MuiSelect, { SelectProps as MuiSelectProps } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<MuiSelectProps, 'placeholder'> {
  options: SelectOption[];
  placeholder?: string;
}

const SupersetSelect = forwardRef<HTMLDivElement, SelectProps>(
  ({ options, placeholder, children, ...rest }, ref) => (
    <MuiSelect ref={ref} displayEmpty={!!placeholder} {...rest}>
      {placeholder && (
        <MenuItem value="" disabled>
          {placeholder}
        </MenuItem>
      )}
      {options.map(({ value, label, disabled }) => (
        <MenuItem key={value} value={value} disabled={disabled}>
          {label}
        </MenuItem>
      ))}
      {children}
    </MuiSelect>
  ),
);

SupersetSelect.displayName = 'SupersetSelect';

export default SupersetSelect;
