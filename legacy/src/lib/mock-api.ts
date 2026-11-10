// 静态演示版的数据层：不连后端，全部读打包进来的快照。
// 写操作一律返回 mock 结果，既不落库也不会被误当成真实审批。
import raw from './mock-data.json'
import type {
  ActionRow, AskResponse, DocumentDetail, DocumentRow, DocContext, EntityRow, Fact,
  Series, User,
} from '../../../frontend/src/types'

interface Snapshot {
  me: Record<string, unknown>
  entities: { entities: unknown[] }
  documents: { rows: unknown[]; week_range: { min: string | null; max: string | null } }
  documentsDetail: Record<string, unknown>
  documentsContext: Record<string, unknown>
  asks: Record<string, unknown>
  facts: Record<string, { rows: Array<Record<string, unknown>>; denied: boolean }>
  series: Record<string, unknown>
}

const DATA = raw as unknown as Snapshot

const LATENCY_MS = 240 // 演示时给一点延迟，让"加载中"状态看得见

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), LATENCY_MS))
}

const SKIPPED = [
  '导入周报（需要后端解析管道）',
  '事实裁决 / 建议审批 / 行动状态推进（写库操作）',
  '数据质量处理与口径定义变更确认',
]

export const mockStats = {
  mode: 'mock' as const,
  facts: Object.values(DATA.facts).reduce((n, v) => n + v.rows.length, 0),
  documents: DATA.documents.rows.length,
}

export const mockApi = {
  health: () => delay({ ok: true, version: '1.1', llm_enabled: false, llm_ask_enabled: false, stats: {} as never }),
  me: (): Promise<User> => delay(DATA.me as unknown as User),
  entities: () => delay(DATA.entities as { entities: EntityRow[] }),
  documents: () => delay(DATA.documents as { rows: DocumentRow[]; week_range: { min: string | null; max: string | null } }),
  document: (docId: string) => delay(DATA.documentsDetail[docId] as unknown as DocumentDetail),
  docContext: (docId: string) => delay(DATA.documentsContext[docId] as unknown as DocContext),
  facts: (params: { week?: string; category?: string; metric?: string; merchant?: string }) => {
    const key = params.category && params.metric
      ? `${params.category}|${params.metric}`
      : params.category ? params.category
        : params.merchant ? `商户|${params.merchant}`
          : params.metric ? `指标|${params.metric}` : '蔬菜|GMV'
    const hit = DATA.facts[key]
    if (hit) return delay({ rows: hit.rows as unknown as Fact[], denied: hit.denied })
    // 没有预生成组合时按条件现筛，保证任何点击都能出图
    const all = Object.values(DATA.facts).flatMap((v) => v.rows) as unknown as Fact[]
    const rows = all.filter((r) => (!params.metric || r.metric_name === params.metric)
      && (!params.category || r.category === params.category)
      && (!params.merchant || r.merchant_type === params.merchant))
    return delay({ rows, denied: false })
  },
  series: (metric: string, category: string) => {
    const hit = DATA.series[`${metric}|${category}`]
    return hit ? delay(hit as unknown as Series) : Promise.resolve(null as unknown as Series)
  },
  ask: (question: string): Promise<AskResponse> => {
    const hit = DATA.asks[question]
    if (hit) return delay(hit as unknown as AskResponse)
    return delay(offlineAnswer(question))
  },
  // ── 以下为演示态占位：真实写操作在静态站里没有后端 ──
  ingest: () => Promise.reject(new Error('静态演示站不支持导入周报')),
  adjudicate: () => delay({ ok: true }),
  approve: () => Promise.reject(new Error('静态演示站不支持审批写操作')),
  reject: () => delay({ ok: true }),
  actionStatus: () => delay({ ok: true, action: {} as ActionRow }),
  evaluate: () => Promise.reject(new Error('静态演示站不支持结果评估')),
  resolveIssue: () => delay({ ok: true, facts_tagged: 0 }),
  skipped: SKIPPED,
}

/** 未预置的问题：给一条明确的"演示边界"回答，而不是假装算出来了 */
function offlineAnswer(question: string): AskResponse {
  return {
    question_type: 'DEMO_BOUNDARY',
    answer: `静态演示站只预置了几个典型问法，你问的「${question}」没有对应快照。\n完整问数链路（意图分类 → 生成 SQL → 逐行回查事实表）需要后端，请在本地或部署环境运行 backend。`,
    rows: [],
    evidence: [],
    confidence: 'medium',
    engine: 'rules',
    intent: 'GENERAL',
    note: '静态演示：未预置该问题的答案',
    follow_ups: Object.keys(DATA.asks).slice(0, 3),
    response_time_ms: LATENCY_MS,
    token_usage: { prompt_tokens: 0, completion_tokens: 0, calls: 0, models: [] },
    fallback_used: true,
    fallback_reason: '静态站点无后端',
  } as unknown as AskResponse
}

