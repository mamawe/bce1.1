import { getMockUser } from './mock-user'
import {
  ACTIONS as MOCK_ACTIONS, CANDIDATES, DOC_CONTEXTS, DOCUMENTS,
  DOCUMENT_DETAIL, ENTITIES, FACTS, HEALTH, MOCK_ASK_RESPONSES, ONTOLOGY, OUTCOMES,
  QUALITY_ISSUES, USERS, WEEK_LABELS, dashboardForWeek, seriesFor,
  summaryGmv, summaryNetMargin, summaryGrossMargin, wow,
} from './mock-data'
import type {
  ActionRow, ActionStats, AskResponse, AuthConfig, Candidate, DashboardData, DefinitionChange,
  DocContext, DocumentDetail, DocumentRow, EntityRow, EventRow, Health, IngestReport,
  LoginResult, Ontology, Outcome, QualityIssue, Recommendation, ResolveIssue, Series, User,
} from './types'
import type { AskHandlers } from './types'
import type { TraceStep } from './lib/trace'

/** 离线演示 API：接口形状与 api.ts 对齐；写操作只在当前内存中生效。 */
const delay = (ms = 80) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const currentUser = getMockUser()
const mutable = {
  actions: clone(MOCK_ACTIONS),
  outcomes: clone(OUTCOMES),
  candidates: clone(CANDIDATES),
  issues: clone(QUALITY_ISSUES),
  contexts: clone(DOC_CONTEXTS),
  recommendations: clone(
    Object.fromEntries(Object.values(DOC_CONTEXTS).map((context) => [
      context.doc_id,
      context.recommendations.map((recommendation) => ({ ...recommendation })),
    ])),
  ) as Record<string, Recommendation[]>,
  documents: clone(DOCUMENTS),
  facts: clone(FACTS),
}

function scopedFacts(params: { week?: string; category?: string; metric?: string; merchant?: string } = {}) {
  const allowed = new Set(currentUser.categories)
  const rows = mutable.facts.filter((fact) => {
    const owner = fact.category === '总体' || fact.merchant_type ? fact.category : fact.category
    if (!allowed.has('总体') && !allowed.has(owner)) return false
    if (params.week && fact.week_label !== params.week) return false
    if (params.category && fact.category !== params.category) return false
    if (params.metric && fact.metric_name !== params.metric) return false
    if (params.merchant && fact.merchant_type !== params.merchant) return false
    return true
  }).sort((a, b) => b.week_label.localeCompare(a.week_label) || b.id - a.id)
  const denied = rows.length === 0 && (!!params.category || !!params.merchant) && !allowed.has(params.category ?? params.merchant ?? '')
  return { rows, denied }
}

function weekFromQuestion(question: string): string | null {
  const match = question.match(/2026[-年]?W?(\d{2})/i)
  if (match) {
    const week = `2026-W${match[1]}`
    if (DOCUMENTS.some((document) => document.week_label === week)) return week
  }
  return null
}

function chooseResponse(question: string): AskResponse {
  const normalized = question.toLowerCase().replace(/\s+/g, '')
  const scored = MOCK_ASK_RESPONSES.map((response, index) => {
    const text = `${response.question_type} ${response.answer} ${response.follow_ups?.join(' ') ?? ''}`.toLowerCase()
    let score = 0
    for (const token of ['gmv', '毛利率', '净利率', '客单价', '复购率', '损耗率', '排名', '趋势', '为什么', '对比', '多少倍', '如果', '建议', '质量', '口径', '净利润', '毛利', '份额', '环比变化', '损耗率低于', '最高的三个']) {
      if (normalized.includes(token) && text.includes(token)) score += 2
    }
    if (normalized.includes('趋势') && response.question_type === 'trend') score += 8
    if (normalized.includes('为什么') && response.question_type === 'attribution') score += 10
    if (normalized.includes('排名') && response.question_type === 'rank') score += 10
    if (normalized.includes('对比') && response.question_type === 'compare') score += 10
    if (normalized.includes('建议') && response.question_type === 'recommendation') score += 10
    if (normalized.includes('如果') && response.question_type === 'scenario') score += 12
    if (normalized.includes('质量') && response.question_type === 'quality') score += 10
    if (normalized.includes('口径') && response.question_type === 'definition') score += 10
    if (normalized.includes('gmp') && response.question_type === 'metric') score += 3
    return { score, index, response }
  })
  const week = weekFromQuestion(question)
  const best = scored.sort((a, b) => b.score - a.score || a.index - b.index)[0].response
  if (!week || week === '2026-W35') return { ...clone(best), response_time_ms: 240 + Math.floor(Math.random() * 120) }
  const title = DOCUMENTS.find((document) => document.week_label === week)?.title ?? week
  return {
    ...clone(best),
    answer: best.answer.replace(/2026-W35/g, week),
    evidence: [title],
    rows: best.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'week_label' && value === '2026-W35' ? week : value]))),
    response_time_ms: 240 + Math.floor(Math.random() * 120),
  }
}

