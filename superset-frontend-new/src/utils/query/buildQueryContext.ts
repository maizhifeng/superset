import type { QueryContext, QueryObject } from "./types";
import { buildQueryObject } from "./extractQueryFields";

export function buildQueryContext(
  formData: Record<string, unknown>,
  vizType?: string,
): QueryContext {
  const datasourceStr = formData.datasource as string | undefined;
  let dsId = 0;
  let dsType: "table" = "table";
  if (datasourceStr) {
    const parts = datasourceStr.split("__");
    dsId = Number(parts[0]) || 0;
  }

  const queries: QueryObject[] = [buildQueryObject(formData, vizType)];

  return {
    datasource: { id: dsId, type: dsType },
    queries,
    form_data: formData,
    result_type: "full",
    result_format: "json",
    force: false,
  };
}