/** 走流的写法保持不变，前端只要把 askStream 换成这个实现 */
export async function askStreamMock(
  question: string,
  handlers: { onMeta: (meta: AskResponse) => void; onChunk: (t: string) => void; onError: (m: string) => void },
  signal?: AbortSignal,
): Promise<void> {
  try {
    const result = await mockApi.ask(question)
    if (signal?.aborted) return
    handlers.onMeta(result)
    const text = result.answer || ''
    for (let i = 0; i < text.length; i += 24) {
      if (signal?.aborted) return
      await new Promise((r) => window.setTimeout(r, 18))
      handlers.onChunk(text.slice(i, i + 24))
    }
  } catch (e) {
    handlers.onError(e instanceof Error ? e.message : String(e))
  }
}

/** 槽位重跑：静态站里根据 slot 变化动态生成对应周数的趋势数据和回答 */
export async function askRerunMock(
  question: string,
  understanding: import('../../../frontend/src/types').Understanding,
  slots: Record<string, string>,
  handlers: { onMeta: (meta: AskResponse) => void; onChunk: (t: string) => void; onError: (m: string) => void },
  signal?: AbortSignal,
): Promise<void> {
  try {
    const base = await mockApi.ask(question)
    if (signal?.aborted) return

    let rerun: AskResponse = base

    // 趋势类问题的周数槽位变更
    if (slots.weeks && understanding.plan?.operation === 'trend') {
      const n = Math.min(parseInt(slots.weeks, 10) || 5, 16)
      const metric = String(understanding.args?.metric ?? 'GMV')
      // 从 facts 中取出对应周的数据
      const allFacts = Object.values(DATA.facts).flatMap((v) => v.rows) as unknown as Array<Record<string, unknown>>
      const metricFacts = allFacts
        .filter((r) => r.metric_name === metric && (r.category === '总体' || r.category === undefined))
        .sort((a, b) => String(a.week_label).localeCompare(String(b.week_label)))
        .slice(-n)

      if (metricFacts.length > 0) {
        const startWeek = String(metricFacts[0].week_label)
        const endWeek = String(metricFacts[metricFacts.length - 1].week_label)
        const startVal = Number(metricFacts[0].metric_value)
        const endVal = Number(metricFacts[metricFacts.length - 1].metric_value)
        const changePct = Number(((endVal - startVal) / startVal * 100).toFixed(1))
        const unit = String(metricFacts[0].metric_unit || '万元')

        rerun = {
          ...base,
          answer: `已按调整后的口径重跑（${n} 周）：${metric} 最近 ${n} 周从 ${startWeek.replace('2026-', '')} 的 ${startVal.toLocaleString()}${unit} 升至 ${endWeek.replace('2026-', '')} 的 ${endVal.toLocaleString()}${unit}，整体变化 ${changePct >= 0 ? '+' : ''}${changePct}%。`,
          rows: metricFacts,
          sql: `SELECT week_label, metric_value FROM facts\nWHERE category = '总体' AND metric_name = '${metric}' AND week_label >= '${startWeek}'\nORDER BY week_label;`,
          evidence: [`事实表 ${startWeek} 至 ${endWeek}`],
          understanding: {
            ...understanding,
            args: { ...understanding.args, last_n_weeks: n },
            slots: understanding.slots.map((slot) => slots[slot.key] ? { ...slot, values: [slots[slot.key]] } : slot),
          },
        } as unknown as AskResponse
      }
    } else {
      // 通用兜底
      rerun = {
        ...base,
        answer: `已按调整后的口径重跑：${base.answer}`,
        understanding: {
          ...understanding,
          slots: understanding.slots.map((slot) => slots[slot.key] ? { ...slot, values: [slots[slot.key]] } : slot),
        },
      } as unknown as AskResponse
    }

    handlers.onMeta(rerun)
    const text = rerun.answer || ''
    for (let i = 0; i < text.length; i += 24) {
      if (signal?.aborted) return
      await new Promise((r) => window.setTimeout(r, 18))
      handlers.onChunk(text.slice(i, i + 24))
    }
  } catch (e) {
    handlers.onError(e instanceof Error ? e.message : String(e))
  }
}
