// 指标中文名与指标专属色。色值来自贝恩配色体系（lib/chart-theme.ts 的 BAIN），
// 同族指标颜色相邻，成本类统一用灰色系。
import { BAIN } from './chart-theme'

// 指标专属色：同一指标在任何图里必须是同一个色，否则跨图对照就成了猜谜。
// 取色顺序按「经营主线 → 利润 → 效率 → 流量」，色板来自贝恩。
// 不使用黑色：所有原 #333333 改为 #666666（中灰），#999999 改为 #AAAAAA（浅灰）
export const METRIC_COLORS: Record<string, string> = {
  GMV: BAIN.red,
  订单量: BAIN.charcoal,
  客单价: BAIN.deepRed,
  复购率: BAIN.silverGray,
  毛利率: BAIN.red,
  净利率: BAIN.charcoal,
  品类宽度: BAIN.deepRed,
  SKU宽度: BAIN.deepRed,
  商户数: BAIN.silverGray,
  损耗率: BAIN.charcoal,
  损耗成本率: BAIN.red,
  商品成本率: BAIN.charcoal,
  运输成本率: BAIN.deepRed,
  仓储成本率: BAIN.silverGray,
  销售费用率: BAIN.charcoal,
  管理费用率: BAIN.silverGray,
  转化率: BAIN.red,
  CAC: BAIN.charcoal,
  CTR: BAIN.deepRed,
  DAU: BAIN.red,
}

export const METRIC_LABELS: Record<string, string> = {
  GMV: '日均GMV',
  订单量: '日均订单',
  客单价: '客单价',
  复购率: '复购率',
  毛利率: '毛利率',
  净利率: '净利率',
  品类宽度: '品类宽度',
  SKU宽度: 'SKU宽度',
  商户数: '商户数',
  损耗率: '损耗率',
  损耗成本率: '损耗成本率',
  运输成本率: '运输成本率',
  仓储成本率: '仓储成本率',
  商品成本率: '商品成本率',
  销售费用率: '销售费用率',
  管理费用率: '管理费用率',
  转化率: '转化率',
  CAC: '获客成本',
  CTR: '点击率',
  DAU: '日活',
}

/** 率类（pp）与量类（relative）的环比后缀不同，后缀错了会被读成两种意思 */
const PP_METRICS = new Set([
  '复购率', '毛利率', '净利率', '损耗率', '损耗成本率', '运输成本率',
  '仓储成本率', '商品成本率', '销售费用率', '管理费用率', '转化率', 'CTR',
])

export function isPpMetric(name: string): boolean {
  return PP_METRICS.has(name)
}

export function metricColor(name: string): string {
  return METRIC_COLORS[name] ?? BAIN.red
}

export function metricLabel(name: string): string {
  return METRIC_LABELS[name] ?? name
}
