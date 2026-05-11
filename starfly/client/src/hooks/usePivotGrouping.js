import { useMemo } from 'react';

// ============================================================
// 透视分组工具函数和 Hook
// 用于将行数据按照维度字段构建树形结构，支持折叠/展开
// ============================================================

/**
 * 递归构建分组树
 * @param {Array} rows - 原始数据行
 * @param {string[]} dimNames - 维度字段名称数组
 * @param {number} dimIndex - 当前处理的维度层级索引
 * @param {string} parentKey - 父节点 key，用于构建层级唯一标识
 */
function buildTree(rows, dimNames, dimIndex, parentKey) {
  // 到达最后一层维度时，将剩余数据作为叶子节点
  if (dimIndex >= dimNames.length) {
    return rows.map((row, i) => ({
      type: 'leaf',
      depth: dimIndex,
      key: `${parentKey}/leaf-${i}`,
      label: String(row[dimNames[dimNames.length - 1]] ?? '(空)'),
      row,
    }));
  }

  const dimName = dimNames[dimIndex];
  // 按当前维度字段值分组
  const groups = new Map();

  for (const row of rows) {
    const value = row[dimName] != null ? String(row[dimName]) : '(空)';
    if (!groups.has(value)) {
      groups.set(value, []);
    }
    groups.get(value).push(row);
  }

  // 为每个分组递归构建子树
  const result = [];
  for (const [value, groupRows] of groups) {
    const key = parentKey ? `${parentKey}/${value}` : value;
    const children = buildTree(groupRows, dimNames, dimIndex + 1, key);

    result.push({
      type: 'group',
      depth: dimIndex,
      key,
      label: value,
      children,
      rowCount: groupRows.length,
    });
  }

  // 按标签排序，保证展示顺序一致
  result.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { sensitivity: 'base' }));

  return result;
}

/**
 * 递归汇总指定指标的值
 * @param {object} node - 树节点
 * @param {string} metricName - 指标字段名称
 */
function sumMetric(node, metricName) {
  if (node.type === 'leaf') {
    const val = node.row[metricName];
    return typeof val === 'number' ? val : 0;
  }
  let sum = 0;
  for (const child of node.children) {
    sum += sumMetric(child, metricName);
  }
  return sum;
}

/**
 * 计算节点下所有指标的汇总值
 * @param {object} node - 树节点
 * @param {string[]} metricNames - 指标字段名称数组
 */
function computeAggregated(node, metricNames) {
  const aggregated = {};
  for (const metricName of metricNames) {
    aggregated[metricName] = sumMetric(node, metricName);
  }
  return aggregated;
}

/**
 * 将树形结构展开为扁平行，同时考虑折叠状态和隐藏层级
 * @param {Array} tree - 树形数据
 * @param {string[]} metricNames - 指标字段名称数组
 * @param {Set} collapsedGroups - 已折叠的分组 key 集合
 * @param {Set} hiddenDepths - 已隐藏的深度层级集合
 */
function flattenTree(tree, metricNames, collapsedGroups, hiddenDepths) {
  const result = [];

  function walk(node) {
    // 叶子节点：若不在隐藏深度中，则加入结果
    if (node.type === 'leaf') {
      if (!hiddenDepths || !hiddenDepths.has(node.depth)) result.push(node);
      return;
    }

    // 分组节点：若深度被隐藏则跳过
    const isHidden = hiddenDepths && hiddenDepths.has(node.depth);
    if (isHidden) return;

    const isCollapsed = collapsedGroups.has(node.key);
    const aggregated = computeAggregated(node, metricNames);

    const leafChildren = node.children.filter(c => c.type === 'leaf');
    const subGroupChildren = node.children.filter(c => c.type === 'group');
    const hasChildren = subGroupChildren.length > 0;

    // 输出分组行（含汇总数据）
    result.push({
      type: node.type,
      depth: node.depth,
      key: node.key,
      label: node.label,
      _aggregated: aggregated,
      _hasChildren: hasChildren,
    });

    // 未折叠时递归输出子节点
    if (!isCollapsed) {
      for (const child of subGroupChildren) {
        walk(child);
      }
      // 跃过单个叶子子节点：当分组只有 1 个叶子且无子分组时，
      // 叶子行与分组行视觉上冗余，故省略
      if (leafChildren.length !== 1 || subGroupChildren.length > 0) {
        for (const child of leafChildren) {
          walk(child);
        }
      }
    }
  }

  for (const child of tree) {
    walk(child);
  }

  return result;
}

/**
 * 透视分组 Hook
 * 根据维度字段对数据行进行分组，构建树并展开为可折叠的扁平列表
 * @param {Array} rows - 原始数据行
 * @param {Array} dimensionFields - 维度字段定义
 * @param {Array} metricFields - 指标字段定义
 * @param {Set} collapsedGroups - 已折叠的分组 key 集合
 * @param {Set} hiddenDepths - 已隐藏的深度层级集合
 */
export function usePivotGrouping(rows, dimensionFields, metricFields, collapsedGroups, hiddenDepths) {
  return useMemo(() => {
    const dimFields = dimensionFields || [];
    const metFields = metricFields || [];
    const data = rows || [];

    // 没有维度字段或没有数据时返回空
    if (dimFields.length === 0 || data.length === 0) {
      return { tree: null, flatRows: [] };
    }

    const dimNames = dimFields.map(f => f.name);
    const metricNames = metFields.map(f => f.name);

    // 构建树形结构并展开为扁平行
    const tree = buildTree(data, dimNames, 0, '');
    const flatRows = flattenTree(tree, metricNames, collapsedGroups || new Set(), hiddenDepths);

    return { tree, flatRows };
  }, [rows, dimensionFields, metricFields, collapsedGroups, hiddenDepths]);
}

export default usePivotGrouping;
