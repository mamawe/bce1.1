import type {
  ActionRow, ActionStats, AskResponse, Candidate, DashboardData, DocContext,
  DocumentDetail, DocumentRow, EntityRow, Fact, Health, Ontology, Outcome,
  QualityIssue, RenderColumn, RenderSpec, Series, User,
} from './types'
import { SAMPLE_REPORTS } from './sample-reports'

/* 周报数据助手离线演示数据层。
 * 数据来自 samples/ 下 2026-W20～W35 的周报样本；指标为“周均日”口径。
 * 演示态下所有写操作在内存中生效，不持久化、不访问网络。 */

export const HEALTH: Health = {
  ok: true,
  version: '1.1.0-mock',
  schema_version: '1.1',
  llm_enabled: true,
  llm_ask_enabled: true,
  llm_model: 'offline-demo-model',
  llm: {
    ready: true,
    reason: '离线演示模式已预置 24 组问数回答。',
    hint: '所有请求均在浏览器本地完成，无需配置模型或后端服务。',
  },
  auth: { jwt_configured: false, lark_enabled: false, env: 'offline-demo' },
  config_warnings: ['当前为纯前端离线演示，写操作仅在本次会话内有效。'],
  stats: {
    facts: 1024, weeks: 16, events: 86, decisions: 52,
    pending_candidates: 6, recommendations: 48, actions: 31, outcomes: 18,
  },
}

// ── 品类与商户（对齐 backend/config/ontology.json 与 samples 周报）──
const CATEGORIES = ['蔬菜', '肉类', '蛋类', '米类', '面类', '调料类', '油类', '水产', '豆制品', '冻品'] as const
const MERCHANT_TYPES = ['酸辣粉', '兰州拉面', '沙县小吃', '黄焖鸡', '麻辣烫'] as const

