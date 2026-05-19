import { forwardRef } from "react";
import MuiSkeleton from "@mui/material/Skeleton";
import type { SkeletonProps as MuiSkeletonProps } from "@mui/material/Skeleton";

export interface SkeletonProps extends MuiSkeletonProps {}

const SupersetSkeleton = forwardRef<HTMLSpanElement, SkeletonProps>(
  (props, ref) => <MuiSkeleton ref={ref} {...props} />,
);

SupersetSkeleton.displayName = "SupersetSkeleton";

export default SupersetSkeleton;
