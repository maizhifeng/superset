// ============================================================
// 日期字段检测配置 - 用于自动识别表中适合时序分析的日期字段
// ============================================================

/**
 * 日期字段检测配置
 * 用于自动识别表中适合时序分析的日期字段
 */

/**
 * 高优先级日期字段名模式
 * 这些字段通常是表的主要时间维度
 */
export const PRIMARY_DATE_FIELD_PATTERNS = [
  'date',
  'time',
  'datetime',
  'timestamp',
  'created_time',
  'record_time',
  'log_time',
  'event_time',
  'transaction_time',
  'order_time',
  'purchase_time',
  'install_date',
  'signup_date',
  'registration_date',
  'visit_date',
  'session_date',
  'activity_date',
  'action_date',
  'start_date',  // 安装日期、活动开始日期等是事件发生时间，优先级高于 created_at
];

/**
 * 中优先级日期字段名模式
 * 可能是时序数据，但需要根据上下文判断
 */
export const SECONDARY_DATE_FIELD_PATTERNS = [
  'created_at',
  'updated_at',
  'modified_at',
  'logged_at',
  'recorded_at',
  'occurred_at',
  'happened_at',
  'started_at',
  'ended_at',
  'published_at',
  'sent_at',
  'received_at',
  'end_date',  // 结束日期在某些场景也可能是时序维度，但优先级低于 start_date
];

/**
 * 排除的日期字段名模式
 * 这些字段不适合作为时序分析的主要时间维度
 */
export const EXCLUDED_DATE_FIELD_PATTERNS = [
  'begin_date',
  'finish_date',
  'due_date',
  'deadline',
  'expiry_date',
  'expiration_date',
  'birth_date',
  'birthday',
  'death_date',
  ' wedding_date',
  'hire_date',
  'termination_date',
  'effective_date',
  'valid_from',
  'valid_to',
  'last_login',
  'last_seen',
  'last_active',
  'last_updated',
  'last_modified',
  'next_date',
  'scheduled_date',
  'planned_date',
  'target_date',
  'milestone_date',
  'release_date',
  'launch_date',
];

/**
 * 支持的日期/时间数据类型
 */
export const DATE_DATA_TYPES = [
  'date',
  'timestamp',
  'timestamp without time zone',
  'timestamp with time zone',
  'timestamptz',
  'datetime',
  'smalldatetime',
  'time',
  'time without time zone',
  'time with time zone',
];

/**
 * 字段名称匹配优先级权重
 */
export const FIELD_NAME_WEIGHTS = {
  exactMatch: 10,      // 完全匹配 PRIMARY_DATE_FIELD_PATTERNS
  prefixMatch: 8,      // 以 PRIMARY 模式开头（如 date_2024）
  suffixMatch: 7,      // 以 PRIMARY 模式结尾（如 record_date）
  secondaryMatch: 5,   // 匹配 SECONDARY_DATE_FIELD_PATTERNS
  containsDate: 3,     // 包含 'date' 或 'time' 关键词
  excluded: 0,         // 匹配 EXCLUDED_DATE_FIELD_PATTERNS
};

/**
 * 检测字段名是否匹配日期模式
 * @param {string} fieldName - 字段名（小写）
 * @param {string[]} patterns - 模式列表
 * @returns {boolean} 是否匹配
 */
export function matchesPattern(fieldName, patterns) {
  const normalized = fieldName.toLowerCase().replace(/_/g, '');
  return patterns.some(pattern => {
    const normalizedPattern = pattern.toLowerCase().replace(/_/g, '');
    return normalized === normalizedPattern ||
           normalized.startsWith(normalizedPattern) ||
           normalized.endsWith(normalizedPattern) ||
           normalized.includes(normalizedPattern);
  });
}

/**
 * 计算字段名作为日期维度的优先级分数
 * @param {string} fieldName - 字段名
 * @returns {number} 优先级分数（越高越适合作为主日期字段）
 */