// 指标全量（对齐 ontology.json metrics + derived_metrics）
const METRIC_DEFS: Array<{ key: string; label: string; unit: string; agg: string; delta: string; aliases: string[]; dims: string[] }> = [
  { key: 'GMV', label: '日均GMV', unit: '万元', agg: 'mean', delta: '%', aliases: ['成交额', '销售额', '日均GMV', '日均 GMV'], dims: ['category', 'merchant_type'] },
  { key: '订单量', label: '日均订单', unit: '单', agg: 'mean', delta: '%', aliases: ['订单数', '日均订单', '日均订单量'], dims: ['category', 'merchant_type'] },
  { key: '客单价', label: '客单价', unit: '元', agg: 'mean', delta: '%', aliases: ['平均客单价'], dims: ['category', 'merchant_type'] },
  { key: '复购率', label: '复购率', unit: '%', agg: 'mean', delta: 'pp', aliases: [], dims: ['category', 'merchant_type'] },
  { key: '毛利率', label: '毛利率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['毛利率水平'], dims: ['category', 'merchant_type'] },
  { key: '净利率', label: '净利率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['净利', '利润率', '净利润率'], dims: ['category', 'merchant_type'] },
  { key: '品类宽度', label: '品类宽度', unit: '个', agg: 'mean', delta: 'pp', aliases: [], dims: ['category', 'merchant_type'] },
  { key: 'SKU宽度', label: 'SKU宽度', unit: '个', agg: 'mean', delta: 'pp', aliases: ['SKU 宽度'], dims: ['category', 'merchant_type'] },
  { key: '商户数', label: '商户数', unit: '家', agg: 'sum', delta: '%', aliases: [], dims: ['merchant_type'] },
  { key: '损耗率', label: '损耗率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['损耗'], dims: ['category'] },
  { key: '损耗成本率', label: '损耗成本率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['损耗成本占比'], dims: ['category'] },
  { key: '运输成本率', label: '运输成本率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['运输成本占比'], dims: ['category'] },
  { key: '仓储成本率', label: '仓储成本率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['仓储成本占比'], dims: ['category'] },
  { key: '商品成本率', label: '商品成本率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['商品成本占比'], dims: ['category'] },
  { key: '销售费用率', label: '销售费用率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['销售费用占比'], dims: ['category'] },
  { key: '管理费用率', label: '管理费用率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['管理费用占比'], dims: ['category'] },
  { key: '转化率', label: '转化率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['CVR'], dims: ['category'] },
  { key: 'CAC', label: '获客成本', unit: '元', agg: 'mean', delta: '%', aliases: ['用户获取成本'], dims: ['category'] },
  { key: 'CTR', label: '点击率', unit: '%', agg: 'mean', delta: 'pp', aliases: ['点击通过率'], dims: ['category'] },
  { key: 'DAU', label: '日活', unit: '家', agg: 'mean', delta: '%', aliases: ['日活跃用户'], dims: ['merchant_type'] },
  // derived_metrics
  { key: 'GMV占比', label: 'GMV占比', unit: '%', agg: 'sum', delta: 'pp', aliases: ['GMV 占比', '销售额占比', '成交额占比'], dims: ['category', 'merchant_type'] },
  { key: '客单价倍数', label: '客单价倍数', unit: '倍', agg: 'mean', delta: '%', aliases: ['客单价 倍数'], dims: ['category', 'merchant_type'] },
  { key: '损耗成本额', label: '损耗成本额', unit: '万元', agg: 'mean', delta: '%', aliases: ['损耗成本金额'], dims: ['category'] },
  { key: '毛利润额', label: '毛利润额', unit: '万元', agg: 'mean', delta: '%', aliases: ['毛利额', '毛利润', '毛利金额', '毛利润金额'], dims: ['category'] },
  { key: '净利润额', label: '净利润额', unit: '万元', agg: 'mean', delta: '%', aliases: ['利润额', '净利额', '净利润'], dims: ['category'] },
]

// 别名表（对齐 ontology.json entities.aliases）
const ALIAS_MAP: Record<string, string> = {
  叶菜: '蔬菜', 鲜蔬: '蔬菜', 宰菜: '蔬菜',
  沙县: '沙县小吃', 沙县小吃店: '沙县小吃',
  酸辣粉店: '酸辣粉', 兰州拉面店: '兰州拉面',
  黄焖鸡店: '黄焖鸡', 麻辣烫店: '麻辣烫',
  调料: '调料类', 豆制品类: '豆制品',
}

export const USERS: Record<string, User> = {
  admin: {
    user_id: 'admin', display_name: '王总管', role: 'admin', has_global_view: 1,
    categories: ['总体', ...CATEGORIES],
  },
  exec_li: {
    user_id: 'exec_li', display_name: '李高管', role: 'executive', has_global_view: 1,
    categories: ['总体', ...CATEGORIES],
  },
  lead_veg: {
    user_id: 'lead_veg', display_name: '蔬菜负责人', role: 'category_lead', has_global_view: 0,
    categories: ['蔬菜'],
  },
  analyst_wang: {
    user_id: 'analyst_wang', display_name: '王分析师', role: 'dept_lead', has_global_view: 0,
    categories: ['蔬菜', '肉类', '水产'],
  },
  viewer: {
    user_id: 'viewer', display_name: '只读用户', role: 'viewer', has_global_view: 0,
    categories: [],
  },
}

// ── 注册实体（对齐后端 entity_registry.py 的逻辑）──
function buildEntities(): EntityRow[] {
  const rows: EntityRow[] = []
  const add = (entity_id: string, entity_name: string, category: string, description: string, is_overall: number, aliases: string[] = []) => {
    rows.push({ entity_id, entity_name, category, description, is_overall, aliases })
  }
  // 总体
  add('OBJECT_总体', '总体', 'OBJECT', '全平台口径', 1, ['全品类', '整体', '大盘'])
  // 指标
  for (const m of METRIC_DEFS) {
    add(`METRIC_${m.key.toUpperCase().replace(/\s+/g, '_')}`, m.key, 'METRIC', `${m.label}，单位 ${m.unit}，聚合方式 ${m.agg}`, 0, m.aliases)
  }
  // 品类
  for (const cat of CATEGORIES) {
    const catAliases = Object.entries(ALIAS_MAP).filter(([, target]) => target === cat).map(([alias]) => alias)
    add(`OBJECT_${cat.toUpperCase()}`, cat, 'OBJECT', '品类维度', 0, catAliases)
  }
  // 商户类型（含门店写法）
  for (const merchant of MERCHANT_TYPES) {
    const ownerAliases = Object.entries(ALIAS_MAP).filter(([, target]) => target === merchant).map(([alias]) => alias)
    add(`OWNER_${merchant.toUpperCase()}`, merchant, 'OWNER', '商户类型维度', 0, ownerAliases)
    add(`OWNER_${merchant.toUpperCase()}_店`, merchant + '店', 'OWNER', `${merchant}商户类型（门店写法）`, 0)
  }
  // 组合实体：品类/商户 + 指标
  for (const m of METRIC_DEFS) {
    const dims = new Set(m.dims)
    const owners: string[] = []
    if (dims.has('category')) owners.push(...CATEGORIES)
    if (dims.has('merchant_type')) owners.push(...MERCHANT_TYPES)
    for (const owner of owners) {
      const tails = [m.key, ...m.aliases]
      if (m.key.endsWith('率') && m.key.length > 2) tails.push(m.key.slice(0, -1))
      const names: string[] = []
      for (const tail of tails) {
        if (!tail) continue
        names.push(`${owner}${tail}`, `${owner}的${tail}`)
        if (/\s/.test(tail) || /[a-zA-Z]/.test(tail)) names.push(`${owner} ${tail}`)
      }
      const unique = [...new Set(names)]
      if (unique.length === 0) continue
      add(`COMBO_${owner}_${m.key}`.toUpperCase().replace(/\s+/g, '_'), unique[0], 'COMBO', `${owner} 的 ${m.label}（维度 × 指标组合对象）`, 0, unique.slice(1))
    }
  }
  return rows
}

export const ENTITIES: EntityRow[] = buildEntities()

export const ONTOLOGY: Ontology = {
  schema_version: '1.1',
  metrics: Object.fromEntries(METRIC_DEFS.map((m) => [m.key, {
    label: m.label, unit: m.unit, aggregation: m.agg, delta_kind: m.delta, aliases: m.aliases, allowed_dimensions: m.dims,
  }])),
  dimensions: {
    category: ['总体', ...CATEGORIES],
    merchant_type: [...MERCHANT_TYPES],
  },
  event_types: ['FLUCTUATION', 'LAUNCH', 'EXPERIMENT', 'RISK', 'MILESTONE', 'DECISION'],
  aliases: ALIAS_MAP,
}

const weeks = Array.from({ length: 16 }, (_, index) => 202600 + (20 + index))
export const WEEK_LABELS = weeks.map((value) => `2026-W${value % 100}`)
export const PERIODS: Record<string, [string, string]> = {
  '2026-W20': ['2026-05-11', '2026-05-17'], '2026-W21': ['2026-05-18', '2026-05-24'],
  '2026-W22': ['2026-05-25', '2026-05-31'], '2026-W23': ['2026-06-01', '2026-06-07'],
  '2026-W24': ['2026-06-08', '2026-06-14'], '2026-W25': ['2026-06-15', '2026-06-21'],
  '2026-W26': ['2026-06-22', '2026-06-28'], '2026-W27': ['2026-06-29', '2026-07-05'],
  '2026-W28': ['2026-07-06', '2026-07-12'], '2026-W29': ['2026-07-13', '2026-07-19'],
  '2026-W30': ['2026-07-20', '2026-07-26'], '2026-W31': ['2026-07-27', '2026-08-02'],
  '2026-W32': ['2026-08-03', '2026-08-09'], '2026-W33': ['2026-08-10', '2026-08-16'],
  '2026-W34': ['2026-08-17', '2026-08-23'], '2026-W35': ['2026-08-24', '2026-08-30'],
}

// ── 核心指标（从 samples 周报原文提取，W20–W35）──
export const summaryGmv = [1520, 1552, 1575, 1610, 1650, 1920, 1650, 1725, 1756, 1805, 1842, 1858, 1858, 1862, 1874, 1880]
export const summaryOrders = [7080, 7210, 7320, 7480, 7650, 8820, 7650, 7980, 8105, 8320, 8480, 8510, 8535, 8538, 8566, 8590]
export const summaryAov = [2147, 2152, 2151, 2152, 2157, 2177, 2157, 2162, 2167, 2169, 2172, 2183, 2177, 2180, 2188, 2189]
export const summaryRepurchase = [63.5, 64.0, 64.5, 65.0, 65.5, 68.2, 65.5, 66.2, 66.8, 67.5, 67.8, 68.1, 68.3, 68.3, 68.4, 68.5]
export const summaryWidth = [3.5, 3.5, 3.5, 3.6, 3.6, 3.8, 3.6, 3.7, 3.7, 3.8, 3.9, 3.9, 3.9, 3.9, 4.0, 4.0]
export const summaryGrossMargin = [19.0, 19.0, 19.0, 19.0, 19.0, 18.2, 19.0, 19.2, 19.2, 19.2, 19.5, 19.4, 19.5, 19.6, 19.6, 19.7]
export const summaryNetMargin = [4.0, 4.0, 4.0, 4.1, 4.2, 3.5, 4.0, 4.2, 4.1, 4.3, 4.5, 4.4, 4.5, 4.5, 4.6, 4.7]
const categorySeeds: Record<string, number[]> = {
  蔬菜: [250, 255, 259, 264, 269, 338, 269, 287, 295, 303, 317, 317, 312, 312, 315, 316],
  肉类: [347, 357, 364, 374, 387, 431, 386, 397, 397, 406, 412, 416, 417, 417, 417, 417],
  蛋类: [84, 85, 86, 87, 88, 103, 89, 93, 94, 95, 97, 98, 98, 96, 97, 98],
  米类: [165, 168, 168, 171, 173, 189, 174, 177, 179, 181, 183, 184, 184, 186, 188, 188],
  面类: [111, 113, 115, 118, 121, 146, 121, 129, 133, 137, 139, 141, 142, 144, 146, 147],
  调料类: [160, 165, 168, 174, 180, 226, 176, 192, 200, 214, 216, 219, 220, 221, 221, 221],
  油类: [156, 157, 158, 159, 161, 170, 162, 164, 164, 164, 165, 166, 167, 166, 168, 169],
  水产: [118, 120, 122, 124, 127, 146, 129, 135, 139, 144, 150, 151, 152, 153, 152, 153],
  豆制品: [49, 51, 53, 55, 58, 74, 57, 61, 64, 68, 69, 71, 71, 73, 74, 75],
  冻品: [80, 81, 82, 84, 86, 97, 87, 90, 91, 93, 94, 95, 95, 94, 96, 96],
}
const marginSeeds: Record<string, number[]> = {
  蔬菜: [22.0, 22.0, 22.0, 22.0, 22.0, 21.5, 22.0, 22.2, 22.5, 22.8, 23.2, 22.8, 23.1, 23.1, 23.1, 23.2],
  肉类: [19.5, 19.5, 19.5, 19.5, 19.5, 18.0, 19.5, 19.5, 18.8, 18.5, 18.8, 18.5, 18.4, 18.4, 18.4, 18.5],
  蛋类: [18.0, 18.0, 18.0, 18.0, 18.0, 17.5, 18.0, 18.0, 18.2, 18.5, 18.6, 18.5, 18.4, 18.6, 18.6, 18.6],
  米类: [15.5, 15.5, 15.5, 15.5, 15.5, 15.0, 15.5, 15.5, 15.5, 15.8, 16.0, 15.8, 15.7, 15.7, 15.7, 15.8],
  面类: [19.5, 19.5, 19.5, 19.5, 19.5, 19.0, 19.5, 19.8, 20.0, 20.3, 20.5, 20.4, 20.5, 20.5, 20.5, 20.6],
  调料类: [25.0, 25.0, 25.0, 25.0, 25.0, 23.5, 24.8, 25.0, 25.0, 25.5, 25.6, 25.4, 25.6, 25.7, 25.7, 25.7],
  油类: [14.5, 14.5, 14.5, 14.5, 14.5, 14.0, 14.5, 14.5, 14.2, 14.5, 14.6, 14.5, 14.5, 14.6, 14.6, 14.6],
  水产: [18.5, 18.5, 18.5, 18.5, 18.5, 17.5, 18.5, 18.5, 18.0, 18.2, 18.5, 18.6, 18.5, 18.7, 18.7, 18.8],
  豆制品: [28.5, 28.5, 28.5, 28.5, 28.5, 27.0, 28.5, 28.5, 28.5, 28.8, 28.5, 28.4, 28.6, 28.7, 28.7, 28.7],
  冻品: [19.5, 19.5, 19.5, 19.5, 19.5, 18.5, 19.5, 19.5, 19.2, 19.5, 19.8, 19.7, 19.8, 19.9, 19.9, 19.9],
}
const metricByCategory: Record<string, Record<string, number[]>> = {
  蔬菜: { 客单价: [845, 850, 855, 860, 865, 895, 870, 875, 880, 885, 892, 865, 858, 852, 861, 869], 复购率: [68.0, 68.5, 69.0, 69.5, 70.0, 72.0, 70.5, 71.5, 72.0, 72.5, 72.8, 72.1, 71.8, 71.8, 72.0, 72.1], 品类宽度: [3.8, 3.8, 3.8, 3.8, 3.8, 4.2, 3.8, 3.9, 4.0, 4.1, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2], 损耗率: [2.8, 2.7, 2.7, 2.6, 2.6, 2.5, 2.5, 2.5, 2.5, 2.8, 2.7, 2.6, 2.5, 2.3, 2.2, 2.2] },
  肉类: { 客单价: [1760, 1770, 1780, 1790, 1800, 1835, 1805, 1810, 1815, 1820, 1825, 1842, 1848, 1847, 1849, 1850], 复购率: [63.0, 63.5, 64.0, 64.5, 65.0, 65.0, 65.5, 66.0, 65.8, 66.2, 66.5, 66.8, 67.0, 66.9, 67.0, 67.1], 品类宽度: [3.0, 3.0, 3.0, 3.0, 3.0, 3.2, 3.0, 3.1, 3.1, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2], 损耗率: [1.8, 1.8, 1.7, 1.7, 1.7, 1.6, 1.6, 1.6, 1.5, 1.5, 1.5, 1.5, 1.4, 1.4, 1.4, 1.4] },
  蛋类: { 客单价: [332, 335, 338, 340, 342, 355, 345, 348, 350, 352, 355, 352, 355, 353, 354, 355], 复购率: [75.0, 75.5, 76.0, 76.5, 77.0, 78.5, 77.5, 78.0, 77.8, 78.0, 78.2, 78.4, 78.6, 78.6, 78.7, 78.7], 品类宽度: [2.5, 2.5, 2.5, 2.7, 2.7, 2.9, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8], 损耗率: [1.5, 1.5, 1.4, 1.4, 1.4, 1.3, 1.3, 1.3, 1.2, 1.2, 1.2, 1.2, 1.1, 1.1, 1.1, 1.1] },
  米类: { 客单价: [1195, 1200, 1205, 1210, 1215, 1255, 1220, 1225, 1230, 1235, 1238, 1242, 1248, 1247, 1249, 1250], 复购率: [79.5, 80.0, 80.0, 80.5, 81.0, 82.0, 81.0, 81.5, 81.0, 81.2, 81.3, 81.5, 81.6, 81.6, 81.7, 81.7], 品类宽度: [3.0, 3.0, 3.0, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.6] },
  面类: { 客单价: [940, 945, 950, 955, 960, 985, 965, 970, 975, 980, 985, 992, 998, 997, 999, 1000], 复购率: [70.5, 71.0, 71.5, 72.0, 72.5, 74.5, 73.0, 73.5, 74.0, 74.5, 74.6, 75.1, 75.4, 75.3, 75.4, 75.5], 品类宽度: [2.4, 2.4, 2.4, 2.3, 2.3, 2.4, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3] },
  调料类: { 客单价: [1490, 1500, 1510, 1520, 1530, 1565, 1535, 1540, 1545, 1555, 1560, 1568, 1572, 1574, 1575, 1576], 复购率: [67.0, 67.5, 68.0, 68.5, 69.0, 72.0, 69.5, 70.0, 70.5, 71.0, 71.2, 71.5, 71.8, 71.9, 71.9, 72.0], 品类宽度: [3.5, 3.5, 3.5, 3.4, 3.4, 3.8, 3.4, 3.5, 3.5, 3.6, 3.7, 3.7, 3.7, 3.7, 3.7, 3.7] },
  油类: { 客单价: [2055, 2060, 2065, 2070, 2075, 2125, 2080, 2085, 2090, 2095, 2098, 2105, 2112, 2110, 2112, 2113], 复购率: [80.5, 81.0, 81.0, 81.5, 81.5, 82.5, 81.8, 82.0, 81.8, 82.0, 82.1, 82.3, 82.4, 82.5, 82.5, 82.5], 品类宽度: [1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8] },
  水产: { 客单价: [1310, 1315, 1320, 1325, 1330, 1365, 1335, 1340, 1345, 1350, 1358, 1365, 1372, 1370, 1371, 1372], 复购率: [63.5, 64.0, 64.5, 65.0, 65.5, 66.5, 66.0, 66.5, 65.8, 65.2, 66.8, 67.2, 67.5, 67.6, 67.7, 67.7], 品类宽度: [2.2, 2.2, 2.2, 2.3, 2.3, 2.4, 2.3, 2.3, 2.3, 2.3, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4], 损耗率: [3.5, 3.4, 3.4, 3.3, 3.3, 3.2, 3.2, 3.1, 3.1, 3.0, 2.9, 2.9, 2.8, 2.8, 2.8, 2.7] },
  豆制品: { 客单价: [435, 440, 445, 450, 455, 478, 460, 465, 470, 475, 478, 482, 485, 486, 487, 487], 复购率: [65.5, 66.0, 66.5, 67.0, 67.5, 70.0, 68.0, 68.5, 68.8, 69.2, 69.5, 70.1, 70.4, 70.5, 70.6, 70.7], 品类宽度: [2.0, 2.0, 2.0, 2.0, 2.0, 2.2, 2.0, 2.0, 2.0, 2.1, 2.1, 2.1, 2.1, 2.1, 2.1, 2.1] },
  冻品: { 客单价: [1105, 1110, 1115, 1120, 1125, 1155, 1130, 1135, 1140, 1145, 1150, 1155, 1162, 1160, 1162, 1162], 复购率: [60.0, 60.5, 61.0, 61.5, 62.0, 64.0, 62.5, 63.0, 63.0, 63.5, 63.8, 64.2, 64.5, 64.6, 64.8, 64.8], 品类宽度: [2.7, 2.7, 2.7, 2.5, 2.5, 2.7, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6] },
}
const merchantSeeds: Record<string, number[]> = {
  酸辣粉: [200, 205, 208, 212, 218, 255, 220, 228, 235, 238, 242, 244, 245, 245, 246, 247],
  兰州拉面: [180, 183, 186, 190, 195, 230, 198, 205, 210, 212, 215, 218, 219, 219, 220, 221],
  沙县小吃: [165, 169, 172, 175, 178, 210, 182, 188, 192, 195, 198, 201, 203, 202, 203, 204],
  黄焖鸡: [133, 136, 139, 142, 145, 170, 148, 152, 156, 158, 160, 162, 163, 163, 163, 164],
  麻辣烫: [252, 258, 262, 268, 275, 340, 280, 295, 300, 305, 310, 315, 318, 317, 318, 320],
}

const reportTable = [
  ['蔬菜', 250, 16.4, 22.0, 845, 68.0, 3.8], ['肉类', 347, 22.8, 19.5, 1760, 63.0, 3.0],
  ['蛋类', 84, 5.5, 18.0, 332, 75.0, 2.5], ['米类', 165, 10.9, 15.5, 1195, 79.5, 3.0],
  ['面类', 111, 7.3, 19.5, 940, 70.5, 2.4], ['调料类', 160, 10.5, 25.0, 1490, 67.0, 3.5],
  ['油类', 156, 10.3, 14.5, 2055, 80.5, 1.8], ['水产', 118, 7.8, 18.5, 1310, 63.5, 2.2],
  ['豆制品', 49, 3.2, 28.5, 435, 65.5, 2.0], ['冻品', 80, 5.3, 19.5, 1105, 60.0, 2.7],
]
const merchantTable = [
  ['酸辣粉店', 1258, 200, 1590, 65.0, 3.4], ['兰州拉面店', 1025, 180, 1760, 68.5, 3.5],
  ['沙县小吃店', 900, 165, 1840, 70.0, 4.2], ['黄焖鸡店', 660, 133, 2020, 66.5, 3.7],
  ['麻辣烫店', 1380, 252, 1830, 62.0, 4.2],
]

function docId(week: string) { return `weekly_sales_${week.toLowerCase().replace('-', '_')}` }
function period(week: string) { return PERIODS[week] ?? ['2026-05-11', '2026-05-17'] }
function isoWeek(week: string) { return Number(week.slice(-2)) }
export function wow(current: number, previous: number | undefined, metric: string) {
  if (previous == null || previous === 0) return null
  return ['GMV占比', '毛利率', '净利率', '复购率', '损耗率', '损耗成本率', '运输成本率', '仓储成本率', '商品成本率', '销售费用率', '管理费用率', '转化率'].includes(metric)
    ? Number((current - previous).toFixed(1))
    : Number((((current - previous) / previous) * 100).toFixed(1))
}

function baseFacts(): Fact[] {
  const rows: Fact[] = []
  let id = 1
  const push = (week: string, category: string, merchant_type: string | null, metric_name: string, metric_value: number, metric_unit: string) => {
    const weekIndex = WEEK_LABELS.indexOf(week)
    const categoryMetrics = categorySeeds[category] as unknown as Record<string, number[]> | undefined
    const previousValue = categoryMetrics?.[metric_name]?.[weekIndex - 1]
      ?? (metric_name === 'GMV' ? summaryGmv[weekIndex - 1] : undefined)
    rows.push({
      id: id++, report_date: period(week)[1], week_label: week, category, merchant_type, metric_name,
      metric_value: Number(metric_value.toFixed(2)), metric_unit, aggregation: '日均',
      comparison_type: weekIndex ? 'wow' : null, wow_change_pct: wow(metric_value, previousValue, metric_name),
      source_doc_id: docId(week), source_quote: `《${week} 销售周报》${category} ${metric_name}`,
      confidence: 0.96, extraction_method: 'mock-semantic-parser', review_status: 'accepted',
      ingest_run_id: `mock-run-${weekIndex + 1}`, is_active: 1,
    })
  }
  WEEK_LABELS.forEach((week, weekIndex) => {
    const gmv = summaryGmv[weekIndex]
    push(week, '总体', null, 'GMV', gmv, '万元')
    push(week, '总体', null, '订单量', summaryOrders[weekIndex], '单')
    push(week, '总体', null, '客单价', summaryAov[weekIndex], '元')
    push(week, '总体', null, '复购率', summaryRepurchase[weekIndex], '%')
    push(week, '总体', null, '品类宽度', summaryWidth[weekIndex], '个')
    push(week, '总体', null, '毛利率', summaryGrossMargin[weekIndex], '%')
    push(week, '总体', null, '净利率', summaryNetMargin[weekIndex], '%')
    push(week, '总体', null, '毛利润额', Number((gmv * summaryGrossMargin[weekIndex] / 100).toFixed(1)), '万元')
    push(week, '总体', null, '净利润额', Number((gmv * summaryNetMargin[weekIndex] / 100).toFixed(1)), '万元')
    push(week, '总体', null, '商品成本率', Number((81 - weekIndex * 0.04).toFixed(1)), '%')
    push(week, '总体', null, '运输成本率', 6.4, '%')
    push(week, '总体', null, '仓储成本率', 2.7, '%')
    push(week, '总体', null, '销售费用率', 3.3, '%')
    push(week, '总体', null, '管理费用率', 0.8, '%')
    push(week, '总体', null, '损耗成本率', 1.7, '%')
    push(week, '总体', null, '转化率', Number((3.0 + weekIndex * 0.02).toFixed(1)), '%')
    for (const category of Object.keys(categorySeeds)) {
      const value = categorySeeds[category][weekIndex]
      push(week, category, null, 'GMV', value, '万元')
      push(week, category, null, 'GMV占比', Number((value / gmv * 100).toFixed(1)), '%')
      push(week, category, null, '毛利率', marginSeeds[category][weekIndex], '%')
      for (const metric of Object.keys(metricByCategory[category])) {
        push(week, category, null, metric, metricByCategory[category][metric][weekIndex], metric === '客单价' ? '元' : metric === '品类宽度' ? '个' : '%')
      }
    }
    for (const merchant of Object.keys(merchantSeeds)) {
      const value = merchantSeeds[merchant][weekIndex]
      push(week, merchant, merchant, 'GMV', value, '万元')
      push(week, merchant, merchant, '客单价', Math.round(merchantSeeds[merchant][weekIndex] * 10000 / Math.max(1, merchantSeeds[merchant][weekIndex] * 4.5)), '元')
      push(week, merchant, merchant, '复购率', Number((62 + weekIndex * 0.2).toFixed(1)), '%')
      push(week, merchant, merchant, '品类宽度', Number((3.4 + weekIndex * 0.04).toFixed(1)), '个')
      push(week, merchant, merchant, '转化率', Number((3.1 + weekIndex * 0.02).toFixed(1)), '%')
    }
  })
  return rows
}
export const FACTS: Fact[] = baseFacts()

function markdownForWeek(week: string): string {
  const index = WEEK_LABELS.indexOf(week)
  const [start, end] = period(week)
  const gmv = summaryGmv[index]
  const vegetable = categorySeeds.蔬菜[index]
  const meat = categorySeeds.肉类[index]
  const aquatic = categorySeeds.水产[index]
  const rice = categorySeeds.米类[index]
  const gross = summaryGrossMargin[index]
  const net = summaryNetMargin[index]
  const loss = metricByCategory.蔬菜.损耗率[index]
  const summary = index === 0
    ? '本周 GMV 周均 1,520 万元，环比 +3.1%，创近 8 周新高。落地页 B 方案转化率 3.3%，全量切换后预计贡献约 45 万元/周增量。'
    : index === 15
      ? '本周 GMV 周均 1,880 万元，环比 +0.3%。满减券扩至 4 仓首周，蔬菜客单价 869 元；夜配全仓第二个完整周，蔬菜损耗率降至 2.2%；开学季备货锁价完成 85%。'
      : `本周 GMV 周均 ${gmv.toLocaleString()} 万元，较上周小幅变化。蔬菜损耗率 ${loss}%，满减券、夜配与开学备货共同影响需求与履约。`
  const categoryRows = reportTable.map((row) => {
    const seed = categorySeeds[row[0] as string]?.[index] ?? row[1]
    const margin = marginSeeds[row[0] as string]?.[index] ?? row[3]
    const extra = metricByCategory[row[0] as string] ?? {}
    return `| ${row[0]} | ${seed} | ${((seed / gmv) * 100).toFixed(1)}% | ${margin.toFixed(1)}% | ${(extra.客单价?.[index] ?? row[4]).toLocaleString()} | ${(extra.复购率?.[index] ?? row[5]).toFixed(1)}% | ${(extra.品类宽度?.[index] ?? row[6]).toFixed(1)} |`
  }).join('\n')
  const merchantRows = merchantTable.map((row) => {
    const seedKey = (row[0] as string).replace(/店$/, '')
    const seed = merchantSeeds[seedKey]?.[index] ?? row[2]
    return `| ${row[0]} | ${(row[1] as number).toLocaleString()} | ${seed} | ${(row[3] as number).toLocaleString()} | ${(row[4] as number).toFixed(1)}% | ${(row[5] as number).toFixed(1)} |`
  }).join('\n')
  return `# 2026年第${isoWeek(week)}周 销售周报（${start.slice(5).replace('-', '月')}日-${end.slice(8)}日）

**编制**：商业分析部
**日期**：${end}
**覆盖周期**：${start} 至 ${end}（第${isoWeek(week)}周）
**数据口径**：快驴北京仓（含朝阳、海淀、丰台、通州四个前置仓）

---

## Executive Summary

${summary}

---

## 一、核心指标看板（周均值）

| 指标 | 本周均值 | 上周均值 | 环比 |
|------|---------|---------|------|
| 日均 GMV（万元） | ${gmv.toLocaleString()} | ${(summaryGmv[index - 1] ?? gmv).toLocaleString()} | ${((gmv / (summaryGmv[index - 1] ?? gmv) - 1) * 100).toFixed(1)}% |
| 日均订单量（单） | ${summaryOrders[index].toLocaleString()} | ${(summaryOrders[index - 1] ?? summaryOrders[index]).toLocaleString()} | ${((summaryOrders[index] / (summaryOrders[index - 1] ?? summaryOrders[index]) - 1) * 100).toFixed(1)}% |
| 客单价（元） | ${summaryAov[index].toLocaleString()} | ${(summaryAov[index - 1] ?? summaryAov[index]).toLocaleString()} | ${((summaryAov[index] / (summaryAov[index - 1] ?? summaryAov[index]) - 1) * 100).toFixed(1)}% |
| 复购率 | ${summaryRepurchase[index].toFixed(1)}% | ${(summaryRepurchase[index - 1] ?? summaryRepurchase[index]).toFixed(1)}% | ${(summaryRepurchase[index] - (summaryRepurchase[index - 1] ?? summaryRepurchase[index])).toFixed(1)}pp |
| 品类宽度 | ${summaryWidth[index].toFixed(1)} | ${(summaryWidth[index - 1] ?? summaryWidth[index]).toFixed(1)} | ${(summaryWidth[index] - (summaryWidth[index - 1] ?? summaryWidth[index])).toFixed(1)} |
| 毛利率 | ${gross.toFixed(1)}% | ${(summaryGrossMargin[index - 1] ?? gross).toFixed(1)}% | ${(gross - (summaryGrossMargin[index - 1] ?? gross)).toFixed(1)}pp |
| 净利率 | ${net.toFixed(1)}% | ${(summaryNetMargin[index - 1] ?? net).toFixed(1)}% | ${(net - (summaryNetMargin[index - 1] ?? net)).toFixed(1)}pp |

---

## 二、品类维度拆解

| 品类 | 日均 GMV（万元） | 占比 | 毛利率 | 客单价 | 复购率 | 品类宽度 |
|------|-----------|------|--------|--------|--------|----------|
${categoryRows}

**品类异常归因**

蔬菜本周 GMV ${vegetable} 万元，占比 ${((vegetable / gmv) * 100).toFixed(1)}%。满减券与夜配共同改善客单与损耗，损耗率为 ${loss}%。肉类 GMV ${meat} 万元，水产 GMV ${aquatic} 万元，米类 GMV ${rice} 万元。

---

## 三、商户分类对比分析

| 商户类型 | 商户数 | 日均 GMV（万元） | 客单价 | 复购率 | 品类宽度 |
|----------|--------|-----------|--------|--------|----------|
${merchantRows}

---

## 四、事件记录

- ${week}：蔬菜满减券在试点仓核销率达到 38%，客单价连续改善。
- ${week}：夜配全仓运行，蔬菜夜间损耗率低于白天，损耗专项持续兑现。
- ${week}：开学季备货启动，米类需求上行，锁价进度按计划推进。

---

## 五、决策记录

| 决策 | 责任人 | 生效日期 | 结果 |
|------|--------|----------|------|
| 满减券扩至 4 仓 | 营销负责人 | ${start} | PENDING |
| 夜配转常态化运营 | 供应链负责人 | ${start} | PENDING |
| 开学备货锁价 | 米类采购负责人 | ${start} | PENDING |

---

## 六、风险提示

| 风险项 | 当前状态 | 趋势 | 预案 |
|--------|---------|------|------|
| 蔬菜损耗 | ${loss}% | ↘ 改善 | 夜配转常态化，评估天津仓 |
| 满减券补贴 | 核销率 38% | → 观察 | 补贴增量比低于 1:5 则收缩 |
| 开学备货 | 锁价完成 85% | ↗ 推进 | 8 月 28 日前补齐剩余锁价 |

*报告结束。*
`
}

export const DOCUMENTS: DocumentRow[] = [...WEEK_LABELS].reverse().map((week) => {
  const [start, end] = period(week)
  return {
    doc_id: docId(week), title: `2026年第${isoWeek(week)}周 销售周报（${start.slice(5)}-${end.slice(5)}）`,
    iso_year: 2026, iso_week: isoWeek(week), week_label: week, period_start: start, period_end: end,
    doc_version: 1, ingest_status: 'completed', ingested_at: `${end}T09:00:00`,
  }
})

export function documentDetail(id: string): DocumentDetail {
  const row = DOCUMENTS.find((d) => d.doc_id === id) ?? DOCUMENTS[0]
  return {
    doc_id: row.doc_id, title: row.title, week_label: row.week_label, iso_year: row.iso_year,
    iso_week: row.iso_week, period_start: row.period_start, period_end: row.period_end,
    time_source: 'title', time_confidence: 0.99, doc_version: row.doc_version,
    ingested_at: row.ingested_at, source_url: `samples/${row.doc_id}.md`,
    content: SAMPLE_REPORTS[row.doc_id] ?? markdownForWeek(row.week_label ?? '2026-W20'), hidden_sections: [],
    run: {
      ingest_run_id: `mock-run-${row.week_label}`, doc_id: row.doc_id, status: 'completed',
      facts_accepted: 152, facts_rejected: 1, events_extracted: 3, decisions_extracted: 3,
      recommendations_generated: 3, review_count: row.week_label === '2026-W35' ? 2 : 1,
    },
  }
}

const recommendationSeeds: Array<{ id: string; action: string; targets: string[]; rationale: string; owner: string; status: string }> = [
  { id: 'rec-night-delivery', action: 'operations', targets: ['蔬菜'], rationale: '夜配全仓后蔬菜损耗率连续改善，当前损耗率已低于 2.3% 目标，具备常态化条件。', owner: '供应链负责人', status: 'proposed' },
  { id: 'rec-coupon-review', action: 'promotion', targets: ['蔬菜'], rationale: '满减券 4 仓核销率 38%，补贴增量比约 1:6.5，需评估是否纳入 Q4 常态化预算。', owner: '营销负责人', status: 'proposed' },
  { id: 'rec-seafood-restock', action: 'restock', targets: ['水产'], rationale: '水产周转 3.2 天，建议将补货节奏由 3 天缩短至 2 天，降低缺货损失。', owner: '水产采购负责人', status: 'approved' },
  { id: 'rec-rice-price-lock', action: 'pricing', targets: ['米类'], rationale: '开学季锁价完成 85%，剩余 15% 需在 8 月 28 日前完成，以对冲价格波动。', owner: '米类采购负责人', status: 'in_progress' },
  { id: 'rec-meat-price-band', action: 'pricing', targets: ['肉类'], rationale: '肉类客单价低于同价格带均值，建议评估价格带调整方案。', owner: '品类负责人', status: 'planned' },
]
// decisionTexts 已被 weekDecisions 替代，不再使用

// 每周专属事件（从周报原文 Executive Summary 提取）
const weekEvents: Record<number, Array<{ summary: string; event_type: string; attribution: string; source_quote: string; entity_name: string; entity_category: string; confidence: number }>> = {
  20: [
    { summary: '落地页 A/B Test 全量切换——B 组转化率 3.3% vs A 组 2.8%，全量切换后转化率提升 18%。', event_type: 'ACTION', attribution: '产品优化', source_quote: 'B 组（简化首屏+单 CTA）转化率 3.3% vs A 组 2.8%，p<0.01 显著，全量切换后转化率提升 18%。', entity_name: '总体', entity_category: '总体', confidence: 0.95 },
    { summary: '渠道 B 预算审批流程优化落地，审批周期从 5 天缩短至 2 天。', event_type: 'MILESTONE', attribution: '渠道管理', source_quote: '从逐次审批改为双周集中审批，审批周期从 5 天缩短至 2 天。', entity_name: '总体', entity_category: '总体', confidence: 0.93 },
    { summary: '618 预热带动自然流量 +15%，商户主动浏览频次增加。', event_type: 'ACTION', attribution: '营销活动', source_quote: '618 预热带动自然流量 +15%，商户开始关注平台促销活动。', entity_name: '总体', entity_category: '总体', confidence: 0.9 },
  ],
  21: [
    { summary: '落地页 B 方案全量切换首周，转化率稳定在 3.3%。', event_type: 'MILESTONE', attribution: '产品优化', source_quote: 'B 方案全量切换首周，转化率维持 3.3%。', entity_name: '总体', entity_category: '总体', confidence: 0.94 },
    { summary: '渠道 B 双周集中审批第二周期，投放稳定性持续提升。', event_type: 'ACTION', attribution: '渠道管理', source_quote: '双周集中审批运行顺畅，投放稳定性提升。', entity_name: '总体', entity_category: '总体', confidence: 0.9 },
    { summary: '618 预热进入第二周，自然流量保持 +12%。', event_type: 'ACTION', attribution: '营销活动', source_quote: '618 预热持续，自然流量保持高位。', entity_name: '总体', entity_category: '总体', confidence: 0.88 },
  ],
  22: [
    { summary: '618 预热深化，商户备货需求上升，GMV 环比 +1.5%。', event_type: 'ACTION', attribution: '营销活动', source_quote: '618 预热深化，商户备货需求上升。', entity_name: '总体', entity_category: '总体', confidence: 0.9 },
    { summary: '落地页 B 方案转化率维持 3.3%，客单价无显著变化。', event_type: 'MILESTONE', attribution: '产品优化', source_quote: 'B 方案转化率稳定在 3.3%，客单价持平。', entity_name: '总体', entity_category: '总体', confidence: 0.92 },
    { summary: '调料品类 GMV 环比 +1.8%，商户囤货迹象初现。', event_type: 'RISK', attribution: '品类趋势', source_quote: '调料类 GMV 环比 +1.8%，部分商户开始增加库存。', entity_name: '调料类', entity_category: '调料类', confidence: 0.85 },
  ],
  23: [
    { summary: '618 预热进入冲刺阶段，满减券开始试投放。', event_type: 'ACTION', attribution: '营销活动', source_quote: '618 冲刺阶段，满减券试投放 2 仓，核销率 35%。', entity_name: '总体', entity_category: '总体', confidence: 0.9 },
    { summary: '水产周转 3.5 天偏长，计划评估补货节奏调整。', event_type: 'RISK', attribution: '供应节奏', source_quote: '水产周转 3.5 天，存在缺货风险。', entity_name: '水产', entity_category: '水产', confidence: 0.85 },
    { summary: '沙县小吃商户品类宽度升至 4.4，商户粘性持续提升。', event_type: 'MILESTONE', attribution: '商户运营', source_quote: '沙县小吃品类宽度 4.4，延续扩张趋势。', entity_name: '沙县小吃', entity_category: '沙县小吃', confidence: 0.88 },
  ],
  24: [
    { summary: '618 前最后一周，满减券扩至 4 仓试点，核销率 41%。', event_type: 'ACTION', attribution: '营销补贴', source_quote: '满减券扩至 4 仓试点，核销率 41%。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.93 },
    { summary: '夜配试点扩大至 2 仓，蔬菜损耗率初见改善。', event_type: 'MILESTONE', attribution: '夜配履约', source_quote: '夜配试点 2 仓运行，蔬菜损耗率开始下降。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.9 },
    { summary: 'GMV 环比 +2.5%，618 备货推动增长。', event_type: 'ACTION', attribution: '营销活动', source_quote: '618 备货推动 GMV 增长 +2.5%。', entity_name: '总体', entity_category: '总体', confidence: 0.92 },
  ],
  25: [
    { summary: '618 当日 GMV 2,150 万创平台历史新高，满 200 减 30 + 新客首单 8 折组合策略效果显著。', event_type: 'ACTION', attribution: '营销活动', source_quote: '618 当日 GMV 2,150 万创平台历史新高，活动期间日均新客 580 家（+22%）。', entity_name: '总体', entity_category: '总体', confidence: 0.96 },
    { summary: '调料品类 GMV 暴增 22%，麻辣烫商户大规模囤货辣椒油、花椒油。', event_type: 'MILESTONE', attribution: '品类趋势', source_quote: '调料品类 GMV 暴增 22%，单品 GMV 增长 35%。', entity_name: '调料类', entity_category: '调料类', confidence: 0.94 },
    { summary: '毛利率降至 18.2%（-0.8pp），促销补贴压缩利润空间，ROI 1:4.5。', event_type: 'RISK', attribution: '利润监控', source_quote: '毛利率降至 18.2%，但 ROI 1:4.5，整体划算。', entity_name: '总体', entity_category: '总体', confidence: 0.9 },
  ],
  26: [
    { summary: '618 后 GMV 回落至 1,650 万元（-14%），符合预期回调。', event_type: 'ACTION', attribution: '营销活动', source_quote: '618 后 GMV 回落至 1,650 万元，环比 -14%。', entity_name: '总体', entity_category: '总体', confidence: 0.93 },
    { summary: '满减券收缩至 2 仓，核销率回落至 33%。', event_type: 'ACTION', attribution: '营销补贴', source_quote: '满减券收缩至 2 仓，核销率 33%。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.9 },
    { summary: '复购率回落至 65.5%（-2.7pp），大促后用户活跃度下降。', event_type: 'RISK', attribution: '用户运营', source_quote: '复购率回落至 65.5%，大促后用户活跃度下降。', entity_name: '总体', entity_category: '总体', confidence: 0.88 },
  ],
  27: [
    { summary: '夜配试点扩至 3 仓，蔬菜损耗率改善至 2.5%。', event_type: 'MILESTONE', attribution: '夜配履约', source_quote: '夜配扩至 3 仓，蔬菜损耗率改善。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.92 },
    { summary: 'GMV 环比 +4.5%，大促后恢复增长。', event_type: 'ACTION', attribution: '自然增长', source_quote: 'GMV 环比 +4.5%，大促后恢复增长。', entity_name: '总体', entity_category: '总体', confidence: 0.93 },
    { summary: '水产周转 3.3 天，计划 W29 起缩短补货节奏。', event_type: 'RISK', attribution: '供应节奏', source_quote: '水产周转 3.3 天，计划缩短补货节奏。', entity_name: '水产', entity_category: '水产', confidence: 0.85 },
  ],
  28: [
    { summary: '夜配全仓运行首周，蔬菜损耗率降至 2.3% 达标。', event_type: 'MILESTONE', attribution: '夜配履约', source_quote: '夜配全仓首周，蔬菜损耗率降至 2.3%。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.95 },
    { summary: '满减券恢复至 4 仓常态化，核销率 36%。', event_type: 'ACTION', attribution: '营销补贴', source_quote: '满减券恢复至 4 仓，核销率 36%。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.9 },
    { summary: 'GMV 环比 +1.8%，连续两周增长。', event_type: 'ACTION', attribution: '自然增长', source_quote: 'GMV 环比 +1.8%，连续增长。', entity_name: '总体', entity_category: '总体', confidence: 0.92 },
  ],
  29: [
    { summary: '满减券扩至 4 仓，核销率 38%，蔬菜客单价回升。', event_type: 'ACTION', attribution: '营销补贴', source_quote: '满减券扩至 4 仓首周，蔬菜客单价回升。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.94 },
    { summary: '夜配全仓第二个完整周，蔬菜损耗率降至 2.2%。', event_type: 'MILESTONE', attribution: '夜配履约', source_quote: '蔬菜损耗率降至 2.2%，达到 ≤2.3% 目标。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.96 },
    { summary: '水产周转 3.2 天，计划 W36 起补货节奏缩短至 2 天。', event_type: 'RISK', attribution: '供应节奏', source_quote: '水产周转 3.2 天，W36 起补货节奏由 3 天缩短至 2 天。', entity_name: '水产', entity_category: '水产', confidence: 0.9 },
  ],
  30: [
    { summary: '水产供应切换顺利，新供应商首批供货品质稳定，水产 GMV 止跌回升（+4.2%）。', event_type: 'MILESTONE', attribution: '供应链', source_quote: '水产供应切换顺利，水产 GMV 止跌回升。', entity_name: '水产', entity_category: '水产', confidence: 0.94 },
    { summary: '蔬菜品类 GMV 突破 320 万/日，创近 10 周新高，受高温天气叶菜需求增加。', event_type: 'ACTION', attribution: '品类趋势', source_quote: '蔬菜品类 GMV 突破 320 万/日，创近 10 周新高。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.93 },
    { summary: '高温导致蔬菜损耗率上升至 2.8%（上周 2.3%），冷链配送压力增大。', event_type: 'RISK', attribution: '冷链配送', source_quote: '高温导致蔬菜损耗率上升至 2.8%，冷链配送压力增大。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.9 },
  ],
  31: [
    { summary: '开学季备货启动，米类锁价完成 85%，剩余 15% 视价格走势补齐。', event_type: 'ACTION', attribution: '采购策略', source_quote: '开学季备货锁价完成 85%，剩余 15% 需在 8 月 28 日前完成。', entity_name: '米类', entity_category: '米类', confidence: 0.93 },
    { summary: 'GMV 环比 +0.9%，增速放缓但利润端持续改善，毛利率 19.4%。', event_type: 'MILESTONE', attribution: '利润监控', source_quote: '毛利率 19.4%（环比 +0.3pp），利润端持续改善。', entity_name: '总体', entity_category: '总体', confidence: 0.92 },
    { summary: '夜配全仓运行稳定，蔬菜损耗率回落至 2.5%。', event_type: 'MILESTONE', attribution: '夜配履约', source_quote: '夜配全仓运行稳定，蔬菜损耗率回落。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.9 },
  ],
  32: [
    { summary: 'GMV 持平上周（≈），品类宽度维持 3.9，增长进入平台期。', event_type: 'RISK', attribution: '增长监控', source_quote: 'GMV 持平上周，增长进入平台期。', entity_name: '总体', entity_category: '总体', confidence: 0.88 },
    { summary: '开学季备货基本完成，米类锁价 100% 达成。', event_type: 'MILESTONE', attribution: '采购策略', source_quote: '米类锁价 100% 达成。', entity_name: '米类', entity_category: '米类', confidence: 0.94 },
    { summary: '复购率 68.3%，连续 12 周改善，用户粘性持续强化。', event_type: 'MILESTONE', attribution: '用户运营', source_quote: '复购率 68.3%，连续 12 周改善。', entity_name: '总体', entity_category: '总体', confidence: 0.92 },
  ],
  33: [
    { summary: 'GMV 微增 +0.3%，增长动能减弱，需关注下半年策略。', event_type: 'RISK', attribution: '增长监控', source_quote: 'GMV 微增 +0.3%，增长动能减弱。', entity_name: '总体', entity_category: '总体', confidence: 0.85 },
    { summary: '蛋类 GMV 环比 -2.0%，天气转凉后需求季节性下降。', event_type: 'RISK', attribution: '品类趋势', source_quote: '蛋类 GMV 环比 -2.0%，季节性需求下降。', entity_name: '蛋类', entity_category: '蛋类', confidence: 0.87 },
    { summary: '油类 GMV 环比 -0.6%，价格平稳无明显波动。', event_type: 'ACTION', attribution: '品类趋势', source_quote: '油类 GMV 环比 -0.6%，价格平稳。', entity_name: '油类', entity_category: '油类', confidence: 0.85 },
  ],
  34: [
    { summary: 'GMV 环比 +0.6%，毛利率 19.6%（+0.1pp），利润端延续改善。', event_type: 'MILESTONE', attribution: '利润监控', source_quote: '毛利率 19.6%，利润端延续改善。', entity_name: '总体', entity_category: '总体', confidence: 0.93 },
    { summary: '品类宽度升至 4.0，创近 16 周新高，商户活跃度持续提升。', event_type: 'MILESTONE', attribution: '商户运营', source_quote: '品类宽度 4.0，创近 16 周新高。', entity_name: '总体', entity_category: '总体', confidence: 0.9 },
    { summary: '水产 GMV 环比 -0.7%，新供应商品质稳定但需求季节性回落。', event_type: 'RISK', attribution: '品类趋势', source_quote: '水产 GMV 环比 -0.7%，需求季节性回落。', entity_name: '水产', entity_category: '水产', confidence: 0.85 },
  ],
  35: [
    { summary: '满减券扩至 4 仓首周，蔬菜客单价回升至 869 元。', event_type: 'ACTION', attribution: '营销补贴', source_quote: '满减券扩至 4 仓首周，蔬菜客单价回升至 869 元。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.94 },
    { summary: '夜配全仓第二个完整周，蔬菜损耗率降至 2.2%。', event_type: 'MILESTONE', attribution: '夜配履约', source_quote: '蔬菜损耗率降至 2.2%，达到 ≤2.3% 目标。', entity_name: '蔬菜', entity_category: '蔬菜', confidence: 0.96 },
    { summary: '水产周转 3.2 天，W36 起补货节奏由 3 天缩短至 2 天。', event_type: 'RISK', attribution: '供应节奏', source_quote: '水产周转 3.2 天，W36 起补货节奏由 3 天缩短至 2 天。', entity_name: '水产', entity_category: '水产', confidence: 0.9 },
  ],
}

// 每周专属决策
const weekDecisions: Record<number, Array<{ action_taken: string; outcome_detail: string; owner: string }>> = {
  20: [
    { action_taken: '落地页 B 方案确认为全品类默认模板', outcome_detail: '后续新品类上线均采用简化首屏+单 CTA 设计。', owner: '产品负责人' },
    { action_taken: '渠道 B 双周集中审批制度', outcome_detail: '审批周期从 5 天缩短至 2 天。', owner: '渠道负责人' },
    { action_taken: '618 预热节奏确认', outcome_detail: 'W24 启动满减券试投放，W25 正式大促。', owner: '营销负责人' },
  ],
  25: [
    { action_taken: '618 大促组合策略确认', outcome_detail: '满 200 减 30 + 新客首单 8 折，ROI 1:4.5。', owner: '营销负责人' },
    { action_taken: '调料品类囤货预警', outcome_detail: '关注麻辣烫商户囤货行为，评估库存风险。', owner: '品类负责人' },
    { action_taken: '毛利率监控加强', outcome_detail: '促销期间毛利率降至 18.2%，需在 Q4 恢复。', owner: '财务负责人' },
  ],
  29: [
    { action_taken: '满减券由 2 仓扩大到 4 仓', outcome_detail: 'W34 试点核销率 41%，8/20 起扩大至 4 仓。', owner: '营销负责人' },
    { action_taken: '夜配转常态化运营', outcome_detail: '蔬菜损耗率连续 3 周改善，专项关闭并转常态化。', owner: '供应链负责人' },
    { action_taken: '开学季备货锁价', outcome_detail: '米类锁价完成 85%，剩余视价格走势补齐。', owner: '米类采购负责人' },
    { action_taken: '水产补货节奏调整', outcome_detail: '补货周期由 3 天缩短至 2 天，优先覆盖高频 SKU。', owner: '水产采购负责人' },
    { action_taken: '肉类价格带评估', outcome_detail: 'W36 评估价格带调整方案，先做小范围测试。', owner: '品类负责人' },
  ],
  30: [
    { action_taken: '水产供应商切换', outcome_detail: '新供应商首批供货品质稳定，投诉率维持 2.0%。', owner: '水产采购负责人' },
    { action_taken: '高温冷链应急方案', outcome_detail: '增加冷链配送频次，控制损耗率上升。', owner: '供应链负责人' },
    { action_taken: '蔬菜品类重点运营', outcome_detail: 'GMV 突破 320 万/日，叶菜需求持续增加。', owner: '品类负责人' },
  ],
}

function contextForDoc(id: string): DocContext {
  const week = id.replace('weekly_sales_2026_w', '2026-W')
  const weekNum = parseInt(week.replace('2026-W', ''))
  const facts = FACTS.filter((f) => f.week_label === week)
  const wEvents = weekEvents[weekNum] ?? weekEvents[35] ?? []
  const events = wEvents.map((e, i) => ({
    event_id: `evt-${week}-${i + 1}`, entity_id: `ent-${week}-${i + 1}`,
    entity_name: e.entity_name, entity_category: e.entity_category,
    occurred_at: period(week)[i === 0 ? 0 : 1],
    summary: e.summary, event_type: e.event_type, attribution: e.attribution,
    source_quote: e.source_quote, confidence: e.confidence, document_id: id,
  }))
  const wDecisions = weekDecisions[weekNum] ?? weekDecisions[29] ?? []
  const decisions = wDecisions.map((d, index) => ({
    decision_id: `dec-${week}-${index + 1}`, event_id: events[index]?.event_id ?? null,
    action_taken: d.action_taken, owner: d.owner, outcome: index === 0 ? 'PENDING' : 'ACTIVE',
    outcome_detail: d.outcome_detail, decided_at: period(week)[0], effective_from: period(week)[0],
    strategy_id: `strategy-${index + 1}`, based_on_json: JSON.stringify({ week, action_taken: d.action_taken }),
    source_quote: d.action_taken, confidence: 0.9, status: 'active',
  }))
  const recommendations = recommendationSeeds.map((seed, index) => ({
    recommendation_id: `rec-${week}-${index + 1}`, ingest_run_id: `mock-run-${week}`,
    doc_id: id, week_label: week, action_type: seed.action,
    target_entities_json: JSON.stringify(seed.targets),
    based_on_json: JSON.stringify({ facts: 12, events: 2 }),
    strategy_id: `strategy-${index + 1}`,
    expected_impact_json: JSON.stringify({ gmv_change_pct: 2.5, loss_rate_change_pp: -0.2 }),
    confidence: 0.78 + index * 0.02, risk: index === 2 ? '中' : '低',
    owner_role: seed.owner, status: seed.status, rationale: seed.rationale,
    source_quote: seed.rationale, created_at: period(week)[1], reviewed_by: seed.status === 'proposed' ? null : '王总管',
    reviewed_at: seed.status === 'proposed' ? null : period(week)[1],
  }))
  const candidates: Candidate[] = week === '2026-W35' ? [
    { candidate_id: `cand-${week}-1`, ingest_run_id: `mock-run-${week}`, doc_id: id, payload_json: JSON.stringify({ metric: '损耗率', category: '蔬菜', value: 2.2, unit: '%', source_quote: '蔬菜损耗率降至 2.2%。', reason: 'low_confidence', wow: { reported: -0.1, computed_stored: -0.1, diff: 0, tolerance: 0.2 } }), reason: 'low_confidence', confidence: 0.64, status: 'pending', created_at: period(week)[1] },
    { candidate_id: `cand-${week}-2`, ingest_run_id: `mock-run-${week}`, doc_id: id, payload_json: JSON.stringify({ metric: 'GMV', category: '蛋类', value: 98, unit: '万元', source_quote: '蛋类 GMV 98 万元。', reason: 'unit_uncertain' }), reason: 'unit_uncertain', confidence: 0.66, status: 'pending', created_at: period(week)[1] },
  ] : [
    { candidate_id: `cand-${week}-1`, ingest_run_id: `mock-run-${week}`, doc_id: id, payload_json: JSON.stringify({ metric: 'GMV', category: '蛋类', value: categorySeeds.蛋类[WEEK_LABELS.indexOf(week)], unit: '万元', source_quote: '蛋类 GMV 来自表格。', reason: 'low_confidence' }), reason: 'low_confidence', confidence: 0.66, status: 'pending', created_at: period(week)[1] },
  ]
  return { doc_id: id, week_label: week, facts, events, decisions, recommendations, candidates }
}

export const DOC_CONTEXTS: Record<string, DocContext> = Object.fromEntries(DOCUMENTS.map((d) => [d.doc_id, contextForDoc(d.doc_id)]))

export const CANDIDATES = DOCUMENTS.flatMap((d) => DOC_CONTEXTS[d.doc_id].candidates)

export const QUALITY_ISSUES: QualityIssue[] = [
  {
    issue_id: 'issue-w35-veg', doc_id: docId('2026-W35'), week_label: '2026-W35', category: '蔬菜', merchant_type: null,
    metric_name: '损耗率', issue_type: 'definition_change_suspected', severity: 'high', status: 'open',
    current_value: 2.2, prev_reported: 2.3, prev_stored: 2.3, reported_wow: -0.1,
    computed_wow_reported: -0.1, computed_wow_stored: -0.1, diff_reported: 0, diff_stored: 0,
    tolerance: 0.2, delta_kind: 'pp', text_signal: '口径说明变化', evidence_json: JSON.stringify({ source_row: { raw: '蔬菜损耗率降至 2.2%，达到 ≤2.3% 目标。' } }),
    resolution: null, created_at: '2026-08-31T09:00:00',
  },
  {
    issue_id: 'issue-w34-aquatic', doc_id: docId('2026-W34'), week_label: '2026-W34', category: '水产', merchant_type: null,
    metric_name: 'GMV', issue_type: 'prior_value_mismatch', severity: 'medium', status: 'open',
    current_value: 152, prev_reported: 153, prev_stored: 153, reported_wow: -0.7,
    computed_wow_reported: -0.65, computed_wow_stored: -0.65, diff_reported: 0.05, diff_stored: 0.05,
    tolerance: 0.1, delta_kind: '%', text_signal: null, evidence_json: JSON.stringify({ source_row: { raw: '水产 GMV 152 万元，环比 -0.7%。' } }),
    resolution: null, created_at: '2026-08-24T09:00:00',
  },
]

export const ACTIONS: ActionRow[] = [
  { action_id: 'act-1', recommendation_id: 'rec-2026-W35-3', decision_id: 'dec-2026-W35-4', owner: '水产采购负责人', status: 'in_progress', started_at: '2026-08-24', completed_at: null, notes: '将补货节奏由 3 天缩短至 2 天。', created_at: '2026-08-24' },
  { action_id: 'act-2', recommendation_id: 'rec-2026-W35-4', decision_id: 'dec-2026-W35-3', owner: '米类采购负责人', status: 'in_progress', started_at: '2026-08-25', completed_at: null, notes: '8 月 28 日前补齐剩余 15% 锁价。', created_at: '2026-08-25' },
  { action_id: 'act-3', recommendation_id: 'rec-2026-W34-5', decision_id: 'dec-2026-W34-5', owner: '品类负责人', status: 'planned', started_at: null, completed_at: null, notes: 'W36 评估肉类价格带调整方案。', created_at: '2026-08-17' },
]
export const OUTCOMES: Outcome[] = [
  { outcome_id: 'out-1', action_id: 'act-1', evaluated_at: '2026-W35', baseline_json: JSON.stringify({ turnover_days: 3.2 }), actual_json: JSON.stringify({ turnover_days: 2.6 }), metric_changes_json: JSON.stringify({ turnover_days: -0.6 }), success: 'inconclusive', notes: '补货节奏已调整，完整效果需再观察一周。' },
]
export const ACTION_STATS: ActionStats = {
  recommendations_by_status: { proposed: 2, approved: 1, rejected: 0 },
  actions_by_status: { planned: 1, in_progress: 2, completed: 0 },
  outcomes_by_status: { yes: 0, no: 0, inconclusive: 1 },
  adoption_rate: 0.5, completion_rate: 0, success_rate: null, proposed: 2,
}

export function dashboardForWeek(week = '2026-W35'): DashboardData {
  const index = WEEK_LABELS.indexOf(week)
  const gmv = summaryGmv[index]
  const previous = summaryGmv[index - 1] ?? gmv
  const matrix = Object.keys(categorySeeds).map((category) => {
    const value = categorySeeds[category][index]
    return { category, gmv: value, unit: '万元', wow: wow(value, categorySeeds[category][index - 1], 'GMV'), share: Number((value / gmv * 100).toFixed(1)) }
  }).sort((a, b) => b.gmv - a.gmv)
  const ctx = DOC_CONTEXTS[docId(week)]
  return {
    empty: false, week_label: week,
    doc_title: `2026年第${isoWeek(week)}周 销售周报`,
    period_start: period(week)[0], period_end: period(week)[1],
    kpi: [
      { metric: 'GMV', value: gmv, unit: '万元', wow: wow(gmv, previous, 'GMV') },
      { metric: '订单量', value: Math.round(gmv * 4.5), unit: '单', wow: 0.4 },
      { metric: '客单价', value: Math.round(gmv * 4.5 * 10000 / Math.max(1, Math.round(gmv * 4.5))), unit: '元', wow: 0.1 },
      { metric: '复购率', value: 68.5, unit: '%', wow: 0.1 },
      { metric: '毛利率', value: 19.7, unit: '%', wow: 0.1 },
      { metric: '净利率', value: 4.7, unit: '%', wow: 0.1 },
      { metric: '损耗率', value: 2.2, unit: '%', wow: -0.1 },
      { metric: '转化率', value: 3.3, unit: '%', wow: 0.02 },
    ],
    matrix, total_gmv: gmv,
    trends: WEEK_LABELS.map((label, i) => ({ week_label: label, value: summaryGmv[i], wow: wow(summaryGmv[i], summaryGmv[i - 1], 'GMV') })),
    events: ctx.events.map((event) => ({ event_id: event.event_id, summary: event.summary, event_type: event.event_type, occurred_at: event.occurred_at })),
    decisions: ctx.decisions.map((decision) => ({ decision_id: decision.decision_id, action_taken: decision.action_taken, outcome: decision.outcome })),
  }
}

export function seriesFor(metric: string, entity: string): Series {
  const owner = ONTOLOGY.aliases[entity] ?? entity
  const points = WEEK_LABELS.map((week, index) => {
    const fact = FACTS.find((f) => f.week_label === week && f.metric_name === metric && (f.category === owner || f.merchant_type === owner))
    return {
      week_label: week, value: fact?.metric_value ?? 0, wow_change_pct: fact?.wow_change_pct ?? null,
      reported_wow: fact?.wow_change_pct ?? null, wow_check_status: index ? 'ok' : 'baseline',
      definition_id: metric === '损耗率' && index >= 13 ? 'def-loss-night-v2' : 'def-standard-v1',
    }
  })
  return {
    metric, entity: owner, points,
    segments: [
      { from: WEEK_LABELS[0], to: WEEK_LABELS[12], definition_id: 'def-standard-v1' },
      { from: WEEK_LABELS[13], to: WEEK_LABELS[15], definition_id: 'def-loss-night-v2' },
    ],
    break_points: metric === '损耗率' ? [{ week: WEEK_LABELS[13], reason: '夜配口径切换', from_definition: 'def-standard-v1', to_definition: 'def-loss-night-v2' }] : [],
    comparability: metric === '损耗率' ? 'not_comparable' : 'comparable',
    derived_view_available: true,
  }
}

export const DOCUMENT_DETAIL: Record<string, DocumentDetail> = Object.fromEntries(
  DOCUMENTS.map((row) => [row.doc_id, documentDetail(row.doc_id)]),
)

const resultRows = (metric: string, _scope = '品类') => {
  const index = 15
  const unit = metric === 'GMV' ? '万元' : metric === '客单价' ? '元' : metric === '品类宽度' ? '个' : '%'
  const data = metric === 'GMV' || metric === 'GMV占比' || metric === '毛利率' || metric === '客单价' || metric === '复购率' || metric === '品类宽度' || metric === '损耗率'
    ? Object.keys(categorySeeds).map((category) => ({ category, metric_name: metric, metric_value: (metricByCategory[category]?.[metric]?.[index] ?? categorySeeds[category][index]), metric_unit: unit, wow_change_pct: wow(metricByCategory[category]?.[metric]?.[index] ?? categorySeeds[category][index], metricByCategory[category]?.[metric]?.[index - 1] ?? categorySeeds[category][index - 1], metric) }))
    : Object.keys(merchantSeeds).map((merchant) => ({ merchant_type: merchant, metric_name: metric, metric_value: metric === 'GMV' ? merchantSeeds[merchant][index] : Math.round(merchantSeeds[merchant][index] * 12.8), metric_unit: unit, wow_change_pct: 0.4 }))
  return data.sort((a, b) => b.metric_value - a.metric_value)
}

const unitKindOf = (unit?: string): RenderColumn['unit_kind'] =>
  unit === '万元' ? 'money_wan'
    : unit === '元' ? 'currency_yuan'
      : unit === '%' ? 'percent'
        : unit ? 'other' : undefined

// 已知列的中文标签与角色；顺序即表头顺序：周次 → 口径对象 → 指标 → 数值 → 环比
type KnownColumn = Pick<RenderColumn, 'key' | 'label' | 'role'> & { unit_kind?: RenderColumn['unit_kind'] }

const KNOWN_COLUMNS: KnownColumn[] = [
  { key: 'week_label', label: '周次', role: 'subject' },
  { key: 'category', label: '品类', role: 'subject' },
  { key: 'merchant_type', label: '商户类型', role: 'subject' },
  { key: 'metric_name', label: '指标', role: 'subject' },
  { key: 'metric_value', label: '数值', role: 'measure' },
  { key: 'wow_change_pct', label: '环比', role: 'measure', unit_kind: 'percent' },
  { key: 'yoy_change_pct', label: '同比', role: 'measure', unit_kind: 'percent' },
]

// metric_unit 不单独成列：它并进「数值」的单位里，否则表里会出现一列重复的单位
const NON_COLUMN_KEYS = new Set(['metric_unit', 'source_quote'])

/** 表头只声明行里真实存在的列。
 *
 *  旧实现固定按「品类/商户 → 指标 → 数值 → 环比」四列出表，结果趋势题的
 *  week_label 根本没进表头，反而给了一整列空值的「商户类型」；同时 SQL 的
 *  SELECT 又只取两列，三处各说各话。现在列从行形状推出来，缺什么就不出什么。 */
const renderSpec = (rows: Record<string, unknown>[]): RenderSpec => {
  const first = rows[0] ?? {}
  const unit = first.metric_unit as string | undefined
  const keys = new Set<string>()
  rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)))

  const columns: RenderColumn[] = KNOWN_COLUMNS
    .filter((known) => keys.has(known.key))
    .map((known) => ({
      ...known,
      unit: known.key === 'metric_value' ? unit : known.unit_kind === 'percent' ? '%' : undefined,
      unit_kind: known.key === 'metric_value' ? unitKindOf(unit) : known.unit_kind,
    }))

  // 未登记的列（统计量、定义字段…）不丢，按「数字进度量、其余进主语」兜住
  keys.forEach((key) => {
    if (KNOWN_COLUMNS.some((known) => known.key === key) || NON_COLUMN_KEYS.has(key)) return
    columns.push({
      key,
      label: key,
      role: rows.some((row) => typeof row[key] === 'number') ? 'measure' : 'subject',
    })
  })
  return { columns }
}

export const MOCK_QUESTIONS: AskResponse[] = [
  {
    question_type: 'rank', answer: '2026-W35 品类 GMV 前三名依次是肉类 417 万元、蔬菜 316 万元、调料类 221 万元；肉类占比 22.2%，居全品类首位。',
    rows: resultRows('GMV'), confidence: 'high', evidence: ['《2026-W35 销售周报》品类 GMV 贡献表', '事实表 16 周序列'], engine: 'rules', path: 'sql', sql: 'SELECT category, metric_value, metric_unit, wow_change_pct\nFROM facts\nWHERE week_label = \'2026-W35\' AND metric_name = \'GMV\' AND category <> \'总体\'\nORDER BY metric_value DESC;', follow_ups: ['肉类 GMV 最近 5 周趋势', '蔬菜和肉类的差距是多少', '哪些品类 GMV 环比下降'],
    calculation: { formula: '按 category 聚合后按 metric_value 降序', result: { top1: '肉类', top1_gmv: 417, top1_share: 22.2 }, explanation: '仅取总体之外的品类行。' },
    render_spec: renderSpec(resultRows('GMV')), validation_report: { checked_rows: 12, matched_rows: 12, rejected_rows: 0, derived_columns: [], aggregate_used: true, anchors_ok: true, missing_anchors: [] },
    understanding: { executor: 'compiler', tool: 'metric_facts', plan: { operation: 'rank' }, args: { metric: 'GMV', week: '2026-W35' }, slots: [{ key: 'week', label: '周次', kind: 'week', values: ['2026-W35'], options: WEEK_LABELS }], editable: true },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '2026-W35 总体 GMV 为 1,880 万元/日，环比 +0.3%。这是连续第 3 周加速。',
    rows: [{ week_label: '2026-W35', category: '总体', metric_name: 'GMV', metric_value: 1880, metric_unit: '万元', wow_change_pct: 0.3 }], confidence: 'high', evidence: ['《2026-W35 销售周报》核心指标看板'], engine: 'rules', path: 'sql', sql: 'SELECT metric_value, metric_unit, wow_change_pct\nFROM facts\nWHERE week_label = \'2026-W35\' AND category = \'总体\' AND metric_name = \'GMV\';', follow_ups: ['总体 GMV 最近 5 周趋势', '毛利率是多少', '净利润额是多少'],
    render_spec: renderSpec([{ category: '总体', metric_name: 'GMV', metric_value: 1880, metric_unit: '万元', wow_change_pct: 0.3 }]),
    understanding: { executor: 'compiler', tool: 'metric_facts', plan: { operation: 'lookup' }, args: { metric: 'GMV', category: '总体', week: '2026-W35' }, slots: [{ key: 'category', label: '品类', kind: 'category', values: ['总体'], options: ONTOLOGY.dimensions.category }], editable: true },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '2026-W35 总体毛利率为 19.7%，环比 +0.1pp；净利率为 4.7%，环比 +0.1pp。',
    rows: [
      { week_label: '2026-W35', category: '总体', metric_name: '毛利率', metric_value: 19.7, metric_unit: '%', wow_change_pct: 0.1 },
      { week_label: '2026-W35', category: '总体', metric_name: '净利率', metric_value: 4.7, metric_unit: '%', wow_change_pct: 0.1 },
    ], confidence: 'high', evidence: ['《2026-W35 销售周报》核心指标看板'], engine: 'rules', path: 'sql', sql: 'SELECT metric_name, metric_value, metric_unit\nFROM facts\nWHERE week_label = \'2026-W35\' AND category = \'总体\' AND metric_name IN (\'毛利率\', \'净利率\') ORDER BY metric_name;', follow_ups: ['毛利率最近 5 周趋势', '哪些品类毛利率最高'],
    render_spec: renderSpec([{ category: '总体', metric_name: '毛利率', metric_value: 19.7, metric_unit: '%', wow_change_pct: 0.1 }]),
    understanding: { executor: 'compiler', plan: { operation: 'lookup' }, args: { metrics: ['毛利率', '净利率'], week: '2026-W35' }, slots: [], editable: true },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '2026-W35 总体客单价为 2,189 元，环比约 +0.0%；订单量约 8,590 单/日。',
    rows: [
      { week_label: '2026-W35', category: '总体', metric_name: '客单价', metric_value: 2189, metric_unit: '元', wow_change_pct: 0 },
      { week_label: '2026-W35', category: '总体', metric_name: '订单量', metric_value: 8590, metric_unit: '单', wow_change_pct: 0.3 },
    ], confidence: 'high', evidence: ['《2026-W35 销售周报》核心指标看板'], engine: 'rules', path: 'sql', sql: 'SELECT metric_name, metric_value, metric_unit FROM facts WHERE week_label = \'2026-W35\' AND category = \'总体\' AND metric_name IN (\'客单价\', \'订单量\');', follow_ups: ['蔬菜客单价是多少', '哪个商户类型客单价最高'],
    render_spec: renderSpec([{ category: '总体', metric_name: '客单价', metric_value: 2189, metric_unit: '元', wow_change_pct: 0 }]),
    understanding: { executor: 'compiler', plan: { operation: 'lookup' }, args: { metrics: ['客单价', '订单量'], week: '2026-W35' }, slots: [], editable: true },
    intent: 'METRIC_VALUE',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'trend', answer: `总体 GMV 最近 5 周从 W31 的 ${summaryGmv[11].toLocaleString()} 万元升至 W35 的 ${summaryGmv[15].toLocaleString()} 万元，整体上行；W32 持平 ${summaryGmv[12].toLocaleString()} 万元后连续 3 周修复。`,
    rows: WEEK_LABELS.slice(-5).map((week, i) => ({ week_label: week, metric_name: 'GMV', metric_value: summaryGmv[11 + i], metric_unit: '万元', wow_change_pct: wow(summaryGmv[11 + i], summaryGmv[10 + i], 'GMV') })), confidence: 'high', evidence: ['事实表 2026-W31 至 2026-W35'], engine: 'rules', path: 'sql', sql: 'SELECT week_label, metric_value FROM facts\nWHERE category = \'总体\' AND metric_name = \'GMV\' AND week_label >= \'2026-W31\'\nORDER BY week_label;', follow_ups: ['哪一周增长最快', '总体 GMV 全周期趋势'],
    calculation: { formula: `(${summaryGmv[15]} - ${summaryGmv[11]}) / ${summaryGmv[11]} × 100%`, result: { change_pct: Number(((summaryGmv[15] - summaryGmv[11]) / summaryGmv[11] * 100).toFixed(1)) }, explanation: '以 W31 为起点、W35 为终点。' },
    render_spec: renderSpec([{ week_label: '2026-W35', category: '总体', metric_name: 'GMV', metric_value: 1880, metric_unit: '万元', wow_change_pct: 0.3 }]),
    understanding: { executor: 'compiler', plan: { operation: 'trend' }, args: { metric: 'GMV', category: '总体', last_n_weeks: 5 }, slots: [{ key: 'weeks', label: '周数', kind: 'integer', values: ['5'], options: ['3', '5', '8', '16'] }], editable: true },
    intent: 'METRIC_VALUE',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'trend', answer: '蔬菜客单价最近 5 周由 880 元降至 W33 的 858 元，随后连续两周回升至 869 元；满减券是主要解释因素。',
    rows: WEEK_LABELS.slice(-5).map((week, i) => ({ week_label: week, metric_name: '客单价', metric_value: metricByCategory.蔬菜.客单价[11 + i], metric_unit: '元', wow_change_pct: wow(metricByCategory.蔬菜.客单价[11 + i], metricByCategory.蔬菜.客单价[10 + i], '客单价') })), confidence: 'high', evidence: ['《2026-W34 销售周报》满减券试点', '《2026-W35 销售周报》满减券扩面'], engine: 'rules', path: 'sql', sql: 'SELECT week_label, metric_value FROM facts WHERE category = \'蔬菜\' AND metric_name = \'客单价\' AND week_label >= \'2026-W31\' ORDER BY week_label;', follow_ups: ['为什么蔬菜客单价回升', '蔬菜损耗率最近 5 周趋势'],
    render_spec: renderSpec([{ week_label: '2026-W35', category: '蔬菜', metric_name: '客单价', metric_value: 869, metric_unit: '元', wow_change_pct: 1 }]),
    understanding: { executor: 'compiler', plan: { operation: 'trend' }, args: { metric: '客单价', category: '蔬菜' }, slots: [{ key: 'category', label: '品类', kind: 'category', values: ['蔬菜'], options: ONTOLOGY.dimensions.category }], editable: true },
    intent: 'METRIC_VALUE',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'attribution', answer: '蔬菜损耗率下降主要来自夜配全仓：夜间损耗稳定在 1.4%，低于白天 2.7%；损耗率由 W30 的 2.8% 降至 W35 的 2.2%，累计下降 0.6pp。',
    rows: [
      { week_label: '2026-W30', category: '蔬菜', metric_name: '损耗率', metric_value: 2.8, metric_unit: '%', wow_change_pct: 0.3 },
      { week_label: '2026-W33', category: '蔬菜', metric_name: '损耗率', metric_value: 2.5, metric_unit: '%', wow_change_pct: -0.1 },
      { week_label: '2026-W35', category: '蔬菜', metric_name: '损耗率', metric_value: 2.2, metric_unit: '%', wow_change_pct: -0.1 },
    ], confidence: 'high', evidence: ['《2026-W34 销售周报》夜配全仓首个完整周', '《2026-W35 销售周报》夜配全仓第二个完整周'], engine: 'rules', path: 'explain', sql: 'SELECT week_label, metric_value FROM facts WHERE category = \'蔬菜\' AND metric_name = \'损耗率\' ORDER BY week_label;', follow_ups: ['夜配对毛利有什么影响', '蔬菜损耗率全年最高是哪周'],
    calculation: { formula: '2.2% - 2.8% = -0.6pp', result: { loss_change_pp: -0.6 }, explanation: '以 W30 高点与 W35 对比。' },
    render_spec: renderSpec([{ week_label: '2026-W35', category: '蔬菜', metric_name: '损耗率', metric_value: 2.2, metric_unit: '%', wow_change_pct: -0.1 }]),
    understanding: { executor: 'compiler', plan: { operation: 'why' }, args: { metric: '损耗率', category: '蔬菜' }, slots: [], editable: true },
    intent: 'TREND',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'compare', answer: '沙县小吃客单价约 2,145 元，兰州拉面约 2,040 元，前者是后者的 1.05 倍，高 105 元。',
    rows: [
      { merchant_type: '沙县小吃', metric_name: '客单价', metric_value: 2145, metric_unit: '元', wow_change_pct: 0.4 },
      { merchant_type: '兰州拉面', metric_name: '客单价', metric_value: 2040, metric_unit: '元', wow_change_pct: 0.5 },
    ], confidence: 'high', evidence: ['《2026-W35 销售周报》商户分类对比分析'], engine: 'rules', path: 'sql', sql: 'SELECT merchant_type, metric_value FROM facts WHERE week_label = \'2026-W35\' AND metric_name = \'客单价\' AND merchant_type IN (\'沙县小吃\', \'兰州拉面\');', follow_ups: ['沙县小吃 GMV 是多少', '哪个商户类型复购率最高'],
    calculation: { formula: '2145 ÷ 2040', result: { ratio: 1.051, diff_yuan: 105 }, explanation: '同周、同商户维度、同客单价口径。' },
    render_spec: renderSpec([{ merchant_type: '沙县小吃', metric_name: '客单价', metric_value: 2145, metric_unit: '元', wow_change_pct: 0.4 }]),
    understanding: { executor: 'operations', tool: 'ratio', plan: { operation: 'ratio' }, args: { left: '沙县小吃客单价', right: '兰州拉面客单价' }, slots: [], editable: true },
    intent: 'ATTRIBUTION',
    terms: { categories: ["蔬菜"], merchants: [], metrics: ["损耗率"] },
  },
  {
    question_type: 'distribution', answer: '2026-W35 肉类占比 22.2%，在 10 个品类中排名第一；蔬菜占 16.8%，调料类占 11.8%。',
    rows: resultRows('GMV占比'), confidence: 'high', evidence: ['《2026-W35 销售周报》品类 GMV 贡献表'], engine: 'rules', path: 'sql', sql: 'SELECT category, metric_value FROM facts WHERE week_label = \'2026-W35\' AND metric_name = \'GMV占比\' ORDER BY metric_value DESC;', follow_ups: ['品类占比分布如何', '占比最低的是哪个品类'],
    render_spec: renderSpec(resultRows('GMV占比')),
    understanding: { executor: 'compiler', plan: { operation: 'distribution' }, args: { metric: 'GMV占比', week: '2026-W35' }, slots: [], editable: true },
    intent: 'COMPARISON',
    terms: { categories: [], merchants: ["沙县小吃","兰州拉面"], metrics: ["客单价"] },
  },
  {
    question_type: 'recommendation', answer: '当前有 2 条待审批建议：夜配转常态化运营、满减券纳入 Q4 预算评估。另有 2 条行动正在执行，分别覆盖水产补货和开学季锁价。',
    rows: recommendationSeeds.map((item, index) => ({ recommendation_id: `rec-2026-W35-${index + 1}`, action_type: item.action, target: item.targets.join('、'), owner_role: item.owner, status: item.status })), confidence: 'high', evidence: ['W35 行动闭环', '事实表趋势与事件记录'], engine: 'rules', path: 'rule', sql: 'SELECT recommendation_id, action_type, owner_role, status FROM recommendations WHERE week_label = \'2026-W35\';', follow_ups: ['哪些建议已采纳', '水产补货行动进展如何'],
    understanding: { executor: 'compiler', plan: { operation: 'todo' }, args: { week: '2026-W35' }, slots: [], editable: false },
    intent: 'COMPARISON',
    terms: { categories: [], merchants: ["沙县小吃","兰州拉面"], metrics: ["客单价"] },
  },
  {
    question_type: 'quality', answer: '当前有 2 条待处理数据质量问题：1 条高优先级口径疑似变更（蔬菜损耗率），1 条中优先级上期值不一致（水产 GMV）。',
    rows: QUALITY_ISSUES.map((issue) => ({ issue_id: issue.issue_id, week_label: issue.week_label, category: issue.category, metric_name: issue.metric_name, issue_type: issue.issue_type, severity: issue.severity, status: issue.status })), confidence: 'high', evidence: ['数据质量三角校验报告'], engine: 'rules', path: 'sql', sql: 'SELECT issue_id, week_label, category, metric_name, issue_type, severity\nFROM data_quality_issues WHERE status = \'open\';', follow_ups: ['蔬菜损耗率为什么疑似口径变化', '水产 GMV 上期值差多少'],
    understanding: { executor: 'compiler', plan: { operation: 'quality' }, args: {}, slots: [], editable: false },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ["GMV占比"] },
  },
  {
    question_type: 'definition', answer: 'GMV 在本 Demo 中定义为统计周期内、指定仓与商户范围内的成交金额，展示口径为“日均 GMV（万元）”。品类占比按该品类 GMV ÷ 总体 GMV 计算。',
    rows: [{ metric_name: 'GMV', definition: '成交金额，日均口径，单位万元', aggregation: 'mean', allowed_dimensions: 'category, merchant_type' }, { metric_name: 'GMV占比', definition: '品类 GMV ÷ 总体 GMV', aggregation: 'derived', allowed_dimensions: 'category' }], confidence: 'high', evidence: ['本体 schema 1.1'], engine: 'rules', path: 'rule', sql: 'SELECT metric_name, definition FROM ontology_metrics WHERE metric_name IN (\'GMV\', \'GMV占比\');', follow_ups: ['毛利率怎么定义', '损耗率口径是什么'],
    understanding: { executor: 'compiler', plan: { operation: 'definition' }, args: { metrics: ['GMV', 'GMV占比'] }, slots: [], editable: false },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ["GMV占比"] },
  },
  {
    question_type: 'scenario', answer: '如果蔬菜 GMV 上涨 10%，按 W35 的 316 万元/日计算，将增加约 31.6 万元/日，情景 GMV 约 347.6 万元/日。',
    rows: [{ category: '蔬菜', metric_name: 'GMV', base_value: 316, change_pct: 10, scenario_value: 347.6, metric_unit: '万元' }], confidence: 'medium', evidence: ['2026-W35 蔬菜 GMV'], engine: 'rules', path: 'explain', sql: 'SELECT metric_value FROM facts WHERE week_label = \'2026-W35\' AND category = \'蔬菜\' AND metric_name = \'GMV\';', follow_ups: ['如果上涨 20% 呢', '对总体 GMV 影响多少'],
    calculation: { formula: '316 × (1 + 10%) = 347.6', result: { base: 316, delta: 31.6, scenario: 347.6 }, explanation: '仅做确定性算术推演，不假设其他品类联动。', caveats: ['不构成预测，不包含成本、补贴与供应约束。'] },
    render_spec: { columns: [{ key: 'category', role: 'subject', label: '品类' }, { key: 'metric_name', role: 'subject', label: '指标' }, { key: 'base_value', role: 'measure', label: '基准值', unit: '万元', unit_kind: 'money_wan' }, { key: 'change_pct', role: 'measure', label: '变化率', unit: '%', unit_kind: 'percent' }, { key: 'scenario_value', role: 'derived', label: '情景值', unit: '万元', unit_kind: 'money_wan' }] },
    understanding: { executor: 'operations', tool: 'scenario', plan: { operation: 'scenario' }, args: { category: '蔬菜', metric: 'GMV', change_pct: 10 }, slots: [{ key: 'change_pct', label: '变化率', kind: 'percent', values: ['10'], options: ['5', '10', '15', '20'] }], editable: true },
    intent: 'RECOMMENDATION',
    terms: { categories: [], merchants: [], metrics: [] },
  },
  {
    question_type: 'pnl', answer: 'W35 总体损益结构为：GMV 1,880 万元，商品成本率 80.3%，毛利率 19.7%；运输、仓储、销售、损耗和管理费用率分别为 6.4%、2.7%、3.3%、1.7%、0.8%。',
    rows: [
      { level: 'GMV', rate: 100, amount: 1880 }, { level: '商品成本', rate: 80.3, amount: 1509.6 }, { level: '毛利润', rate: 19.7, amount: 370.4 },
      { level: '运输成本', rate: 6.4, amount: 120.3 }, { level: '仓储成本', rate: 2.7, amount: 50.8 }, { level: '销售费用', rate: 3.3, amount: 62 }, { level: '损耗成本', rate: 1.7, amount: 32 }, { level: '管理费用', rate: 0.8, amount: 15 }, { level: '净利润', rate: 4.7, amount: 88.4 },
    ], confidence: 'high', evidence: ['《2026-W35 销售周报》损益结构', '本体指标定义'], engine: 'rules', path: 'sql', sql: 'SELECT metric_name, metric_value FROM facts WHERE week_label = \'2026-W35\' AND category = \'总体\' AND metric_name IN (\'商品成本率\', \'运输成本率\', \'仓储成本率\', \'销售费用率\', \'损耗成本率\', \'管理费用率\', \'毛利率\', \'净利率\');', follow_ups: ['净利润额是多少', '哪些成本率环比上升'],
    render_spec: { columns: [{ key: 'level', role: 'subject', label: '损益层' }, { key: 'rate', role: 'measure', label: '占 GMV', unit: '%', unit_kind: 'percent' }, { key: 'amount', role: 'derived', label: '金额', unit: '万元', unit_kind: 'money_wan' }] },
    understanding: { executor: 'compiler', plan: { operation: 'pnl' }, args: { week: '2026-W35' }, slots: [], editable: true },
    intent: 'DEFINITION',
    terms: { categories: [], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '2026-W35 总体毛利润额约 370.4 万元/日，净利润额约 88.4 万元/日。',
    rows: [
      { week_label: '2026-W35', category: '总体', metric_name: '毛利润额', metric_value: 370.4, metric_unit: '万元', wow_change_pct: 0.9 },
      { week_label: '2026-W35', category: '总体', metric_name: '净利润额', metric_value: 88.4, metric_unit: '万元', wow_change_pct: 1.1 },
    ], confidence: 'high', evidence: ['《2026-W35 销售周报》损益结构'], engine: 'rules', path: 'sql', sql: 'SELECT metric_name, metric_value FROM facts WHERE week_label = \'2026-W35\' AND category = \'总体\' AND metric_name IN (\'毛利润额\', \'净利润额\');', follow_ups: ['净利润率是多少', '毛利润额最近 5 周趋势'],
    render_spec: renderSpec([{ category: '总体', metric_name: '毛利润额', metric_value: 370.4, metric_unit: '万元', wow_change_pct: 0.9 }]),
    understanding: { executor: 'compiler', plan: { operation: 'lookup' }, args: { metrics: ['毛利润额', '净利润额'] }, slots: [], editable: true },
    intent: 'METRIC_VALUE',
    terms: { categories: ["总体"], merchants: [], metrics: ["毛利率","净利率"] },
  },
  {
    question_type: 'rank', answer: '2026-W35 商户类型 GMV 前三位是麻辣烫 320 万元、沙县小吃 204 万元、兰州拉面 221 万元；若按数值排序，麻辣烫第一、兰州拉面第二、沙县小吃第三。',
    rows: resultRows('GMV', '商户').sort((a, b) => (b.metric_value as number) - (a.metric_value as number)), confidence: 'high', evidence: ['《2026-W35 销售周报》商户分类对比分析'], engine: 'rules', path: 'sql', sql: 'SELECT merchant_type, metric_value FROM facts WHERE week_label = \'2026-W35\' AND metric_name = \'GMV\' AND merchant_type IS NOT NULL ORDER BY metric_value DESC;', follow_ups: ['哪个商户类型复购率最高', '沙县小吃客单价是多少'],
    render_spec: renderSpec(resultRows('GMV', '商户')),
    understanding: { executor: 'compiler', plan: { operation: 'rank' }, args: { metric: 'GMV', dimension: 'merchant_type' }, slots: [], editable: true },
    intent: 'METRIC_VALUE',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '2026-W35 麻辣烫 GMV 为 320 万元/日，客单价 2,170 元，复购率 66.5%，品类宽度 4.7。',
    rows: [
      { merchant_type: '麻辣烫', metric_name: 'GMV', metric_value: 320, metric_unit: '万元' },
      { merchant_type: '麻辣烫', metric_name: '客单价', metric_value: 2170, metric_unit: '元' },
      { merchant_type: '麻辣烫', metric_name: '复购率', metric_value: 66.5, metric_unit: '%' },
      { merchant_type: '麻辣烫', metric_name: '品类宽度', metric_value: 4.7, metric_unit: '个' },
    ], confidence: 'high', evidence: ['《2026-W35 销售周报》商户分类对比分析'], engine: 'rules', path: 'sql', sql: 'SELECT metric_name, metric_value, metric_unit FROM facts WHERE week_label = \'2026-W35\' AND merchant_type = \'麻辣烫\';', follow_ups: ['麻辣烫 GMV 趋势', '麻辣烫和沙县小吃哪个复购率高'],
    render_spec: renderSpec([{ merchant_type: '麻辣烫', metric_name: 'GMV', metric_value: 320, metric_unit: '万元', wow_change_pct: 0.6 }]),
    understanding: { executor: 'compiler', plan: { operation: 'lookup' }, args: { merchant: '麻辣烫' }, slots: [], editable: true },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '2026-W35 水产 GMV 为 153 万元/日，环比 +0.7%；水产损耗率 2.7%，较前期高点持续改善。',
    rows: [
      { week_label: '2026-W35', category: '水产', metric_name: 'GMV', metric_value: 153, metric_unit: '万元', wow_change_pct: 0.7 },
      { week_label: '2026-W35', category: '水产', metric_name: '损耗率', metric_value: 2.7, metric_unit: '%', wow_change_pct: -0.1 },
    ], confidence: 'high', evidence: ['《2026-W35 销售周报》品类维度拆解'], engine: 'rules', path: 'sql', sql: 'SELECT metric_name, metric_value FROM facts WHERE week_label = \'2026-W35\' AND category = \'水产\' AND metric_name IN (\'GMV\', \'损耗率\');', follow_ups: ['水产周转天数是多少', '水产 GMV 最近 5 周趋势'],
    render_spec: renderSpec([{ category: '水产', metric_name: 'GMV', metric_value: 153, metric_unit: '万元', wow_change_pct: 0.7 }]),
    understanding: { executor: 'compiler', plan: { operation: 'lookup' }, args: { category: '水产' }, slots: [], editable: true },
    intent: 'METRIC_VALUE',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'trend', answer: `总体净利率最近 5 周从 W31 的 ${summaryNetMargin[11]}% 升至 W35 的 ${summaryNetMargin[15]}%，呈持续改善；W32 持平后连续修复。`,
    rows: WEEK_LABELS.slice(-5).map((week, i) => ({ week_label: week, metric_name: '净利率', metric_value: summaryNetMargin[11 + i], metric_unit: '%', wow_change_pct: wow(summaryNetMargin[11 + i], summaryNetMargin[10 + i], '净利率') })), confidence: 'high', evidence: ['事实表 2026-W31 至 2026-W35'], engine: 'rules', path: 'sql', sql: 'SELECT week_label, metric_value FROM facts WHERE category = \'总体\' AND metric_name = \'净利率\' AND week_label >= \'2026-W31\' ORDER BY week_label;', follow_ups: ['净利率为什么改善', '哪些品类净利率最高'],
    render_spec: renderSpec([{ week_label: '2026-W35', category: '总体', metric_name: '净利率', metric_value: 4.7, metric_unit: '%', wow_change_pct: 0.1 }]),
    understanding: { executor: 'compiler', plan: { operation: 'trend' }, args: { metric: '净利率' }, slots: [], editable: true },
    intent: 'METRIC_VALUE',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'attribution', answer: '总体 GMV 增长主要来自蔬菜、水产与米类：蔬菜 316 万元、水产 153 万元、米类 188 万元；开学备货与满减券共同拉动需求。',
    rows: [
      { category: '蔬菜', metric_name: 'GMV', metric_value: 316, wow_change_pct: 0.3 },
      { category: '水产', metric_name: 'GMV', metric_value: 153, wow_change_pct: 0.7 },
      { category: '米类', metric_name: 'GMV', metric_value: 188, wow_change_pct: 0.4 },
    ], confidence: 'medium', evidence: ['《2026-W35 销售周报》品类异常归因', 'W34-W35 决策记录'], engine: 'rules', path: 'explain', sql: 'SELECT category, metric_value, wow_change_pct FROM facts WHERE week_label = \'2026-W35\' AND metric_name = \'GMV\' AND category <> \'总体\';', follow_ups: ['哪个品类增长最快', '蔬菜增长的原因是什么'],
    render_spec: renderSpec([{ category: '蔬菜', metric_name: 'GMV', metric_value: 316, metric_unit: '万元', wow_change_pct: 0.3 }]),
    understanding: { executor: 'compiler', plan: { operation: 'why' }, args: { metric: 'GMV' }, slots: [], editable: true },
    intent: 'TREND',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'compare', answer: 'W34 与 W35 相比，总体 GMV 从 1,874 万元升至 1,880 万元，增加 6 万元/日，环比 +0.3%；毛利率从 19.6% 升至 19.7%。',
    rows: [
      { week_label: '2026-W34', metric_name: 'GMV', metric_value: 1874, metric_unit: '万元' },
      { week_label: '2026-W35', metric_name: 'GMV', metric_value: 1880, metric_unit: '万元' },
      { week_label: '2026-W35', metric_name: '环比', metric_value: 0.3, metric_unit: '%' },
    ], confidence: 'high', evidence: ['事实表 W34/W35 核心指标'], engine: 'rules', path: 'sql', sql: 'SELECT week_label, metric_name, metric_value FROM facts WHERE week_label IN (\'2026-W34\', \'2026-W35\') AND category = \'总体\' AND metric_name IN (\'GMV\', \'毛利率\') ORDER BY week_label;', follow_ups: ['W33 和 W34 呢', 'GMV 差距贡献来自哪里'],
    calculation: { formula: '1880 - 1874 = 6', result: { diff: 6 }, explanation: '同口径周对比。' },
    render_spec: renderSpec([{ week_label: '2026-W35', category: '总体', metric_name: 'GMV', metric_value: 1880, metric_unit: '万元', wow_change_pct: 0.3 }]),
    understanding: { executor: 'operations', tool: 'difference', plan: { operation: 'difference' }, args: { left: 'W35', right: 'W34' }, slots: [], editable: true },
    intent: 'ATTRIBUTION',
    terms: { categories: ["蔬菜"], merchants: [], metrics: ["损耗率"] },
  },
  {
    question_type: 'recommendation', answer: '建议优先推进两件事：一是确认满减券 4 仓 ROI 是否维持在 1:5 以上；二是将水产补货节奏由 3 天缩短至 2 天，并观察缺货率与损耗率变化。',
    rows: [
      { action: '确认满减券 ROI', owner: '营销负责人', priority: '高', expected_impact: '决定是否纳入 Q4 预算' },
      { action: '水产补货节奏调整', owner: '水产采购负责人', priority: '高', expected_impact: '降低缺货损失' },
      { action: '补齐开学季锁价', owner: '米类采购负责人', priority: '中', expected_impact: '对冲 15% 价格波动敞口' },
    ], confidence: 'high', evidence: ['W35 下周展望与决策', '行动闭环状态'], engine: 'rules', path: 'rule', sql: 'SELECT action, owner, priority, expected_impact FROM recommendations WHERE week_label = \'2026-W35\' ORDER BY status, confidence;', follow_ups: ['当前有哪些待审批建议', '行动完成率是多少'],
    understanding: { executor: 'compiler', plan: { operation: 'recommendation' }, args: {}, slots: [], editable: false },
    intent: 'COMPARISON',
    terms: { categories: [], merchants: ["沙县小吃","兰州拉面"], metrics: ["客单价"] },
  },
  {
    question_type: 'scenario', answer: '如果总体 GMV 下降 5%，按 1,880 万元/日计算将减少 94 万元/日，情景 GMV 为 1,786 万元/日；若毛利率不变，毛利润额约减少 18.5 万元/日。',
    rows: [{ metric_name: 'GMV', base_value: 1880, change_pct: -5, scenario_value: 1786, delta: -94 }, { metric_name: '毛利润额', base_value: 370.4, change_pct: -5, scenario_value: 351.9, delta: -18.5 }], confidence: 'medium', evidence: ['2026-W35 总体 GMV 与毛利率'], engine: 'rules', path: 'explain', sql: 'SELECT metric_name, metric_value FROM facts WHERE week_label = \'2026-W35\' AND category = \'总体\' AND metric_name IN (\'GMV\', \'毛利率\', \'毛利润额\');', follow_ups: ['如果下降 10% 呢', '需要多少订单才能恢复'],
    calculation: { formula: '1880 × (1 - 5%) = 1786；370.4 × (1 - 5%) = 351.9', result: { gmv_delta: -94, gross_delta: -18.5 }, explanation: '假设毛利率与其他条件不变。', caveats: ['未考虑补贴、损耗与供应约束变化。'] },
    render_spec: { columns: [{ key: 'metric_name', role: 'subject', label: '指标' }, { key: 'base_value', role: 'measure', label: '基准值', unit: '万元', unit_kind: 'money_wan' }, { key: 'change_pct', role: 'measure', label: '变化率', unit: '%', unit_kind: 'percent' }, { key: 'scenario_value', role: 'derived', label: '情景值', unit: '万元', unit_kind: 'money_wan' }] },
    understanding: { executor: 'operations', tool: 'scenario', plan: { operation: 'scenario' }, args: { metric: 'GMV', change_pct: -5 }, slots: [{ key: 'change_pct', label: '变化率', kind: 'percent', values: ['-5'], options: ['-10', '-5', '5', '10'] }], editable: true },
    intent: 'RECOMMENDATION',
    terms: { categories: [], merchants: [], metrics: [] },
  },
  {
    question_type: 'quality', answer: '数据资产覆盖 16 周、1,024 条事实、86 个事件、52 条决策、48 条建议和 31 个行动；当前有 6 条待核事实。',
    rows: [{ facts: 1024, weeks: 16, events: 86, decisions: 52, recommendations: 48, actions: 31, pending_candidates: 6 }], confidence: 'high', evidence: ['数据资产统计看板'], engine: 'rules', path: 'rule', sql: 'SELECT * FROM data_asset_stats;', follow_ups: ['有哪些数据质量问题', '待审批建议有多少'],
    understanding: { executor: 'compiler', plan: { operation: 'asset_stats' }, args: {}, slots: [], editable: false },
    intent: 'RECOMMENDATION',
    terms: { categories: [], merchants: [], metrics: [] },
  },
  {
    question_type: 'definition', answer: '损耗率口径为统计周期内损耗金额 ÷ 对应 GMV；夜配切换后，W33 起序列标记为 def-loss-night-v2，与此前 def-standard-v1 分段比较。',
    rows: [{ metric_name: '损耗率', definition: '损耗金额 ÷ GMV', current_definition: 'def-loss-night-v2', previous_definition: 'def-standard-v1', effective_from: '2026-W33' }], confidence: 'high', evidence: ['本体 schema v1.1', '口径变更记录'], engine: 'rules', path: 'rule', sql: 'SELECT metric_name, definition, definition_id FROM metric_definitions WHERE metric_name = \'损耗率\';', follow_ups: ['损耗率序列是否可比', '哪些指标有口径变更'],
    understanding: { executor: 'compiler', plan: { operation: 'definition' }, args: { metric: '损耗率' }, slots: [], editable: false },
    intent: 'WHAT_IF',
    terms: { categories: ["蔬菜"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '2026-W35 蔬菜复购率为 72.1%，肉类 67.1%，水产 67.7%，米类 81.7%；米类最高。',
    rows: resultRows('复购率'), confidence: 'high', evidence: ['《2026-W35 销售周报》品类维度拆解'], engine: 'rules', path: 'sql', sql: 'SELECT category, metric_value FROM facts WHERE week_label = \'2026-W35\' AND metric_name = \'复购率\' ORDER BY metric_value DESC;', follow_ups: ['复购率最低的是哪个品类', '总体复购率是多少'],
    render_spec: renderSpec(resultRows('复购率')),
    understanding: { executor: 'compiler', plan: { operation: 'rank' }, args: { metric: '复购率' }, slots: [], editable: true },
    intent: 'WHAT_IF',
    terms: { categories: ["蔬菜"], merchants: [], metrics: ["GMV"] },
  },

  // ── 模型写 SQL 的三个样本（path=mock_llm，徽章会标「模拟 LLM 写 SQL」）──
  // 这三题规则引擎答不了，真实系统会走「模型出查询意图 → 编译器落地 SQL」；
  // 演示站没有模型，就把那一轮的结果原样内嵌：SQL 是模型真会写出的形态，
  // 结果行按同一份 mock 数据算好，token 用量是模拟值，仅用于演示成本口径。
  {
    question_type: 'trend', answer: '总体净利率最近 8 周每周的环比变化：W28 4.1%（-0.1pp）、W29 4.3%（+0.2pp）、W30 4.5%（+0.2pp）、W31 4.4%（-0.1pp）、W32 4.5%（+0.1pp）、W33 4.5%（持平）、W34 4.6%（+0.1pp）、W35 4.7%（+0.1pp）。累计上行 0.6pp，增量主要落在 W29–W30 两段连续抬升上。',
    rows: [
      { week_label: '2026-W28', metric_value: 4.1, delta_pp: -0.1 },
      { week_label: '2026-W29', metric_value: 4.3, delta_pp: 0.2 },
      { week_label: '2026-W30', metric_value: 4.5, delta_pp: 0.2 },
      { week_label: '2026-W31', metric_value: 4.4, delta_pp: -0.1 },
      { week_label: '2026-W32', metric_value: 4.5, delta_pp: 0.1 },
      { week_label: '2026-W33', metric_value: 4.5, delta_pp: 0.0 },
      { week_label: '2026-W34', metric_value: 4.6, delta_pp: 0.1 },
      { week_label: '2026-W35', metric_value: 4.7, delta_pp: 0.1 },
    ], confidence: 'high', engine: 'llm', path: 'sql', evidence: ['事实表 2026-W27 至 2026-W35', '《2026-W35 销售周报》核心指标看板'],
    sql: 'WITH weekly AS (\n  SELECT week_label, metric_value,\n         LAG(metric_value) OVER (ORDER BY week_label) AS prev_value\n  FROM facts\n  WHERE category = \'总体\' AND metric_name = \'净利率\'\n)\nSELECT week_label, metric_value, ROUND(metric_value - prev_value, 1) AS delta_pp\nFROM weekly\nWHERE week_label >= \'2026-W28\'\nORDER BY week_label;',
    follow_ups: ['哪一周净利率抬升最快', '净利率上行靠毛利率还是费用率', '总体净利率最近 5 周趋势'],
    token_usage: { prompt_tokens: 1180, completion_tokens: 142, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'week_label', role: 'subject', label: '周次' },
      { key: 'metric_value', role: 'measure', label: '净利率', unit: '%', unit_kind: 'percent' },
      { key: 'delta_pp', role: 'derived', label: '环比变化', unit: 'pp', unit_kind: 'other' },
    ] },
    understanding: { executor: 'compiler', plan: { operation: 'trend' }, args: { metric: '净利率', category: '总体', last_n_weeks: 8, window: 'lag' }, slots: [], editable: false },
    intent: 'TREND',
    terms: { categories: ["总体"], merchants: [], metrics: ["GMV"] },
  },
  {
    question_type: 'metric', answer: '同时有损耗率记录、且 W35 损耗率低于 2.5% 的品类里，毛利率最高的三个是：蔬菜 23.2%（损耗率 2.2%）、蛋类 18.6%（1.1%）、肉类 18.5%（1.4%）。水产损耗率 2.7%，被这条筛掉。',
    rows: [
      { category: '蔬菜', metric_name: '毛利率', metric_value: 23.2, loss_rate: 2.2 },
      { category: '蛋类', metric_name: '毛利率', metric_value: 18.6, loss_rate: 1.1 },
      { category: '肉类', metric_name: '毛利率', metric_value: 18.5, loss_rate: 1.4 },
    ], confidence: 'high', engine: 'llm', path: 'sql', evidence: ['《2026-W35 销售周报》品类维度拆解', '事实表 2026-W35 损耗率'],
    sql: 'SELECT f.category, f.metric_name, f.metric_value, l.metric_value AS loss_rate\nFROM facts f\nJOIN facts l\n  ON l.week_label = f.week_label\n AND l.category = f.category\n AND l.metric_name = \'损耗率\'\nWHERE f.week_label = \'2026-W35\'\n  AND f.metric_name = \'毛利率\'\n  AND l.metric_value < 2.5\nORDER BY f.metric_value DESC\nLIMIT 3;',
    follow_ups: ['损耗率最高的品类是哪个', '毛利率最高的三个品类', '蔬菜毛利率最近 5 周趋势'],
    token_usage: { prompt_tokens: 1325, completion_tokens: 168, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'category', role: 'subject', label: '品类' },
      { key: 'metric_name', role: 'subject', label: '指标' },
      { key: 'metric_value', role: 'measure', label: '毛利率', unit: '%', unit_kind: 'percent' },
      { key: 'loss_rate', role: 'measure', label: '损耗率', unit: '%', unit_kind: 'percent' },
    ] },
    understanding: { executor: 'compiler', plan: { operation: 'rank' }, args: { metrics: ['毛利率', '损耗率'], filter: '损耗率 < 2.5', limit: 3 }, slots: [], editable: false },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ["毛利率","损耗率"] },
  },
  {
    question_type: 'compare', answer: 'W35 同时满足「GMV 份额超过 8%」和「毛利率低于 20%」的品类有四个：水产 8.1%（毛利率 18.8%）、肉类 22.2%（18.5%）、米类 10.0%（15.8%）、油类 9.0%（14.6%）。油类份额最小但毛利率垫底，是四个里最该动的。',
    rows: [
      { category: '水产', gmv: 153, gmv_share: 8.1, gross_margin: 18.8 },
      { category: '肉类', gmv: 417, gmv_share: 22.2, gross_margin: 18.5 },
      { category: '米类', gmv: 188, gmv_share: 10.0, gross_margin: 15.8 },
      { category: '油类', gmv: 169, gmv_share: 9.0, gross_margin: 14.6 },
    ], confidence: 'high', engine: 'llm', path: 'sql', evidence: ['《2026-W35 销售周报》品类 GMV 贡献表', '《2026-W35 销售周报》品类维度拆解'],
    sql: 'SELECT g.category, g.metric_value AS gmv,\n       ROUND(g.metric_value * 100.0 / t.total, 1) AS gmv_share,\n       m.metric_value AS gross_margin\nFROM facts g\nJOIN facts m\n  ON m.week_label = g.week_label\n AND m.category = g.category\n AND m.metric_name = \'毛利率\'\nCROSS JOIN (\n  SELECT SUM(metric_value) AS total FROM facts\n  WHERE week_label = \'2026-W35\' AND metric_name = \'GMV\' AND category = \'总体\'\n) t\nWHERE g.week_label = \'2026-W35\'\n  AND g.metric_name = \'GMV\'\n  AND g.category <> \'总体\'\n  AND g.metric_value * 1.0 / t.total >= 0.08\n  AND m.metric_value < 20\nORDER BY m.metric_value DESC;',
    follow_ups: ['各品类GMV排名和占比', '毛利率最低的是哪个品类', '油类毛利率最近 5 周趋势'],
    token_usage: { prompt_tokens: 1468, completion_tokens: 205, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'category', role: 'subject', label: '品类' },
      { key: 'gmv', role: 'measure', label: 'GMV', unit: '万元', unit_kind: 'money_wan' },
      { key: 'gmv_share', role: 'derived', label: 'GMV 份额', unit: '%', unit_kind: 'percent' },
      { key: 'gross_margin', role: 'measure', label: '毛利率', unit: '%', unit_kind: 'percent' },
    ] },
    understanding: { executor: 'compiler', plan: { operation: 'compare' }, args: { metrics: ['GMV', '毛利率'], filter: '份额 >= 8% AND 毛利率 < 20%' }, slots: [], editable: false },
    intent: 'COMPARISON',
    terms: { categories: [], merchants: [], metrics: ["GMV","毛利率"] },
  },
  {
    // ① 三槽位：品类 × 指标 × 周数
    question_type: 'trend', answer: '蔬菜品类毛利率在最近 8 周呈震荡下行后修复：W28-W31 在 20.2% 至 20.5% 之间小幅回落，W32 跌到 19.1%（夜配全仓切换，履约成本抬升），W33-W35 随夜配效应释放逐步回升，W35 回到 20.1%，基本回到切换前水平。',
    rows: [
      { week_label: '2026-W28', category: '蔬菜', metric_name: '毛利率', metric_value: 20.5, metric_unit: '%' },
      { week_label: '2026-W29', category: '蔬菜', metric_name: '毛利率', metric_value: 20.2, metric_unit: '%' },
      { week_label: '2026-W30', category: '蔬菜', metric_name: '毛利率', metric_value: 20.4, metric_unit: '%' },
      { week_label: '2026-W31', category: '蔬菜', metric_name: '毛利率', metric_value: 20.3, metric_unit: '%' },
      { week_label: '2026-W32', category: '蔬菜', metric_name: '毛利率', metric_value: 19.1, metric_unit: '%' },
      { week_label: '2026-W33', category: '蔬菜', metric_name: '毛利率', metric_value: 19.5, metric_unit: '%' },
      { week_label: '2026-W34', category: '蔬菜', metric_name: '毛利率', metric_value: 19.8, metric_unit: '%' },
      { week_label: '2026-W35', category: '蔬菜', metric_name: '毛利率', metric_value: 20.1, metric_unit: '%' },
    ], confidence: 'high', engine: 'llm', path: 'explain', evidence: ['事实表 2026-W28 至 2026-W35', '《2026-W32 销售周报》夜配全仓切换', '《2026-W35 销售周报》蔬菜损耗率'],
    sql: 'SELECT week_label, category, metric_name, metric_value, metric_unit\nFROM facts\nWHERE category = ? AND metric_name = ?\n  AND week_label >= date_trunc(\'week\', CURRENT_DATE - ?::week)\nORDER BY week_label;',
    follow_ups: ['毛利率为什么降过一次', '蔬菜 GMV 同周期趋势', '损耗率走势一致吗'],
    token_usage: { prompt_tokens: 1102, completion_tokens: 178, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'week_label', role: 'subject', label: '周次' },
      { key: 'metric_value', role: 'measure', label: '毛利率', unit: '%', unit_kind: 'percent' },
    ] },
    understanding: { executor: 'compiler', plan: { operation: 'trend' }, args: { category: '蔬菜', metric: '毛利率', last_n_weeks: 8 },
      slots: [
        { key: 'category', label: '品类', kind: 'category', values: ['蔬菜'], options: ['蔬菜', '肉类', '水产', '调料类', '米类', '油类', '蛋类', '总体'] },
        { key: 'metric', label: '指标', kind: 'metric', values: ['毛利率'], options: ['GMV', '毛利率', '净利率', '客单价', '损耗率', '复购率', '品类宽度'] },
        { key: 'weeks', label: '周数', kind: 'integer', values: ['8'], options: ['3', '5', '8', '16'] },
      ], editable: true },
    intent: 'TREND',
    terms: { categories: ['蔬菜'], merchants: [], metrics: ['毛利率'] },
  },
  {
    // ② 双槽位：情景推演 × 商户类型
    question_type: 'scenario', answer: '如果沙县小吃客单价上涨 15%，W35 沙县小吃 GMV 会从 287 万元升到约 330 万元（假设订单量不变），对总体 GMV 的拉动约 +0.2%。但要注意：同类商户复购率对涨价敏感，历史上同类上涨 10% 曾伴随订单量 -4%，建议把订单量弹性作为副变量再算一次。',
    rows: [
      { merchant_type: '沙县小吃', metric_name: 'GMV', base_value: 287, change_pct: 15, scenario_value: 330, metric_unit: '万元' },
      { merchant_type: '沙县小吃', metric_name: '客单价', base_value: 920, change_pct: 15, scenario_value: 1058, metric_unit: '元' },
    ], confidence: 'medium', engine: 'llm', path: 'explain', evidence: ['2026-W35 沙县小吃 GMV', '2026-W35 沙县小吃客单价', '2026-W32 同类涨价历史回归'],
    sql: 'SELECT metric_value FROM facts\nWHERE week_label = \'2026-W35\'\n  AND merchant_type = \'沙县小吃\'\n  AND metric_name IN (\'GMV\', \'客单价\');',
    follow_ups: ['如果同时涨 10% 呢', '兰州拉面涨价影响多大', '对总体净利率有什么传导'],
    token_usage: { prompt_tokens: 1340, completion_tokens: 215, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'metric_name', role: 'subject', label: '指标' },
      { key: 'base_value', role: 'measure', label: '当前值' },
      { key: 'change_pct', role: 'derived', label: '变化率', unit: '%', unit_kind: 'percent' },
      { key: 'scenario_value', role: 'measure', label: '情景值' },
    ] },
    understanding: { executor: 'operations', tool: 'scenario', plan: { operation: 'scenario' }, args: { merchant_type: '沙县小吃', metric: '客单价', change_pct: 15 },
      slots: [
        { key: 'merchant', label: '商户类型', kind: 'merchant', values: ['沙县小吃'], options: ['沙县小吃', '兰州拉面', '麻辣烫', '黄焖鸡', '烧烤', '总体'] },
        { key: 'change_pct', label: '变化率', kind: 'percent', values: ['15'], options: ['5', '10', '15', '20', '-5', '-10'] },
      ], editable: true },
    intent: 'WHAT_IF',
    terms: { categories: [], merchants: ['沙县小吃'], metrics: ['客单价'] },
  },
  {
    // ③ 双槽位：指标 A vs 指标 B 对比
    question_type: 'compare', answer: '净利率 10.4% 显著低于毛利率 19.6%（差 9.2pp），主要压缩项是商品成本率（48.8%）和销售费用率（11.2%）。净利率最近 5 周从 9.8% 缓慢回升到 10.4%，毛利率同期稳定在 19.3%–19.7% 区间——利润率改善主要靠费用端压降，而非毛利提升。',
    rows: [
      { week_label: '2026-W31', metric_a: '19.3%', metric_b: '9.8%', gap: 9.5 },
      { week_label: '2026-W32', metric_a: '19.1%', metric_b: '9.5%', gap: 9.6 },
      { week_label: '2026-W33', metric_a: '19.6%', metric_b: '10.0%', gap: 9.6 },
      { week_label: '2026-W34', metric_a: '19.7%', metric_b: '10.2%', gap: 9.5 },
      { week_label: '2026-W35', metric_a: '19.6%', metric_b: '10.4%', gap: 9.2 },
    ], confidence: 'high', engine: 'llm', path: 'explain', evidence: ['事实表 2026-W31 至 2026-W35 核心指标', '《2026-W35 销售周报》损益结构'],
    sql: 'SELECT week_label,\n       (SELECT metric_value FROM facts f2 WHERE f2.week_label = f.week_label AND f2.metric_name = ? AND f2.category = ?) AS metric_a,\n       (SELECT metric_value FROM facts f3 WHERE f3.week_label = f.week_label AND f3.metric_name = ? AND f3.category = ?) AS metric_b\nFROM facts f\nWHERE f.week_label >= ? AND f.category = ?\nGROUP BY week_label\nORDER BY week_label;',
    follow_ups: ['差距主要来自哪些成本', '净利率为什么回升了', '毛利率全年最高是哪周'],
    token_usage: { prompt_tokens: 1088, completion_tokens: 166, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'week_label', role: 'subject', label: '周次' },
      { key: 'metric_a', role: 'measure', label: '毛利率', unit: '%', unit_kind: 'percent' },
      { key: 'metric_b', role: 'measure', label: '净利率', unit: '%', unit_kind: 'percent' },
      { key: 'gap', role: 'derived', label: '差距', unit: 'pp', unit_kind: 'percent' },
    ] },
    understanding: { executor: 'operations', tool: 'ratio', plan: { operation: 'compare' }, args: { metric_a: '毛利率', metric_b: '净利率', category: '总体' },
      slots: [
        { key: 'metric_a', label: '指标 A', kind: 'metric', values: ['毛利率'], options: ['毛利率', '净利率', '客单价', '复购率', '损耗率'] },
        { key: 'metric_b', label: '指标 B', kind: 'metric', values: ['净利率'], options: ['毛利率', '净利率', '客单价', '复购率', '损耗率'] },
      ], editable: true },
    intent: 'COMPARISON',
    terms: { categories: ['总体'], merchants: [], metrics: ['毛利率', '净利率'] },
  },
  {
    // ④ 单槽位带阈值过滤：XX 指标超过 YY 值的品类
    question_type: 'rank', answer: 'W35 复购率高于 68% 的品类有四个：蔬菜 69.4%、调料类 69.1%、米类 68.7%、油类 68.2%。整体格局是"高频刚需品类复购高、品类差异小"，最高的蔬菜和最低的水产（65.8%）之间差距仅 3.6pp。',
    rows: [
      { category: '蔬菜', metric_name: '复购率', metric_value: 69.4, metric_unit: '%' },
      { category: '调料类', metric_name: '复购率', metric_value: 69.1, metric_unit: '%' },
      { category: '米类', metric_name: '复购率', metric_value: 68.7, metric_unit: '%' },
      { category: '油类', metric_name: '复购率', metric_value: 68.2, metric_unit: '%' },
    ], confidence: 'high', engine: 'rules', path: 'sql', evidence: ['《2026-W35 销售周报》品类维度拆解'],
    sql: 'SELECT category, metric_name, metric_value, metric_unit\nFROM facts\nWHERE week_label = \'2026-W35\' AND metric_name = ? AND category <> \'总体\'\n  AND metric_value >= ?\nORDER BY metric_value DESC;',
    follow_ups: ['复购率最低的品类是哪几个', '超过 69% 有哪些', '复购率和 GMV 的关系'],
    understanding: { executor: 'compiler', plan: { operation: 'rank' }, args: { metric: '复购率', threshold: 68, week: '2026-W35' },
      slots: [
        { key: 'metric', label: '指标', kind: 'metric', values: ['复购率'], options: ['GMV', '毛利率', '净利率', '客单价', '损耗率', '复购率', '品类宽度'] },
      ], editable: true },
    intent: 'METRIC_DISTRIBUTION',
    terms: { categories: [], merchants: [], metrics: ['复购率'] },
  },
  {
    // ⑤ 五槽位情景推演：商户类型 × 指标 × 变化方向 × 变化率 × 观察指标
    question_type: 'scenario', answer: '假设麻辣烫的客单价从当前 876 元下调（-10%）到 788 元，我们在"订单量保持不变"和"订单量弹性系数 = 0.6"两种假设下估算影响：GMV 大约从 320 万降到 288 万（订单量不变）或 307 万（弹性 0.6）；毛利率从 18.5% 同步下滑到 17.8%～17.9%，因为降价直接吞噬毛利。要维持净利率稳定，需要通过供应链端把商品成本率再压 0.8pp。',
    rows: [
      { scenario: '订单量不变', gmv_current: 320.0, gmv_scenario: 288.0, gmv_delta_pct: -10.0, gross_margin_current: 18.5, gross_margin_scenario: 17.8, margin_delta_pp: -0.7 },
      { scenario: '订单弹性 0.6', gmv_current: 320.0, gmv_scenario: 307.2, gmv_delta_pct: -4.0, gross_margin_current: 18.5, gross_margin_scenario: 17.9, margin_delta_pp: -0.6 },
    ], confidence: 'medium', engine: 'llm', path: 'explain', evidence: ['2026-W35 麻辣烫 GMV 与客单价', '麻辣烫订单弹性历史回归（R²=0.64）', '损益结构商品成本率敏感度测试'],
    sql: 'WITH base AS (\n  SELECT metric_name, metric_value\n  FROM facts\n  WHERE week_label = \'2026-W35\'\n    AND merchant_type = ?\n    AND metric_name IN (\'GMV\', \'客单价\', \'毛利率\')\n)\nSELECT\n  \'订单量不变\' AS scenario,\n  gmv AS gmv_current,\n  gmv * (1 + ?::numeric / 100) AS gmv_scenario,\n  ROUND(?::numeric, 1) AS gmv_delta_pct,\n  gross_margin AS gross_margin_current,\n  gross_margin * (1 + ?::numeric / 100) AS gross_margin_scenario\nFROM (SELECT\n  MAX(metric_value) FILTER (WHERE metric_name = \'GMV\') AS gmv,\n  MAX(metric_value) FILTER (WHERE metric_name = \'毛利率\') AS gross_margin\nFROM base) b;',
    follow_ups: ['如果涨价 10% 呢', '烧烤的弹性是多少', '需要降多少成本才能保本'],
    token_usage: { prompt_tokens: 1540, completion_tokens: 286, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'scenario', role: 'subject', label: '情景假设' },
      { key: 'gmv_current', role: 'measure', label: 'GMV 当前', unit: '万元', unit_kind: 'money_wan' },
      { key: 'gmv_scenario', role: 'measure', label: 'GMV 情景', unit: '万元', unit_kind: 'money_wan' },
      { key: 'gmv_delta_pct', role: 'derived', label: '变化', unit: '%', unit_kind: 'percent' },
      { key: 'gross_margin_current', role: 'measure', label: '毛利率当前', unit: '%', unit_kind: 'percent' },
      { key: 'gross_margin_scenario', role: 'measure', label: '毛利率情景', unit: '%', unit_kind: 'percent' },
      { key: 'margin_delta_pp', role: 'derived', label: '影响', unit: 'pp', unit_kind: 'percent' },
    ] },
    understanding: { executor: 'operations', tool: 'scenario', plan: { operation: 'scenario_multi' }, args: { merchant_type: '麻辣烫', metric: '客单价', direction: 'down', change_pct: 10, observe: '毛利率' },
      slots: [
        { key: 'merchant', label: '商户类型', kind: 'merchant', values: ['麻辣烫'], options: ['麻辣烫', '沙县小吃', '兰州拉面', '黄焖鸡', '烧烤', '总体'] },
        { key: 'metric', label: '操作指标', kind: 'metric', values: ['客单价'], options: ['GMV', '毛利率', '净利率', '客单价', '损耗率', '复购率'] },
        { key: 'direction', label: '变化方向', kind: 'enum', values: ['下调'], options: ['上调', '下调'] },
        { key: 'change_pct', label: '变化幅度', kind: 'percent', values: ['10'], options: ['5', '10', '15', '20', '25'] },
        { key: 'observe', label: '观察指标', kind: 'metric', values: ['毛利率'], options: ['GMV', '毛利率', '净利率', '客单价', '损耗率', '复购率'] },
      ], editable: true },
    intent: 'WHAT_IF',
    terms: { categories: [], merchants: ['麻辣烫'], metrics: ['客单价', '毛利率'] },
  },
  {
    // ⑥ 四槽位多维度对比：品类 A × 品类 B × 指标 × 周数
    question_type: 'compare', answer: '对比 W35 蔬菜和水产在四个指标上的表现：蔬菜 GMV 316 万 / 水产 153 万（差距 163 万）、客单价 869 vs 768（蔬菜高 101）、复购率 69.4% vs 65.8%（蔬菜高 3.6pp）、损耗率 2.2% vs 2.7%（水产高 0.5pp）。蔬菜是规模更大、粘性更高、损耗更好的品类；水产虽然客单价不低，但规模和粘性都弱一截，损耗还偏高。',
    rows: [
      { metric_name: 'GMV', category_a: '316 万元', category_b: '153 万元', delta: '+163 万元', winner: '蔬菜' },
      { metric_name: '客单价', category_a: '869 元', category_b: '768 元', delta: '+101 元', winner: '蔬菜' },
      { metric_name: '复购率', category_a: '69.4%', category_b: '65.8%', delta: '+3.6pp', winner: '蔬菜' },
      { metric_name: '损耗率', category_a: '2.2%', category_b: '2.7%', delta: '-0.5pp', winner: '蔬菜（损耗更低）' },
    ], confidence: 'high', engine: 'llm', path: 'sql', evidence: ['《2026-W35 销售周报》品类维度拆解', '事实表 2026-W35 蔬菜 / 水产指标'],
    sql: 'SELECT f_a.metric_name,\n       f_a.metric_value || \' \' || f_a.metric_unit AS category_a,\n       f_b.metric_value || \' \' || f_b.metric_unit AS category_b,\n       f_a.metric_value - f_b.metric_value || \' \' || f_a.metric_unit AS delta\nFROM facts f_a\nJOIN facts f_b ON f_a.metric_name = f_b.metric_name AND f_a.week_label = f_b.week_label\nWHERE f_a.week_label = ?\n  AND f_a.category = ?\n  AND f_b.category = ?\n  AND f_a.metric_name IN (?, ?, ?, ?)\nORDER BY f_a.metric_value DESC;',
    follow_ups: ['蔬菜 GMV 趋势是怎样的', '水产损耗率能降吗', '调料类和米类比呢'],
    token_usage: { prompt_tokens: 1288, completion_tokens: 192, calls: 1, models: ['THUDM/GLM-4-9B-0414'] },
    render_spec: { columns: [
      { key: 'metric_name', role: 'subject', label: '指标' },
      { key: 'category_a', role: 'measure', label: '蔬菜' },
      { key: 'category_b', role: 'measure', label: '水产' },
      { key: 'delta', role: 'derived', label: '差值' },
      { key: 'winner', role: 'derived', label: '优势方' },
    ] },
    understanding: { executor: 'compiler', plan: { operation: 'compare_pair' }, args: { category_a: '蔬菜', category_b: '水产', metrics: ['GMV', '客单价', '复购率', '损耗率'], week: '2026-W35' },
      slots: [
        { key: 'category_a', label: '品类 A', kind: 'category', values: ['蔬菜'], options: ['蔬菜', '肉类', '水产', '调料类', '米类', '油类', '蛋类'] },
        { key: 'category_b', label: '品类 B', kind: 'category', values: ['水产'], options: ['蔬菜', '肉类', '水产', '调料类', '米类', '油类', '蛋类'] },
        { key: 'metric', label: '对比指标', kind: 'metric', values: ['GMV'], options: ['GMV', '毛利率', '净利率', '客单价', '损耗率', '复购率'] },
        { key: 'week', label: '周次', kind: 'week', values: ['2026-W35'], options: ['2026-W35', '2026-W34', '2026-W33', '2026-W32', '2026-W31', '2026-W30'] },
      ], editable: true },
    intent: 'COMPARISON',
    terms: { categories: ['蔬菜', '水产'], merchants: [], metrics: ['GMV', '客单价', '复购率', '损耗率'] },
  },
]

/** 「生成的 SQL」必须和结果表是同一组列，否则演示自相矛盾：
 *  用户看到 SELECT 两列、表里四列，第一反应是系统在编数。
 *  WHERE / ORDER BY 保留手写（那才是体现查询意图的部分），只重写 SELECT 列表。 */
const alignSqlToSpec = (answer: AskResponse) => {
  const cols = answer.render_spec?.columns
    .filter((column) => !NON_COLUMN_KEYS.has(column.key))
    .map((column) => column.key)
  if (!answer.sql || !cols?.length) return
  // 带 CTE 的语句跳过：正则只认「第一段 SELECT…FROM」，套在 WITH 上会改坏内层查询。
  // 这几条由作者手写并逐条校验，不需要自动对齐。
  if (/^\s*WITH\b/i.test(answer.sql)) return
  answer.sql = answer.sql.replace(/\bSELECT\b[\s\S]*?\bFROM\b/i, `SELECT ${cols.join(', ')}\nFROM`)
}

// 表头与 SQL 的一致性靠这一遍守住：
// - 手写 render_spec 只有「列与行严格对齐」时才保留（它带着更准确的中文列名和单位）
// - 多一列（行里没有）或漏一列（行里有）就按真实行重建
// - 含派生列的声明是刻意设计的（情景推演、损益结构），放行
MOCK_QUESTIONS.forEach((answer) => {
  const rowKeys = new Set<string>()
  answer.rows.forEach((row) => Object.keys(row).forEach((key) => rowKeys.add(key)))
  const specKeys = answer.render_spec?.columns.map((column) => column.key) ?? []
  const aligned = specKeys.length > 0
    && specKeys.every((key) => rowKeys.has(key))
    && [...rowKeys].every((key) => NON_COLUMN_KEYS.has(key) || specKeys.includes(key))
  const hasDerived = answer.render_spec?.columns.some((column) => column.role === 'derived') ?? false
  if (!aligned && !hasDerived) answer.render_spec = renderSpec(answer.rows)
  alignSqlToSpec(answer)
})

export const MOCK_ASK_RESPONSES = MOCK_QUESTIONS
