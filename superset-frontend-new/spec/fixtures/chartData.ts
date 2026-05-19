export const mockCharts = [
  {
    id: 1,
    slice_name: "Sales Over Time",
    viz_type: "line",
    created_by: { username: "admin" },
    changed_on_delta_humanized: "2 hours ago",
    datasource_name_text: "sales",
    datasource_type: "table",
    datasource_id: 1,
  },
  {
    id: 2,
    slice_name: "Revenue Breakdown",
    viz_type: "bar",
    created_by: { username: "admin" },
    changed_on_delta_humanized: "1 day ago",
    datasource_name_text: "revenue",
    datasource_type: "table",
    datasource_id: 2,
  },
  {
    id: 3,
    slice_name: "User Growth",
    viz_type: "line",
    created_by: { username: "user1" },
    changed_on_delta_humanized: "3 days ago",
    datasource_name_text: "users",
    datasource_type: "table",
    datasource_id: 3,
  },
];

export const mockPaginatedResponse = {
  result: mockCharts,
  count: 3,
};