function thinkingSteps(question: string, response: AskResponse): TraceStep[] {
  const q = question.slice(0, 28)
  const intent = response.intent ?? response.question_type
  const path = response.path ?? 'rule'
  const tool = response.understanding?.tool ?? response.understanding?.executor ?? 'fact.table'
  // 按真实后端链路命名路由阶段：router→classify_and_plan→route_via_kev→compiler→sql/explain→answer
  const routerStep: TraceStep = path === 'rule'
    ? { id: 'route', type: 'route', title: '规则路由 · 识别意图', detail: `问题「${q}」锚点命中，无歧义槽位，直接走规则路径。`, status: 'ok' as const, duration_ms: 8, tool: 'router.rules' }
    : { id: 'route', type: 'route', title: '意图路由 · Kev / Planner', detail: `问题「${q}」→ ${intent}；Kev 判 ${path === 'sql' ? '需要写 SQL' : path === 'explain' ? '解释计算结果' : '编译器计划'}。`, status: 'ok' as const, duration_ms: 78, tool: 'router.classify_and_plan' }
  const planStep: TraceStep = path === 'explain'
    ? { id: 'plan', type: 'plan', title: '编译执行计划 · 计算层', detail: `算子：${tool}，参数：${(response.understanding?.args ?? {})?.filters ?? '无'}。`, status: 'ok' as const, duration_ms: 22, tool: 'compiler.operations' }
    : { id: 'plan', type: 'plan', title: '编译执行计划 · 语义层', detail: `plan=${JSON.stringify(response.understanding?.plan ?? { operation: 'lookup' })}，按本体白名单展开。`, status: 'ok' as const, duration_ms: 18, tool: 'compiler.semantic' }
  const sqlStep: TraceStep = path === 'explain'
    ? { id: 'sql', type: 'tool_call', title: '取数 · 只读查询', detail: '已按身份过滤（总体口径或品类受限），只读连接。', status: 'ok' as const, duration_ms: 31, tool: 'db.exec_readonly' }
    : { id: 'sql', type: 'tool_call', title: path === 'sql' ? 'LLM 写 SQL · 执行' : '编译 SQL · 执行', detail: response.sql ? `SELECT ${response.rows?.[0] && Object.keys(response.rows[0]).slice(0, 4).join(', ')} … FROM facts` : '无 SQL，直接查算子结果表。', status: 'ok' as const, duration_ms: 44, tool: path === 'sql' ? 'llm.sql_generator' : 'compiler.sql' }
  const validateStep: TraceStep = { id: 'validate', type: 'compute', title: '回查事实表 · 逐行核对', detail: response.validation_report
    ? `已核 ${response.validation_report.matched_rows}/${response.validation_report.checked_rows} 行${response.validation_report.derived_columns?.length ? `，派生 ${response.validation_report.derived_columns.join('、')} 未回查` : ''}。`
    : '事实表无记录（离线样本），跳过逐行回查。', status: 'ok' as const, duration_ms: 26, tool: 'validate.fact_rows' }
  const answerStep: TraceStep = { id: 'answer', type: 'analyze', title: '组织回答 · 带证据', detail: `输出${path === 'explain' ? 'LLM 解释段落' : '结论 + 结果表 + 证据'}，附追问 ${response.follow_ups?.length ?? 0} 条。`, status: 'ok' as const, duration_ms: 19, tool: path === 'explain' ? 'llm.answer_draft' : 'answer.assembler' }
  return [routerStep, planStep, sqlStep, validateStep, answerStep]
}

