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

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ROWS_PER_PAGE } from "../datasetUtils";

interface TablePaginationProps {
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}

export default function TablePagination({
  total,
  page,
  onPageChange,
}: TablePaginationProps) {
  if (total <= ROWS_PER_PAGE) return null;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        py: 0.75,
        px: 2,
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "grey.50",
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontSize: "0.75rem" }}
      >
        {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, total)}{" "}
        of {total}
      </Typography>
      <IconButton
        size="small"
        aria-label="上一页"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        sx={{ ml: 1 }}
      >
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        aria-label="下一页"
        disabled={(page + 1) * ROWS_PER_PAGE >= total}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
