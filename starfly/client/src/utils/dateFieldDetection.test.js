import { describe, it, expect } from 'vitest';
import {
  PRIMARY_DATE_FIELD_PATTERNS,
  SECONDARY_DATE_FIELD_PATTERNS,
  EXCLUDED_DATE_FIELD_PATTERNS,
  DATE_DATA_TYPES,
  matchesPattern,
  calculateDateFieldScore,
  isDateDataType,
  detectDateField,
  getAllDateFields,
  isSuitableForTimeSeries,
} from './dateFieldDetection';

describe('dateFieldDetection', () => {
  // ============================================
  // 模式匹配测试
  // ============================================
  describe('matchesPattern', () => {
    it('精确匹配返回 true', () => {
      expect(matchesPattern('date', ['date'])).toBe(true);
      expect(matchesPattern('created_at', ['created_at'])).toBe(true);
    });

    it('前缀匹配返回 true', () => {
      expect(matchesPattern('date_2024', ['date'])).toBe(true);
      expect(matchesPattern('timestamp_log', ['timestamp'])).toBe(true);
    });

    it('后缀匹配返回 true', () => {
      expect(matchesPattern('record_date', ['date'])).toBe(true);
      expect(matchesPattern('log_timestamp', ['timestamp'])).toBe(true);
    });

    it('包含匹配返回 true', () => {
      expect(matchesPattern('my_date_field', ['date'])).toBe(true);
      expect(matchesPattern('transaction_time_stamp', ['timestamp'])).toBe(true);
    });

    it('不匹配返回 false', () => {
      expect(matchesPattern('name', ['date'])).toBe(false);
      expect(matchesPattern('value', ['timestamp'])).toBe(false);
    });

    it('处理下划线变体', () => {
      // createdtime 和 created_time 都应该匹配 created_time
      expect(matchesPattern('created_time', ['created_time'])).toBe(true);
      expect(matchesPattern('createdtime', ['created_time'])).toBe(true);
    });
  });

  // ============================================
  // 优先级分数计算测试
  // ============================================
  describe('calculateDateFieldScore', () => {
    it('高优先级字段得高分', () => {
      expect(calculateDateFieldScore('date')).toBe(10);
      expect(calculateDateFieldScore('timestamp')).toBe(10);
      expect(calculateDateFieldScore('install_date')).toBe(10);
      expect(calculateDateFieldScore('event_time')).toBe(10);
    });

    it('前缀/后缀匹配得中高分', () => {
      // 字段名包含 PRIMARY 模式但不完全匹配
      expect(calculateDateFieldScore('date_record')).toBeGreaterThanOrEqual(7);
      expect(calculateDateFieldScore('log_timestamp')).toBeGreaterThanOrEqual(7);
      expect(calculateDateFieldScore('record_date')).toBeGreaterThanOrEqual(7);
    });

    it('中优先级字段得中分', () => {
      // created_at 和 updated_at 是 SECONDARY 模式
      expect(calculateDateFieldScore('created_at')).toBeGreaterThanOrEqual(5);
      expect(calculateDateFieldScore('updated_at')).toBeGreaterThanOrEqual(5);
      expect(calculateDateFieldScore('occurred_at')).toBeGreaterThanOrEqual(5);
    });

    it('包含关键词得低分', () => {
      // 字段名包含 date/time 但不在预设模式中
      expect(calculateDateFieldScore('some_date_field')).toBeGreaterThanOrEqual(3);
      expect(calculateDateFieldScore('my_time_value')).toBeGreaterThanOrEqual(3);
    });

    it('排除字段得 0 分', () => {
      expect(calculateDateFieldScore('birth_date')).toBe(0);
      expect(calculateDateFieldScore('expiry_date')).toBe(0);
      expect(calculateDateFieldScore('due_date')).toBe(0);
      expect(calculateDateFieldScore('deadline')).toBe(0);
      expect(calculateDateFieldScore('last_login')).toBe(0);
      expect(calculateDateFieldScore('release_date')).toBe(0);
    });

    it('非日期字段得 0 分', () => {
      expect(calculateDateFieldScore('name')).toBe(0);
      expect(calculateDateFieldScore('value')).toBe(0);
      expect(calculateDateFieldScore('amount')).toBe(0);
    });

    it('大小写不敏感', () => {
      expect(calculateDateFieldScore('DATE')).toBe(10);
      expect(calculateDateFieldScore('CreatedAt')).toBe(5);
      expect(calculateDateFieldScore('start_date')).toBe(10);
    });
  });

  // ============================================
  // 数据类型检测测试
  // ============================================
  describe('isDateDataType', () => {
    it('识别 date 类型', () => {
      expect(isDateDataType('date')).toBe(true);
    });

    it('识别 timestamp 类型', () => {
      expect(isDateDataType('timestamp')).toBe(true);
      expect(isDateDataType('timestamp without time zone')).toBe(true);
      expect(isDateDataType('timestamp with time zone')).toBe(true);
      expect(isDateDataType('timestamptz')).toBe(true);
    });

    it('识别 datetime 类型', () => {
      expect(isDateDataType('datetime')).toBe(true);
      expect(isDateDataType('smalldatetime')).toBe(true);
    });

    it('识别 time 类型', () => {
      expect(isDateDataType('time')).toBe(true);
      expect(isDateDataType('time without time zone')).toBe(true);
    });

    it('大小写不敏感', () => {
      expect(isDateDataType('DATE')).toBe(true);
      expect(isDateDataType('TIMESTAMP')).toBe(true);
    });

    it('非日期类型返回 false', () => {
      expect(isDateDataType('integer')).toBe(false);
      expect(isDateDataType('varchar')).toBe(false);
      expect(isDateDataType('numeric')).toBe(false);
      expect(isDateDataType('text')).toBe(false);
    });

    it('null/undefined 返回 false', () => {
      expect(isDateDataType(null)).toBe(false);
      expect(isDateDataType(undefined)).toBe(false);
      expect(isDateDataType('')).toBe(false);
    });
  });

  // ============================================
  // 日期字段检测测试
  // ============================================
  describe('detectDateField', () => {
    const mockColumns = [
      { column_name: 'id', data_type: 'integer' },
      { column_name: 'name', data_type: 'varchar' },
      { column_name: 'date', data_type: 'date' },
      { column_name: 'created_at', data_type: 'timestamp' },
      { column_name: 'start_date', data_type: 'date' },
      { column_name: 'end_date', data_type: 'date' },
      { column_name: 'value', data_type: 'numeric' },
    ];

    it('优先使用明确指定的日期字段', () => {
      const result = detectDateField(mockColumns, 'created_at');
      expect(result.name).toBe('created_at');
      expect(result.isExplicit).toBe(true);
    });

    it('明确字段不存在时自动检测', () => {
      const result = detectDateField(mockColumns, 'nonexistent');
      expect(result.name).toBe('date'); // 自动检测最高分
      expect(result.isExplicit).toBe(false);
    });

    it('无明确指定时自动检测最高分字段', () => {
      const result = detectDateField(mockColumns);
      expect(result.name).toBe('date');
      expect(result.score).toBe(10);
    });

    it('排除不适合时序的字段', () => {
      const columnsWithOnlyExcluded = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'birth_date', data_type: 'date' },
        { column_name: 'expiry_date', data_type: 'date' },
      ];

      const result = detectDateField(columnsWithOnlyExcluded);
      expect(result).toBeNull();
    });

    it('空列数组返回 null', () => {
      expect(detectDateField([])).toBeNull();
      expect(detectDateField(null)).toBeNull();
    });

    it('无日期类型列返回 null', () => {
      const noDateColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'name', data_type: 'varchar' },
      ];

      expect(detectDateField(noDateColumns)).toBeNull();
    });

    it('验证指定字段的数据类型', () => {
      const result = detectDateField(mockColumns, 'name'); // name 是 varchar
      expect(result.name).toBe('date'); // 跳过非日期类型的指定字段
    });

    it('复杂场景：多日期字段选择最优', () => {
      const complexColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'transaction_time', data_type: 'timestamp' }, // 10分
        { column_name: 'created_at', data_type: 'timestamp' }, // 5分
        { column_name: 'updated_at', data_type: 'timestamp' }, // 5分
        { column_name: 'start_date', data_type: 'date' }, // 10分 (primary)
        { column_name: 'my_date_value', data_type: 'date' }, // 3分
      ];

      const result = detectDateField(complexColumns);
      expect(result.name).toBe('transaction_time');
      expect(result.score).toBe(10);
    });
  });

  // ============================================
  // 所有日期字段获取测试
  // ============================================
  describe('getAllDateFields', () => {
    const mockColumns = [
      { column_name: 'id', data_type: 'integer' },
      { column_name: 'date', data_type: 'date' },
      { column_name: 'created_at', data_type: 'timestamp' },
      { column_name: 'updated_at', data_type: 'timestamp' },
      { column_name: 'start_date', data_type: 'date' },
      { column_name: 'my_date_field', data_type: 'date' },
    ];

    it('返回所有日期字段（按分数排序）', () => {
      const results = getAllDateFields(mockColumns);

      expect(results.length).toBeGreaterThanOrEqual(4);
      // date 应该得分最高
      expect(results[0].name).toBe('date');
      // 其他字段按分数排序
      expect(results.every(r => r.score > 0)).toBe(true);
    });

    it('空数组返回空数组', () => {
      expect(getAllDateFields([])).toEqual([]);
      expect(getAllDateFields(null)).toEqual([]);
    });

    it('无日期类型返回空数组', () => {
      const noDateColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'name', data_type: 'varchar' },
      ];

      expect(getAllDateFields(noDateColumns)).toEqual([]);
    });
  });

  // ============================================
  // 时序适用性测试
  // ============================================
  describe('isSuitableForTimeSeries', () => {
    it('适合时序的字段返回 true', () => {
      expect(isSuitableForTimeSeries('date', 'date')).toBe(true);
      expect(isSuitableForTimeSeries('created_at', 'timestamp')).toBe(true);
      expect(isSuitableForTimeSeries('transaction_time', 'timestamp')).toBe(true);
    });

    it('不适合时序的字段返回 false', () => {
      expect(isSuitableForTimeSeries('birth_date', 'date')).toBe(false);
      expect(isSuitableForTimeSeries('expiry_date', 'date')).toBe(false);
      expect(isSuitableForTimeSeries('due_date', 'date')).toBe(false);
    });

    it('非日期类型返回 false', () => {
      expect(isSuitableForTimeSeries('name', 'varchar')).toBe(false);
      expect(isSuitableForTimeSeries('value', 'integer')).toBe(false);
    });
  });

  // ============================================
  // 实际场景测试
  // ============================================
  describe('实际场景', () => {
    it('daily_stats 表检测', () => {
      const dailyStatsColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'date', data_type: 'date' },
        { column_name: 'platform', data_type: 'varchar' },
        { column_name: 'revenue', data_type: 'numeric' },
      ];

      const result = detectDateField(dailyStatsColumns);
      expect(result.name).toBe('date');
      // 验证分数足够高
      expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it('campaigns 表检测（start_date 优先级高于 created_at）', () => {
      const campaignsColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'name', data_type: 'varchar' },
        { column_name: 'start_date', data_type: 'date' },
        { column_name: 'end_date', data_type: 'date' },
        { column_name: 'created_at', data_type: 'timestamp' },
        { column_name: 'budget', data_type: 'numeric' },
      ];

      // start_date 在 PRIMARY 模式中（10分），高于 created_at（5分）
      const result = detectDateField(campaignsColumns);
      expect(result.name).toBe('start_date');
      expect(result.score).toBe(10);
    });

    it('cohort_data 表检测', () => {
      const cohortColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'install_date', data_type: 'date' },
        { column_name: 'day_number', data_type: 'integer' },
        { column_name: 'retained_users', data_type: 'integer' },
      ];

      const result = detectDateField(cohortColumns);
      expect(result.name).toBe('install_date');
      expect(result.score).toBe(10);
    });

    it('ltv_data 表检测', () => {
      const ltvColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'install_date', data_type: 'date' },
        { column_name: 'ltv1', data_type: 'numeric' },
        { column_name: 'ltv7', data_type: 'numeric' },
      ];

      const result = detectDateField(ltvColumns);
      expect(result.name).toBe('install_date');
    });

    it('用户行为表检测', () => {
      const behaviorColumns = [
        { column_name: 'id', data_type: 'integer' },
        { column_name: 'user_id', data_type: 'integer' },
        { column_name: 'event_time', data_type: 'timestamp' },
        { column_name: 'action', data_type: 'varchar' },
      ];

      const result = detectDateField(behaviorColumns);
      expect(result.name).toBe('event_time');
      expect(result.score).toBe(10);
    });
  });
});
