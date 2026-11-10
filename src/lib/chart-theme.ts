// 贝恩（Bain & Company）配色体系
//
// 取值来源：Bain & Company 品牌色板公开规范。
// 贝恩的品牌标识以两组红色（主品牌色）和两组灰色（辅助色）为核心，
// 数据可视化中在此基础上补充了涨跌语义色与中性阶。
//
// 两组红色：
//   Bain Red    #CC0000  主品牌红，用于最重要的序列
//   Deep Red    #990000  深红，用于次要强调
//
// 两组灰色：
//   Charcoal    #666666  中灰，用于次要序列与文字
//   Silver Gray #AAAAAA  浅灰，用于背景序列与辅助线
//
// 注意：不使用纯黑(#000 / #1A1A1A)作为数据色——贝恩规范中黑色不属于数据色板。
// 组合图中柱状图用 Bain Red，折线图用 Silver Gray，两者明度差异大，一眼可辨。
//
// 用法约定：
// - 图形取色一律走 SERIES_PALETTE / SEQUENTIAL_RED / DIVERGING，不手写十六进制；
// - 同一指标在任何图里必须是同一个颜色（METRIC_COLORS）；
// - 位置顺序即优先级：第一个色比第二个色更重要，不靠颜色种类多取胜；
// - 涨跌用 positive / negative，不用红绿以外的语义色。

export const BAIN = {
  // 两组红色（主品牌色）
  red: '#CC0000',
  deepRed: '#990000',
  // 两组灰色（辅助色）——不用纯黑，中灰和浅灰
  charcoal: '#666666',
  silverGray: '#AAAAAA',
  // 与红色高对比的辅助色：深蓝（用于组合图的第二条线）
  navy: '#003F5C',
  teal: '#007BA7',
  // 兼容旧引用
  gray: '#888888',
  purple: '#CC0000',
  darkBlue: '#003F5C',
  midBlue: '#007BA7',
  skyBlue: '#007BA7',
  darkTeal: '#003F5C',
  magenta: '#CC0000',
  orange: '#E07B00',
  green: '#00875A',
  // 语义色
  positive: '#00875A',   // 上涨用深绿，与贝恩红形成强对比
  negative: '#CC0000',   // 下跌用品牌红
  warning: '#E07B00',
  info: '#666666',
  // 中性阶（文字、网格、轴、底）——文字用深灰不用纯黑
  ink: '#333333',
  inkSoft: 'rgba(51, 51, 51, 0.6)',
  inkFaint: 'rgba(51, 51, 51, 0.38)',
  grid: '#E5E5E5',
  axis: '#CCCCCC',
  bg: '#FFFFFF',
  bgAlt: '#F7F7F7',
} as const

/** 定性色板：多序列默认按这个顺序取色——红、深蓝、深红、蓝绿循环
 *  组合图中柱状图取 seriesColor(0)=红，折线图取 seriesColor(1)=深蓝，红蓝高对比 */
export const SERIES_PALETTE: string[] = [
  BAIN.red, BAIN.navy, BAIN.deepRed, BAIN.teal,
  BAIN.red, BAIN.navy, BAIN.deepRed, BAIN.teal,
  BAIN.red, BAIN.navy,
]

/** 单色顺序阶：表达"从少到多"，红色系 7 档 */
export const SEQUENTIAL_RED: string[] = [
  '#F5E5E5', '#E8C0C0', '#D99595', '#C26B6B', '#A64040', '#990000', '#6B0000',
]

/** 发散阶：涨/跌，中间用中性灰过渡——不用纯黑 */
export const DIVERGING: string[] = [
  '#CC0000', '#E05050', '#F5A0A0', '#FBC8C8', '#E5E5E5', '#CCCCCC', '#AAAAAA', '#888888', '#666666',
]

/** 多序列线型循环：不只靠颜色区分（黑白打印 / 色弱可用） */
export const SERIES_DASHES: Array<string | undefined> = [
  undefined, '6 3', '2 2', '6 2 2 2', '4 4', '1 3', '8 3 2 3', '3 4',
]

// 向后兼容：ACC / MCK 别名指向 BAIN
export const ACC = BAIN
export const MCK = BAIN

export function seriesColor(index: number): string {
  return SERIES_PALETTE[index % SERIES_PALETTE.length]
}

export function seriesDash(index: number): string | undefined {
  return SERIES_DASHES[index % SERIES_DASHES.length]
}

/** 顺序阶取色：t ∈ [0,1]，0 最浅 1 最深 */
export function sequentialColor(t: number, ramp: string[] = SEQUENTIAL_RED): string {
  const clamped = Math.min(Math.max(t, 0), 1)
  return ramp[Math.min(ramp.length - 1, Math.round(clamped * (ramp.length - 1)))]
}

/** 发散阶取色：0.5 为中性，>0.5 正向偏灰，<0.5 负向偏红 */
export function divergingColor(t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1)
  return DIVERGING[Math.min(DIVERGING.length - 1, Math.round(clamped * (DIVERGING.length - 1)))]
}

/** 涨跌色：正=绿、负=红 */
export function deltaColor(v: number | null | undefined): string {
  if (v == null || v === 0) return BAIN.inkSoft
  return v > 0 ? BAIN.positive : BAIN.negative
}

/** 图表画布尺寸与轴样式，所有图表类型共用 */
export const CHART_HEIGHT = 210
export const CHART_MARGIN = { top: 10, right: 12, bottom: 2, left: -6 }
export const AXIS_TICK = { fontSize: 10, fill: BAIN.inkFaint }
export const X_TICK = { fontSize: 10, fill: BAIN.inkFaint }
export const TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid rgba(0, 0, 0, 0.12)',
  borderRadius: 10,
  fontSize: 12,
  color: '#1A1A2E',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  padding: '8px 12px',
}

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '-'
  const abs = Math.abs(v)
  if (abs >= 10000) return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
  if (abs >= 100) return v.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
