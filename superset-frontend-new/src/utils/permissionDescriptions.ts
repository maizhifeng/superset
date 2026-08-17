import rison from "rison";
import api from "@/api";

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  can_read: "读取数据",
  can_write: "写入 / 修改",
  can_add: "新建",
  can_edit: "编辑",
  can_delete: "删除",
  can_list: "查看列表",
  can_show: "查看详情",
  can_get: "获取详情",
  can_post: "创建",
  can_put: "更新",
  can_info: "查看接口元信息",
  can_upload: "上传",
  can_download: "下载",
  can_export: "导出",
  can_import_: "导入",  can_duplicate: "复制",
  can_invalidate: "使缓存失效",
  can_warm_up_cache: "预热缓存",
  can_activate: "激活",
  can_userinfo: "查看用户信息",
  resetmypassword: "重置自己的密码",
  resetpasswords: "重置用户密码",
  userinfoedit: "编辑个人信息",
  copyrole: "复制角色",
  can_update_role_users: "更新角色成员",
  can_update_role_groups: "更新角色所属用户组",
  can_list_role_permissions: "查看角色权限",
  can_add_role_permissions: "添加角色权限",
  can_this_form_get: "读取表单",
  can_this_form_post: "提交表单",
  menu_access: "访问菜单",
  can_grant_guest_token: "授予访客令牌",
  can_list_roles: "查看角色列表",
  can_cache_dashboard_screenshot: "缓存仪表板截图",
  can_get_embedded: "读取嵌入配置",
  can_set_embedded: "设置嵌入配置",
  can_delete_embedded: "删除嵌入配置",
  can_export_as_example: "导出为示例",
  can_put_chart_customizations: "更新图表自定义配置",
  can_get_drill_info: "获取下钻信息",
  can_explore: "使用探索功能",
  can_explore_json: "探索接口（JSON）",
  can_dashboard: "访问仪表板",
  can_slice: "访问图表",
  can_dashboard_permalink: "仪表板永久链接",
  can_fetch_datasource_metadata: "获取数据源元数据",
  can_query: "查询数据",
  can_query_form_data: "查询表单数据",
  can_time_range: "获取时间范围",
  can_content: "访问内容",
  can_save: "保存",
  can_samples: "获取示例数据",
  can_log: "查看日志",
  can_tags: "管理标签",
  can_tag: "打标签",
  can_get_column_values: "获取列值",
  can_combined_list: "组合列表",
  can_compatible: "兼容性检查",
  can_get_or_create_dataset: "获取或创建数据集",
  can_views: "查看视图",
  can_connections: "查看连接",
  can_bulk_create: "批量创建",
  can_file_handler: "文件处理",
  can_language_pack: "获取语言包",
  can_expanded: "展开视图",
  can_drill: "图表下钻",
  can_view_chart_as_table: "以表格查看图表",
  can_share_dashboard: "分享仪表板",
  can_share_chart: "分享图表",
  can_sqllab: "使用 SQL 实验室",
  can_view_query: "查看查询",
  can_delete_query: "删除查询",
  can_migrate_query: "迁移查询",
  can_sqllab_history: "查看执行历史",
  can_recent_activity: "查看最近活动",
  can_execute_sql_query: "执行 SQL",
  can_get_results: "获取查询结果",
  can_estimate_query_cost: "估算查询成本",
  can_format_sql: "格式化 SQL",
  can_validate_expression: "校验表达式",
  can_external_metadata: "读取外部元数据",
  can_external_metadata_by_name: "按名称读取外部元数据",
  all_datasource_access: "访问所有数据源",
  all_database_access: "访问所有数据库",
  all_query_access: "访问所有查询",
  database_access: "数据库访问权限",
  datasource_access: "数据集访问权限",
  schema_access: "Schema 访问权限",
  catalog_access: "Catalog 访问权限",
  can_csv: "导出 CSV",
  can_export_data: "导出数据",
  can_export_csv: "导出 CSV",
  can_export_image: "导出图片",
  can_export_streaming_csv: "流式导出 CSV",
  can_copy_clipboard: "复制到剪贴板",
  can_get_list: "获取列表",
};