async function streamResponse(
  response: AskResponse,
  handlers: AskHandlers,
  signal?: AbortSignal,
  isRerun = false,
): Promise<void> {
  if (signal?.aborted) return
  const steps = isRerun
    ? thinkingSteps('确定性重跑', response).slice(3)
    : thinkingSteps('离线问数', response)
  for (const step of steps) {
    handlers.onThinking?.({ ...step, status: 'running' })
    await delay(35)
    if (signal?.aborted) return
    handlers.onThinking?.({ ...step, status: 'ok' })
  }
  // path / engine / intent 全部透传：演示站只是不连后端，但答案字段和真实响应形状完全一致。
  handlers.onMeta({ ...response })
  const chunks = response.answer.match(/.{1,22}/gs) ?? [response.answer]
  for (const chunk of chunks) {
    await delay(18)
    if (signal?.aborted) return
    handlers.onChunk(chunk)
  }
  handlers.onMeta({ ...response })
}

export const api = {
  health: async (): Promise<Health> => { await delay(); return clone(HEALTH) },
  authConfig: async (): Promise<AuthConfig> => { await delay(); return { env: 'offline-demo', jwt_configured: false, lark_enabled: false, dev_login: true, ttl_seconds: 28800, warnings: [] } },
  authMe: async () => { await delay(); return { user: clone(currentUser), authenticated: true } },
  devLogin: async (id: string): Promise<LoginResult> => {
    await delay()
    const user = USERS[id] ?? USERS.admin
    return { token: 'offline-demo-token', token_type: 'Bearer', expires_in: 28800, user: clone(user) }
  },
  me: async (): Promise<User> => { await delay(); return clone(currentUser) },
  ontology: async (): Promise<Ontology> => { await delay(); return clone(ONTOLOGY) },
  entities: async (): Promise<{ entities: EntityRow[] }> => { await delay(); return { entities: clone(ENTITIES) } },
  documents: async (): Promise<{ rows: DocumentRow[]; week_range: { min: string | null; max: string | null } }> => {
    await delay()
    const rows = mutable.documents.filter((document) => currentUser.categories.includes('总体') || document.week_label)
    return { rows: clone(rows), week_range: { min: rows[rows.length - 1]?.week_label ?? null, max: rows[0]?.week_label ?? null } }
  },
  document: async (docId: string): Promise<DocumentDetail> => {
    await delay()
    const found = mutable.documents.find((document) => document.doc_id === docId)
    if (!found) throw new Error('周报不存在')
    return clone(DOCUMENT_DETAIL[docId] ?? DOCUMENT_DETAIL[mutable.documents[0].doc_id])
  },
  docContext: async (docId: string): Promise<DocContext> => {
    await delay()
    const context = mutable.contexts[docId] ?? mutable.contexts[mutable.documents[0].doc_id]
    const scoped = {
      ...context,
      facts: context.facts.filter((fact) => currentUser.categories.includes('总体') || currentUser.categories.includes(fact.category)),
      candidates: context.candidates.filter((candidate) => candidate.status === 'pending'),
    }
    return clone(scoped)
  },
  samples: async () => {
    await delay()
    return { samples: mutable.documents.map((document) => ({ id: document.doc_id, title: document.title, path: `samples/${document.doc_id}.md` })) }
  },
  ingest: async (payload: { title?: string; content?: string; sample?: string; source_url?: string }): Promise<IngestReport> => {
    await delay(160)
    const sampleId = payload.sample ?? mutable.documents[0].doc_id
    const source = DOCUMENT_DETAIL[sampleId]
    const week = source?.week_label ?? '2026-W35'
    const weekNumber = Number(week.slice(-2))
    return {
      run_id: `mock-run-${Date.now()}`, doc_id: sampleId, week_label: week,
      facts_extracted: 152, facts_accepted: 152, facts_rejected: 0,
      events_extracted: 3, decisions_extracted: 3, recommendations_generated: 3, review_count: 1,
      skipped_tables: [], warnings: ['离线演示模式：导入结果来自预置样本，不写入持久化数据库。'],
      identity: { iso_year: 2026, iso_week: weekNumber, week_label: week, period_start: source?.period_start ?? '', period_end: source?.period_end ?? '', source: 'mock', confidence: 0.99 },
      candidates: mutable.contexts[sampleId]?.candidates.map((candidate) => ({ candidate_id: candidate.candidate_id, reason: candidate.reason ?? '', confidence: candidate.confidence })) ?? [],
    }
  },
  facts: async (params: { week?: string; category?: string; metric?: string; merchant?: string } = {}) => {
    await delay()
    return scopedFacts(params)
  },
  candidates: async (): Promise<{ rows: Candidate[] }> => {
    await delay()
    return { rows: clone(mutable.candidates.filter((candidate) => candidate.status === 'pending')) }
  },
  adjudicate: async (id: string, action: 'accept' | 'reject') => {
    await delay()
    const candidate = mutable.candidates.find((item) => item.candidate_id === id)
    if (candidate) candidate.status = action === 'accept' ? 'accepted' : 'rejected'
    return { ok: true }
  },
  events: async (week?: string): Promise<{ rows: EventRow[] }> => {
    await delay()
    const rows = Object.values(mutable.contexts).flatMap((context) => context.events).filter((event) => !week || event.occurred_at.startsWith(week))
    return { rows: clone(rows) }
  },
  recommendations: async (status?: string): Promise<{ rows: Recommendation[] }> => {
    await delay()
    const rows = Object.values(mutable.recommendations).flat().filter((recommendation) => !status || recommendation.status === status)
    return { rows: clone(rows) }
  },
  approve: async (id: string) => {
    await delay()
    for (const recommendations of Object.values(mutable.recommendations)) {
      const recommendation = recommendations.find((item) => item.recommendation_id === id)
      if (recommendation) recommendation.status = 'approved'
    }
    const recommendation = Object.values(mutable.recommendations).flat().find((item) => item.recommendation_id === id)
    const action: ActionRow = { action_id: `act-${Date.now()}`, recommendation_id: id, decision_id: recommendation?.strategy_id ?? null, owner: recommendation?.owner_role ?? '负责人', status: 'planned', started_at: null, completed_at: null, notes: '离线演示已创建行动。', created_at: new Date().toISOString().slice(0, 10) }
    mutable.actions.push(action)
    return { recommendation: clone(recommendation!), action: clone(action) }
  },
  reject: async (id: string) => {
    await delay()
    for (const recommendations of Object.values(mutable.recommendations)) {
      const recommendation = recommendations.find((item) => item.recommendation_id === id)
      if (recommendation) recommendation.status = 'rejected'
    }
    return { ok: true }
  },
  actions: async (): Promise<{ rows: ActionRow[] }> => { await delay(); return { rows: clone(mutable.actions) } },
  actionStatus: async (id: string, status: string) => {
    await delay()
    const action = mutable.actions.find((item) => item.action_id === id)
    if (action) action.status = status
    return { ok: true, action: clone(action!) }
  },
  evaluate: async (id: string, week: string): Promise<Outcome> => {
    await delay()
    const outcome: Outcome = { outcome_id: `out-${Date.now()}`, action_id: id, evaluated_at: week, baseline_json: JSON.stringify({ week }), actual_json: JSON.stringify({ week }), metric_changes_json: JSON.stringify({ change_pct: 0.4 }), success: 'inconclusive', notes: `已按 ${week} 周报完成离线结果评估。` }
    mutable.outcomes.push(outcome)
    return clone(outcome)
  },
  actionStats: async (): Promise<ActionStats> => {
    await delay()
    const recommendations = Object.values(mutable.recommendations).flat()
    const proposed = recommendations.filter((recommendation) => recommendation.status === 'proposed').length
    const completed = mutable.actions.filter((action) => action.status === 'completed').length
    return {
      recommendations_by_status: { proposed, approved: recommendations.filter((recommendation) => recommendation.status === 'approved').length, rejected: recommendations.filter((recommendation) => recommendation.status === 'rejected').length },
      actions_by_status: { planned: mutable.actions.filter((action) => action.status === 'planned').length, in_progress: mutable.actions.filter((action) => action.status === 'in_progress').length, completed },
      outcomes_by_status: { yes: mutable.outcomes.filter((outcome) => outcome.success === 'yes').length, no: mutable.outcomes.filter((outcome) => outcome.success === 'no').length, inconclusive: mutable.outcomes.filter((outcome) => outcome.success === 'inconclusive').length },
      adoption_rate: 0.5, completion_rate: mutable.actions.length ? completed / mutable.actions.length : 0, success_rate: null, proposed,
    }
  },
  outcomes: async (): Promise<{ rows: Outcome[] }> => { await delay(); return { rows: clone(mutable.outcomes) } },
  ask: async (question: string): Promise<AskResponse> => { await delay(240); return chooseResponse(question) },
  qualityIssues: async (status = 'open'): Promise<{ rows: QualityIssue[] }> => { await delay(); return { rows: clone(mutable.issues.filter((issue) => issue.status === status)) } },
  resolveIssue: async (id: string, body: ResolveIssue) => {
    await delay()
    const issue = mutable.issues.find((item) => item.issue_id === id)
    if (issue) issue.status = 'resolved'
    return { ok: true, facts_tagged: body.resolution === 'definition_change_confirmed' ? 3 : 0 }
  },
  definitionChanges: async (): Promise<{ rows: DefinitionChange[] }> => {
    await delay()
    return { rows: [{ change_id: 'def-change-loss', metric_name: '损耗率', category: '蔬菜', old_definition: 'def-standard-v1', new_definition: 'def-loss-night-v2', new_definition_id: 'def-loss-night-v2', effective_from: '2026-W33', status: 'confirmed', confirmed_by: '王总管', confirmed_at: '2026-W33' }] }
  },
  series: async (metric: string, category: string): Promise<Series> => { await delay(); return clone(seriesFor(metric, category)) },
  dashboard: async (): Promise<DashboardData> => { await delay(); return dashboardForWeek('2026-W35') },
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try { return JSON.parse(text) as T } catch { return fallback }
}

