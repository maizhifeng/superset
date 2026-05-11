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
import MuiCheckbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import type { CheckboxProps as MuiCheckboxProps } from '@mui/material/Checkbox';

export interface CheckboxProps extends MuiCheckboxProps {
  label?: string;
}

const SupersetCheckbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ label, ...rest }, ref) => {
    if (label) {
      return (
        <FormControlLabel
          control={<MuiCheckbox ref={ref} {...rest} />}
          label={label}
        />
      );
    }
    return <MuiCheckbox ref={ref} {...rest} />;
  },
);

SupersetCheckbox.displayName = 'SupersetCheckbox';

export default SupersetCheckbox;
