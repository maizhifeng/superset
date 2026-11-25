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
import { Component, Fragment, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
  compact?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: number;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, resetKey: 0 };
  }

  handleRetry = () => {
    this.setState((state) => ({ error: null, resetKey: state.resetKey + 1 }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error, resetKey } = this.state;
    const { children, title, description, compact } = this.props;

    if (!error) {
      return <Fragment key={resetKey}>{children}</Fragment>;
    }

    return (
      <Box
        role="alert"
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          minHeight: compact ? 240 : "100vh",
          p: 4,
          textAlign: "center",
        }}
      >
        <ErrorOutlineIcon color="error" sx={{ fontSize: 40 }} />
        <Typography variant="h6">{title ?? "页面加载失败"}</Typography>
        <Typography variant="body2" color="text.secondary">
          {description ?? "页面渲染出现异常，请重试或重新加载页面。"}
        </Typography>
        {error.message && (
          <Typography variant="caption" color="text.disabled">
            {error.message}
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <Button variant="contained" onClick={this.handleRetry}>
            重试
          </Button>
          <Button variant="outlined" onClick={this.handleReload}>
            重新加载
          </Button>
        </Box>
      </Box>
    );
  }
}
