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

import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

interface DatasetEditNotificationsProps {
  success: boolean;
  error: string | null;
  onSuccessClose: () => void;
  onErrorClose: () => void;
}

export default function DatasetEditNotifications({
  success,
  error,
  onSuccessClose,
  onErrorClose,
}: DatasetEditNotificationsProps) {
  return (
    <>
      {success && (
        <Snackbar
          open
          autoHideDuration={3000}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          onClose={onSuccessClose}
        >
          <Alert
            severity="success"
            variant="filled"
            sx={{ borderRadius: 2 }}
            onClose={onSuccessClose}
          >
            数据集已保存
          </Alert>
        </Snackbar>
      )}
      {error && (
        <Snackbar
          open
          autoHideDuration={6000}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          onClose={onErrorClose}
        >
          <Alert
            severity="error"
            variant="filled"
            sx={{ borderRadius: 2 }}
            onClose={onErrorClose}
          >
            {error}
          </Alert>
        </Snackbar>
      )}
    </>
  );
}
