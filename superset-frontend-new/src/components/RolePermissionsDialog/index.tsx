import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import SecurityIcon from "@mui/icons-material/Security";
import rison from "rison";
import api from "@/api";
import {
  describePermission,
  describeResource,
  fetchPermissionViews,
  isDataAccessPerm,
  type PermissionViewEntry,
} from "@/utils/permissionDescriptions";

export interface RolePermissionsTarget {
  id: number;
  name: string;
  permissionIds?: number[];
}

let rolePermissionIdsCache: Promise<Map<number, number[]>> | null = null;

function fetchRolePermissionIds(): Promise<Map<number, number[]>> {
  if (!rolePermissionIdsCache) {
    rolePermissionIdsCache = api
      .get<{ result: { id: number; permission_ids: number[] }[] }>(
        `/security/roles/search/?q=${rison.encode({
          page_size: 200,
          page: 0,
        })}`,
      )
      .then((res) => {
        const map = new Map<number, number[]>();
        for (const role of res.data.result) {
          map.set(role.id, role.permission_ids ?? []);
        }
        return map;
      });
  }
  return rolePermissionIdsCache;
}

interface RolePermissionsContentProps {
  role: RolePermissionsTarget;
  compact?: boolean;
}

interface PermissionGroup {
  label: string;
  items: {
    key: string;
    name: string;
    description: string;
    rawViewMenu?: string;
  }[];
}

export function RolePermissionsContent({
  role,
  compact = false,
}: RolePermissionsContentProps) {
  const [permissionIds, setPermissionIds] = useState<number[] | null>(
    role.permissionIds ?? null,
  );
  const [loading, setLoading] = useState(!role.permissionIds);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMap, setViewMap] = useState<Map<number, PermissionViewEntry> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchPermissionViews()
      .then((m) => {
        if (!cancelled) setViewMap(m);
      })
      .catch(() => {
        if (!cancelled) setError("加载权限定义失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (role.permissionIds) {
      setPermissionIds(role.permissionIds);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchRolePermissionIds()
      .then((map) => {
        if (cancelled) return;
        setPermissionIds(map.get(role.id) ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("加载角色权限失败");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [role.id, role.permissionIds]);

  const groups = useMemo<PermissionGroup[]>(() => {
    if (!permissionIds || !viewMap) return [];
    const byResource = new Map<string, PermissionGroup>();
    for (const id of permissionIds) {
      const entry = viewMap.get(id);
      if (!entry) continue;
      const label = describeResource(entry.viewMenu);
      if (!byResource.has(label)) {
        byResource.set(label, { label, items: [] });
      }
      if (isDataAccessPerm(entry.viewMenu)) {
        byResource.get(label)!.items.push({
          key: `${entry.id}`,
          name: entry.permission,
          description: entry.viewMenu,
          rawViewMenu: entry.viewMenu,
        });
      } else {
        byResource.get(label)!.items.push({
          key: `${entry.id}`,
          name: entry.permission,
          description: describePermission(entry.permission),
        });
      }
    }
    for (const group of byResource.values()) {
      group.items.sort((a, b) =>
        a.description.localeCompare(b.description, "zh"),
      );
    }
    return [...byResource.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "zh"),
    );
  }, [permissionIds, viewMap]);

  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => {
        const items = g.items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.description.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q),
        );
        return items.length > 0 ? { ...g, items } : null;
      })
      .filter((g): g is PermissionGroup => !!g);
  }, [groups, searchTerm]);

  if (loading || !viewMap) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const total = groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {role.name}
        </Typography>
        <Chip label={`${total} 项权限`} size="small" color="primary" variant="outlined" />
        <Chip label={`${groups.length} 个资源`} size="small" variant="outlined" />
      </Box>
      <TextField
        size="small"
        fullWidth
        placeholder="搜索权限..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ "& .MuiOutlinedInput-root": { fontSize: "0.8125rem" } }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              </InputAdornment>
            ),
          },
        }}
      />
      {filteredGroups.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
          {searchTerm ? "没有匹配的权限" : "该角色暂无权限"}
        </Typography>
      ) : null}
      {filteredGroups.map((group) => (
        <Box key={group.label}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 0.75,
              mt: group === filteredGroups[0] ? 0 : 1.5,
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
            >
              {group.label}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {group.items.length} 项
            </Typography>
          </Box>
          {!compact && (
            <Divider sx={{ mb: 1 }} />
          )}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              maxHeight: compact ? "none" : 260,
              overflow: "auto",
            }}
          >
            {group.items.map((item) => (
              <Box
                key={item.key}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Chip
                  label={item.name}
                  size="small"
                  variant="outlined"
                  sx={{ minWidth: 0, flexShrink: 0 }}
                />
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    fontSize: "0.8125rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.description}
                >
                  {item.description}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
      {groups.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          该角色暂无权限。
        </Typography>
      )}
    </Box>
  );
}

interface RolePermissionsDialogProps {
  role: RolePermissionsTarget | null;
  onClose: () => void;
}

export default function RolePermissionsDialog({
  role,
  onClose,
}: RolePermissionsDialogProps) {
  return (
    <Dialog open={!!role} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SecurityIcon color="primary" />
          <Typography variant="h6">角色权限细则</Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {role && <RolePermissionsContent role={role} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}