export async function askStream(
  question: string,
  handlers: AskHandlers,
  signal?: AbortSignal,
  history?: Array<{ q: string; a: string }>,
  contextModule?: string | null,
  _contextType?: string | null,
): Promise<void> {
  const response = chooseResponse(question)
  const contextual = history?.length || contextModule
    ? { ...response, context_turns: history?.length ?? 0, answer: response.answer + (contextModule ? `\n\n已结合当前选中的「${contextModule}」模块上下文。` : '') }
    : response
  await streamResponse(contextual, handlers, signal)
}

export async function askRerun(
  question: string,
  understanding: import('./types').Understanding,
  slots: Record<string, string>,
  handlers: AskHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const base = chooseResponse(question)
  const slotsKey = Object.keys(slots).join(',')
  let rerun: AskResponse

  // ── 趋势类问题的周数槽位变更：根据新周数动态生成数据行、SQL 和回答 ──
  if (slots.weeks && understanding.plan?.operation === 'trend') {
    const n = Math.min(parseInt(slots.weeks, 10) || 5, WEEK_LABELS.length)
    const metric = String(understanding.args?.metric ?? 'GMV')
    const slicedWeeks = WEEK_LABELS.slice(-n)
    const startIdx = WEEK_LABELS.length - n

    // 指标→数据数组映射
    const metricMap: Record<string, { arr: number[]; unit: string; fmt: (v: number) => string }> = {
      GMV: { arr: summaryGmv, unit: '万元', fmt: (v) => v.toLocaleString() },
      净利率: { arr: summaryNetMargin, unit: '%', fmt: (v) => String(v) },
      毛利率: { arr: summaryGrossMargin, unit: '%', fmt: (v) => String(v) },
    }
    const config = metricMap[metric]
    if (config) {
      const dataRows = slicedWeeks.map((week, i) => ({
        week_label: week,
        metric_name: metric,
        metric_value: config.arr[startIdx + i],
        metric_unit: config.unit,
        wow_change_pct: wow(config.arr[startIdx + i], config.arr[startIdx + i - 1], metric) ?? 0,
      }))
      const startWeek = slicedWeeks[0]
      const endWeek = slicedWeeks[slicedWeeks.length - 1]
      const startVal = config.arr[startIdx]
      const endVal = config.arr[WEEK_LABELS.length - 1]
      const changePct = Number(((endVal - startVal) / startVal * 100).toFixed(1))

      rerun = {
        ...base,
        answer: `已按调整后的口径重跑（${n} 周）：${metric} 最近 ${n} 周从 ${startWeek.replace('2026-', '')} 的 ${config.fmt(startVal)}${config.unit} 升至 ${endWeek.replace('2026-', '')} 的 ${config.fmt(endVal)}${config.unit}，整体变化 ${changePct >= 0 ? '+' : ''}${changePct}%。`,
        rows: dataRows,
        sql: `SELECT week_label, metric_value FROM facts\nWHERE category = '总体' AND metric_name = '${metric}' AND week_label >= '${startWeek}'\nORDER BY week_label;`,
        evidence: [`事实表 ${startWeek} 至 ${endWeek}`],
        calculation: metric === 'GMV'
          ? { formula: `(${endVal} - ${startVal}) / ${startVal} × 100%`, result: { change_pct: changePct }, explanation: `以 ${startWeek} 为起点、${endWeek} 为终点。` }
          : undefined,
        understanding: {
          ...understanding,
          args: { ...understanding.args, last_n_weeks: n },
          slots: understanding.slots.map((slot) => slots[slot.key]
            ? { ...slot, values: [slots[slot.key]] }
            : slot),
        },
        response_time_ms: 96,
      }
    } else {
      // 非标准指标：回退到通用重跑逻辑
      rerun = {
        ...base,
        answer: `已按调整后的口径重跑（${n} 周）：${base.answer}`,
        understanding: {
          ...understanding,
          slots: understanding.slots.map((slot) => slots[slot.key]
            ? { ...slot, values: [slots[slot.key]] }
            : slot),
        },
        response_time_ms: 96,
      }
    }
  } else if (slots.week && understanding.plan?.operation === 'rank') {
    // ── 排名类问题的周次槽位变更：替换周次并重生成 SQL ──
    const week = slots.week
    rerun = {
      ...base,
      answer: `已按调整后的口径重跑（${week}）：${base.answer.replace(/2026-W\d+/g, week)}`,
      sql: base.sql?.replace(/2026-W\d+/g, week),
      evidence: [`《${week} 销售周报》`],
      understanding: {
        ...understanding,
        args: { ...understanding.args, week },
        slots: understanding.slots.map((slot) => slots[slot.key]
          ? { ...slot, values: [slots[slot.key]] }
          : slot),
      },
      response_time_ms: 96,
    }
  } else if (slots.change_pct && understanding.plan?.operation === 'scenario') {
    // ── 情景推演的变化率槽位变更：重新计算情景值 ──
    const pct = parseFloat(slots.change_pct) || 10
    const baseVal = (base.rows?.[0] as Record<string, unknown>)?.base_value as number ?? 316
    const scenarioVal = Number((baseVal * (1 + pct / 100)).toFixed(1))
    const delta = Number((scenarioVal - baseVal).toFixed(1))
    rerun = {
      ...base,
      answer: `已按调整后的口径重跑（变化率 ${pct}%）：如果上涨 ${pct}%，按 ${baseVal} 万元/日计算，将增加约 ${delta} 万元/日，情景值约 ${scenarioVal} 万元/日。`,
      rows: [{ category: '蔬菜', metric_name: 'GMV', base_value: baseVal, change_pct: pct, scenario_value: scenarioVal, metric_unit: '万元' }],
      sql: `SELECT metric_value FROM facts WHERE week_label = '2026-W35' AND category = '蔬菜' AND metric_name = 'GMV';`,
      calculation: { formula: `${baseVal} × (1 + ${pct}%) = ${scenarioVal}`, result: { base: baseVal, delta, scenario: scenarioVal }, explanation: '仅做确定性算术推演，不假设其他品类联动。', caveats: ['不构成预测，不包含成本、补贴与供应约束。'] },
      understanding: {
        ...understanding,
        args: { ...understanding.args, change_pct: pct },
        slots: understanding.slots.map((slot) => slots[slot.key]
          ? { ...slot, values: [slots[slot.key]] }
          : slot),
      },
      response_time_ms: 96,
    }
  } else {
    // ── 通用兜底：更新槽位值但沿用原回答 ──
    rerun = {
      ...base,
      answer: `已按调整后的口径重跑${slotsKey ? `（${Object.entries(slots).map(([, v]) => v).join(' · ')}）` : ''}：${base.answer}`,
      understanding: {
        ...understanding,
        slots: understanding.slots.map((slot) => slots[slot.key]
          ? { ...slot, values: [slots[slot.key]] }
          : slot),
      },
      response_time_ms: 96,
    }
  }
  await streamResponse(rerun, handlers, signal, true)
}