export const RESOURCE_LABELS: Record<string, string> = {
  Dashboard: "仪表板",
  Chart: "图表",
  Dataset: "数据集",
  Database: "数据库",
  SavedQuery: "已保存查询",
  Query: "查询",
  ReportSchedule: "定时报表",
  Annotation: "注解层",
  CssTemplate: "CSS 模板",
  Log: "日志",
  User: "用户",
  Role: "角色",
  Group: "用户组",
  Permission: "权限",
  ViewMenu: "视图菜单",
  PermissionViewMenu: "权限视图关联",
  OpenApi: "OpenAPI",
  OpenAPI: "OpenAPI",
  Home: "首页",
  Manage: "管理",
  Plugins: "插件",
  Extensions: "扩展",
  ExtensionsRestApi: "扩展 API",
  ImportExportRestApi: "导入导出 API",
  DynamicPlugin: "动态插件",
  EmbeddedDashboard: "嵌入仪表板",
  Explore: "探索",
  ExploreFormDataRestApi: "探索表单数据 API",
  ExplorePermalinkRestApi: "探索永久链接 API",
  SqlLabPermalinkRestApi: "SQL Lab 永久链接 API",
  TableSchemaView: "表结构视图",
  TabStateView: "标签页状态",
  Tag: "标签",
  Tags: "标签",
  TagView: "标签视图",
  Task: "任务",
  Tasks: "任务",
  Themes: "主题菜单",
  "Action Log": "操作日志",
  "Alerts & Report": "告警与报表",
  "Annotation Layers": "注解层菜单",
  Charts: "图表菜单",
  "CSS Templates": "CSS 模板菜单",
  Dashboards: "仪表板菜单",
  Data: "数据菜单",
  Databases: "数据库菜单",
  Datasets: "数据集菜单",
  Datasource: "数据源",
  Api: "API",
  SQLLab: "SQL 实验室",
  "SQL Lab": "SQL 实验室菜单",
  "SQL Editor": "SQL 编辑器菜单",
  Superset: "Superset 核心",
  security: "安全",
  Security: "安全菜单",
  SecurityRestApi: "安全 API",
  RoleRestAPI: "角色 API",
  RowLevelSecurity: "行级安全",
  "Row Level Security": "行级安全",
  SemanticLayer: "语义层",
  SemanticView: "语义视图",
  "Saved Queries": "已保存查询菜单",
  "Query Search": "查询搜索",
  "List Groups": "用户组列表",
  "List Roles": "角色列表",
  "List Users": "用户列表",
  "User Registrations": "用户注册",
  UserRegistrationsRestAPI: "用户注册 API",
  user: "用户",
  SwaggerView: "Swagger 文档",
  MenuApi: "菜单 API",
  AsyncEventsRestApi: "异步事件 API",
  AdvancedDataType: "高级数据类型",
  AvailableDomains: "可用域名",
  CacheRestApi: "缓存 API",
  Theme: "主题",
  CurrentUserRestApi: "当前用户 API",
  DashboardFilterStateRestApi: "仪表板过滤器状态 API",
  DashboardPermalinkRestApi: "仪表板永久链接 API",
  UserDBModelView: "用户管理",
  RoleModelView: "角色管理",
  UserGroupModelView: "用户组管理",
  UserInfoEditView: "个人信息编辑",
  ResetPasswordView: "重置密码",
  ResetMyPasswordView: "重置我的密码",
  all_datasource_access: "全局数据权限",
  all_database_access: "全局数据权限",
  all_query_access: "全局数据权限",
};

const GLOBAL_DATA_PERMS = new Set([
  "all_datasource_access",
  "all_database_access",
  "all_query_access",
]);

export interface PermissionViewEntry {
  id: number;
  permission: string;
  viewMenu: string;
}

let permissionViewsCache: Promise<Map<number, PermissionViewEntry>> | null =
  null;

export function fetchPermissionViews(): Promise<
  Map<number, PermissionViewEntry>
> {
  if (!permissionViewsCache) {
    permissionViewsCache = (async () => {
      const map = new Map<number, PermissionViewEntry>();
      let page = 0;
      for (;;) {
        const res = await api.get<{
          result: {
            id: number;
            permission: { name: string };
            view_menu: { name: string };
          }[];
          count: number;
        }>(
          `/security/permissions-resources/?q=${rison.encode({
            page_size: 100,
            page,
          })}`,
        );
        const { result, count } = res.data;
        for (const item of result) {
          map.set(item.id, {
            id: item.id,
            permission: item.permission.name,
            viewMenu: item.view_menu.name,
          });
        }
        if ((page + 1) * 100 >= count) break;
        page += 1;
      }
      return map;
    })();
  }
  return permissionViewsCache;
}

export function describePermission(permission: string): string {
  return PERMISSION_DESCRIPTIONS[permission] ?? permission;
}

export function describeResource(viewMenu: string): string {
  if (GLOBAL_DATA_PERMS.has(viewMenu)) return "全局数据权限";
  if (viewMenu.startsWith("[")) return "数据访问权限";
  return RESOURCE_LABELS[viewMenu] ?? viewMenu;
}

export function isDataAccessPerm(viewMenu: string): boolean {
  return GLOBAL_DATA_PERMS.has(viewMenu) || viewMenu.startsWith("[");
}
