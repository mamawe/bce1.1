export const AGGREGATION_LABEL: Record<string, string> = {
  daily_average: '日均',
  week_total: '周合计',
  sum: '周合计',
  avg: '均值',
  snapshot: '时点值',
  unknown: '未标注',
}

export const EXTRACTION_LABEL: Record<string, string> = {
  table: '表格直取',
  table_legacy: '表格直取',
  rule: '规则解析',
  narrative_rule: '正文规则',
  llm: '模型抽取',
}

export const ACTION_LABEL: Record<string, string> = {
  promotion: '做促销',
  operations: '调运营',
  assortment: '扩品宽',
  pricing: '调价',
  restock: '补货',
  cut_waste: '压损耗',
  review: '复盘',
}

export function actionLabel(type: string): string {
  return ACTION_LABEL[type] ?? type
}

const DIRECTION: Record<string, string> = { up: '↑', down: '↓', flat: '→' }

export function impactLabel(impact: Record<string, unknown>): string {
  const metric = impact.metric as string | undefined
  if (!metric) return ''
  const dir = DIRECTION[String(impact.direction ?? '')] ?? ''
  const low = impact.low
  const high = impact.high
  const unit = (impact.unit as string | undefined) ?? ''
  const range = low !== undefined && high !== undefined ? `${low}–${high}${unit}` : `${low ?? ''}${unit}`
  return `预期 ${metric} ${dir} ${range}`.trim()
}

// 事件摘要与原文引用来自 Markdown 正文，去掉强调标记后再展示
export function stripMd(text: string | null | undefined): string {
  return (text ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim()
}

export function aggLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return AGGREGATION_LABEL[value] ?? value
}

export function methodLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return EXTRACTION_LABEL[value] ?? value
}
