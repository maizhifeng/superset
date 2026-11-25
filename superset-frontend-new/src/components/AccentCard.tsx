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

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

interface AccentCardProps {
  onClick: () => void;
  icon?: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}

export default function AccentCard({
  onClick,
  icon,
  title,
  description,
  children,
}: AccentCardProps) {
  return (
    <Card
      component="button"
      type="button"
      aria-label={`${title}：${description}`}
      onClick={onClick}
      sx={{
        position: "relative",
        height: "100%",
        p: 3,
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
        textAlign: "left",
        appearance: "none",
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "var(--mui-palette-shadow-cardHover)",
        },
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 1.5,
            bgcolor: "action.hover",
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
      {children}
    </Card>
  );
}
