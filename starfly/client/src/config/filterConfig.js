// ============================================================
// 候选筛选器配置 - 定义用户可从候选池中激活的筛选器
// 选项通过 GET /api/filters/:fieldName/values 动态获取
// ============================================================

/**
 * 候选筛选器配置
 * 定义用户可从候选池中激活的可用筛选器
 * 选项通过 GET /api/filters/:fieldName/values 动态获取
 */

// 标签映射 — 作为后备方案和服务端参考
export const FILTER_LABEL_MAPS = {
  platform: { ios: 'iOS', android: 'Android', web: 'Web' },
  game_id: { game_1: '星际争霸', game_2: '王者传奇', game_3: '魔幻世界', game_4: '热血江湖' },
  channel_id: { channel_1: 'App Store', channel_2: 'Google Play', channel_3: '华为应用市场', channel_4: '小米商店', channel_5: 'OPPO商店', channel_6: 'vivo商店' },
  ad_channel_id: { ad_1: '腾讯广告', ad_2: '巨量引擎', ad_3: '百度推广', ad_4: '快手广告', ad_5: '小红书推广' },
  ad_position_id: { pos_1: '开屏广告', pos_2: '信息流', pos_3: 'Banner', pos_4: '视频插播', pos_5: '搜索结果' },
  owner_id: { owner_1: '张三', owner_2: '李四', owner_3: '王五', owner_4: '赵六', owner_5: '陈七' },
};

// 静态后备选项 — 当 API 不可用时使用
const FALLBACK_OPTIONS = {
  platform: [
    { value: 'ios', label: 'iOS' },
    { value: 'android', label: 'Android' },
    { value: 'web', label: 'Web' },
  ],
  game_id: [
    { value: 'game_1', label: '星际争霸' },
    { value: 'game_2', label: '王者传奇' },
    { value: 'game_3', label: '魔幻世界' },
    { value: 'game_4', label: '热血江湖' },
  ],
  channel_id: [
    { value: 'channel_1', label: 'App Store' },
    { value: 'channel_2', label: 'Google Play' },
    { value: 'channel_3', label: '华为应用市场' },
    { value: 'channel_4', label: '小米商店' },
    { value: 'channel_5', label: 'OPPO商店' },
    { value: 'channel_6', label: 'vivo商店' },
  ],
  ad_channel_id: [
    { value: 'ad_1', label: '腾讯广告' },
    { value: 'ad_2', label: '巨量引擎' },
    { value: 'ad_3', label: '百度推广' },
    { value: 'ad_4', label: '快手广告' },
    { value: 'ad_5', label: '小红书推广' },
  ],
  ad_position_id: [
    { value: 'pos_1', label: '开屏广告' },
    { value: 'pos_2', label: '信息流' },
    { value: 'pos_3', label: 'Banner' },
    { value: 'pos_4', label: '视频插播' },
    { value: 'pos_5', label: '搜索结果' },
  ],
  owner_id: [
    { value: 'owner_1', label: '张三' },
    { value: 'owner_2', label: '李四' },
    { value: 'owner_3', label: '王五' },
    { value: 'owner_4', label: '赵六' },
    { value: 'owner_5', label: '陈七' },
  ],
};

export const CANDIDATE_FILTERS = [
  {
    id: 'platform',
    label: '平台',
    icon: 'smartphone',
    field: 'platform',
    multiSelect: true,
    placeholder: '选择平台',
  },
  {
    id: 'game',
    label: '主游戏',
    icon: 'gamepad',
    field: 'game_id',
    multiSelect: true,
    placeholder: '选择游戏',
  },
  {
    id: 'channel',
    label: '渠道商',
    icon: 'share',
    field: 'channel_id',
    multiSelect: true,
    placeholder: '选择渠道',
  },
  {
    id: 'ad_channel',
    label: '广告渠道',
    icon: 'megaphone',
    field: 'ad_channel_id',
    multiSelect: true,
    placeholder: '选择广告渠道',
  },
  {
    id: 'ad_position',
    label: '广告版位',
    icon: 'layout',
    field: 'ad_position_id',
    multiSelect: true,
    placeholder: '选择广告版位',
  },
  {
    id: 'owner',
    label: '负责人',
    icon: 'user',
    field: 'owner_id',
    multiSelect: true,
    placeholder: '选择负责人',
  },
];

/**
 * 根据筛选器 ID 获取筛选器配置
 * @param {string} filterId - 筛选器 ID
 * @returns {Object|undefined} 筛选器配置对象
 */
export const getFilterConfig = (filterId) =>
  CANDIDATE_FILTERS.find(f => f.id === filterId);

/**
 * 获取所有候选筛选器 ID
 * @returns {string[]} 筛选器 ID 数组
 */
export const getAvailableFilterIds = () =>
  CANDIDATE_FILTERS.map(f => f.id);

/**
 * 获取字段的后备选项（API 不可用时使用）
 * @param {string} field - 字段名（如 'platform'、'game_id'）
 * @returns {Array<{value: string, label: string}>} 选项数组
 */
export const getFallbackOptions = (field) =>
  FALLBACK_OPTIONS[field] || [];
