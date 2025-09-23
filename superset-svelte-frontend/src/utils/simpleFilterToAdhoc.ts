import type {
  AdhocFilter,
  AdhocColumn,
  BinaryQueryObjectFilterClause,
  QueryFormColumn,
  SimpleAdhocFilter,
} from '@superset-ui/core';

function isAdhocColumn(column: QueryFormColumn): column is AdhocColumn {
  return typeof column === 'object' && column !== null && 'sqlExpression' in column;
}

export function simpleFilterToAdhoc(
  filter: BinaryQueryObjectFilterClause,
): AdhocFilter {
  const { col, op, val } = filter;

  if (isAdhocColumn(col)) {
    return {
      expressionType: 'SQL',
      clause: 'WHERE',
      sqlExpression: `(${col.sqlExpression}) ${op} ${JSON.stringify(val)}`,
    };
  }

  const result: SimpleAdhocFilter = {
    expressionType: 'SIMPLE',
    clause: 'WHERE',
    subject: col,
    operator: op,
    comparator: String(val),
  };
  return result;
}