export function calculateDateFieldScore(fieldName) {
  const normalized = fieldName.toLowerCase();

  // 排除字段返回 0
  if (matchesPattern(normalized, EXCLUDED_DATE_FIELD_PATTERNS)) {
    return FIELD_NAME_WEIGHTS.excluded;
  }

  // 高优先级匹配
  if (PRIMARY_DATE_FIELD_PATTERNS.includes(normalized)) {
    return FIELD_NAME_WEIGHTS.exactMatch;
  }

  if (matchesPattern(normalized, PRIMARY_DATE_FIELD_PATTERNS)) {
    return FIELD_NAME_WEIGHTS.prefixMatch;
  }

  // 中优先级匹配
  if (SECONDARY_DATE_FIELD_PATTERNS.includes(normalized)) {
    return FIELD_NAME_WEIGHTS.secondaryMatch;
  }

  if (matchesPattern(normalized, SECONDARY_DATE_FIELD_PATTERNS)) {
    return FIELD_NAME_WEIGHTS.secondaryMatch;
  }

  // 包含关键词
  if (normalized.includes('date') || normalized.includes('time')) {
    return FIELD_NAME_WEIGHTS.containsDate;
  }

  return 0;
}

/**
 * 检测数据类型是否为日期类型
 * @param {string} dataType - 数据类型
 * @returns {boolean} 是否为日期类型
 */
export function isDateDataType(dataType) {
  if (!dataType) return false;
  const normalized = dataType.toLowerCase();
  return DATE_DATA_TYPES.some(dt => normalized.includes(dt));
}

/**
 * 从列信息中检测最合适的日期字段
 * @param {Object[]} columns - 列信息数组
 * @param {string} primaryDateField - 明确指定的主日期字段（可选）
 * @returns {Object|null} 检测到的日期字段信息 { name, score, dataType }
 */
export function detectDateField(columns, primaryDateField = null) {
  if (!columns || columns.length === 0) return null;

  // 如果明确指定了主日期字段，验证并使用
  if (primaryDateField) {
    const column = columns.find(c => c.column_name === primaryDateField);
    if (column && (isDateDataType(column.data_type) || column.is_date)) {
      return {
        name: primaryDateField,
        score: FIELD_NAME_WEIGHTS.exactMatch,
        dataType: column.data_type,
        isExplicit: true,
      };
    }
  }

  // 自动检测 — 包含标准日期类型 + 手动标记为日期的字段
  const dateColumns = columns
    .filter(c => isDateDataType(c.data_type) || c.is_date)
    .map(c => ({
      name: c.column_name,
      score: c.is_date ? FIELD_NAME_WEIGHTS.exactMatch : calculateDateFieldScore(c.column_name),
      dataType: c.data_type,
      isExplicit: c.is_date || false,
    }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return dateColumns[0] || null;
}

/**
 * 获取所有适合作为维度的日期字段
 * @param {Object[]} columns - 列信息数组
 * @returns {Object[]} 所有日期字段（按优先级排序）
 */
export function getAllDateFields(columns) {
  if (!columns || columns.length === 0) return [];

  return columns
    .filter(c => isDateDataType(c.data_type) || c.is_date)
    .map(c => ({
      name: c.column_name,
      score: c.is_date ? FIELD_NAME_WEIGHTS.exactMatch : calculateDateFieldScore(c.column_name),
      dataType: c.data_type,
    }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * 判断字段是否适合用于时序图表
 * @param {string} fieldName - 字段名
 * @param {string} dataType - 数据类型
 * @returns {boolean} 是否适合
 */
export function isSuitableForTimeSeries(fieldName, dataType) {
  if (!isDateDataType(dataType)) return false;
  if (calculateDateFieldScore(fieldName) === 0) return false;
  return true;
}

export default {
  PRIMARY_DATE_FIELD_PATTERNS,
  SECONDARY_DATE_FIELD_PATTERNS,
  EXCLUDED_DATE_FIELD_PATTERNS,
  DATE_DATA_TYPES,
  FIELD_NAME_WEIGHTS,
  matchesPattern,
  calculateDateFieldScore,
  isDateDataType,
  detectDateField,
  getAllDateFields,
  isSuitableForTimeSeries,
};