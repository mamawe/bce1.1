export type PanelKey = 'ask' | 'context' | 'evidence' | 'review' | 'action' | 'assets' | 'dashboard'

// 正文里一次点击选中的对象：单个实体，或「品类/商户 + 指标」连写成的组合
export interface Focus {
  matched: string
  label: string
  kind: 'metric' | 'merchant' | 'category' | 'combo'
  entity?: EntityRow
  category?: string
  metric?: string
}

export interface User {
  user_id: string
  display_name: string
  role: string
  has_global_view: number
  categories: string[]
}

export interface EntityRow {
  entity_id: string
  entity_name: string
  category: string
  description: string
  is_overall: number
  aliases: string[]
}

export interface OntologyMetric {
  label: string
  unit: string
  aggregation: string
  delta_kind: string
  aliases: string[]
  allowed_dimensions: string[]
}

export interface Ontology {
  schema_version: string
  metrics: Record<string, OntologyMetric>
  dimensions: { category: string[]; merchant_type: string[] }
  event_types: string[]
  aliases: Record<string, string>
}

export interface Stats {
  facts: number
  weeks: number
  events: number
  decisions: number
  pending_candidates: number
  recommendations: number
  actions: number
  outcomes: number
}

export interface Health {
  ok: boolean
  version: string
  schema_version: string
  llm_enabled: boolean
  llm_ask_enabled?: boolean
  llm_model?: string
  /** 「为什么没走 LLM」：ready=false 时 reason/hint 说明成因与下一步 */
  llm?: { ready: boolean; reason: string; hint: string }
  /** 只说明「配没配」，不含任何密钥内容 */
  auth?: { jwt_configured: boolean; lark_enabled: boolean; env: string }
  config_warnings?: string[]
  stats: Stats
}

export interface AuthConfig {
  env: string
  jwt_configured: boolean
  lark_enabled: boolean
  dev_login: boolean
  ttl_seconds: number
  warnings: string[]
}

export interface LoginResult {
  token: string
  token_type: string
  expires_in: number
  user: User
}

export interface DocumentRow {
  doc_id: string
  title: string
  iso_year: number | null
  iso_week: number | null
  week_label: string | null
  period_start: string | null
  period_end: string | null
  doc_version: number
  ingest_status: string
  ingested_at: string
}

export interface DocumentDetail {
  doc_id: string
  title: string
  week_label: string | null
  iso_year: number | null
  iso_week: number | null
  period_start: string | null
  period_end: string | null
  time_source: string | null
  time_confidence: number | null
  doc_version: number
  ingested_at: string
  source_url: string
  content: string
  hidden_sections: string[]
  run: IngestReportRun | null
}

export interface IngestReportRun {
  ingest_run_id: string
  doc_id: string | null
  status: string
  facts_accepted: number
  facts_rejected: number
  events_extracted: number
  decisions_extracted: number
  recommendations_generated: number
  review_count: number
}

export interface DocContext {
  doc_id: string
  week_label: string | null
  facts: Fact[]
  events: EventRow[]
  decisions: DecisionRow[]
  recommendations: Recommendation[]
  candidates: Candidate[]
}

export interface Fact {
  id: number
  report_date: string
  week_label: string
  category: string
  merchant_type: string | null
  metric_name: string
  metric_value: number
  metric_unit: string | null
  aggregation: string
  comparison_type: string | null
  wow_change_pct: number | null
  source_doc_id: string | null
  source_quote: string | null
  confidence: number
  extraction_method: string
  review_status: string
  ingest_run_id: string | null
  is_active: number
}

export interface Candidate {
  candidate_id: string
  ingest_run_id: string | null
  doc_id: string | null
  payload_json: string
  reason: string | null
  confidence: number
  status: string
  created_at: string
}

export interface EventRow {
  event_id: string
  entity_id: string
  entity_name: string | null
  entity_category: string | null
  occurred_at: string
  summary: string
  event_type: string
  attribution: string | null
  source_quote: string | null
  confidence: number
  document_id: string | null
}

export interface DecisionRow {
  decision_id: string
  event_id: string | null
  action_taken: string | null
  owner: string | null
  outcome: string | null
  outcome_detail: string | null
  decided_at: string | null
  effective_from: string | null
  strategy_id: string | null
  based_on_json: string
  source_quote: string | null
  confidence: number
  status: string
}

export interface Recommendation {
  recommendation_id: string
  ingest_run_id: string | null
  doc_id: string | null
  week_label: string
  action_type: string
  target_entities_json: string
  based_on_json: string
  strategy_id: string | null
  expected_impact_json: string
  confidence: number
  risk: string
  owner_role: string
  status: string
  rationale: string
  source_quote: string
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface ActionRow {
  action_id: string
  recommendation_id: string | null
  decision_id: string | null
  owner: string
  status: string
  started_at: string | null
  completed_at: string | null
  notes: string
  created_at: string
}

export interface Outcome {
  outcome_id: string
  action_id: string
  evaluated_at: string
  baseline_json: string
  actual_json: string
  metric_changes_json: string
  success: string
  notes: string
}

export interface ActionStats {
  recommendations_by_status: Record<string, number>
  actions_by_status: Record<string, number>
  outcomes_by_status: Record<string, number>
  adoption_rate: number | null
  completion_rate: number | null
  success_rate: number | null
  proposed: number
}

export interface IngestReport {
  run_id: string
  doc_id: string
  week_label: string
  facts_extracted: number
  facts_accepted: number
  facts_rejected: number
  events_extracted: number
  decisions_extracted: number
  recommendations_generated: number
  review_count: number
  skipped_tables: string[]
  warnings: string[]
  identity: {
    iso_year: number
    iso_week: number
    week_label: string
    period_start: string
    period_end: string
    source: string
    confidence: number
  }
  candidates: Array<{ candidate_id: string; reason: string; confidence: number }>
}

import type { TraceStep } from './lib/trace'

export interface AskHandlers {
  onMeta: (payload: AskResponse) => void
  onChunk: (text: string) => void
  onError: (message: string) => void
  onReplace?: (text: string) => void
  onThinking?: (payload: TraceStep) => void
}

// 渲染规格：后端编译器声明的列角色，前端据此出表头与单位，不再靠列名猜语义
export interface RenderColumn {
  key: string
  role: 'subject' | 'measure' | 'derived'
  label: string
  metric?: string
  unit_kind?: 'percent' | 'money_wan' | 'currency_yuan' | 'count' | 'other'
  unit?: string
}

export interface RenderSpec {
  columns: RenderColumn[]
}

// 校验报告：这一批答案到底回查了多少行、有没有算出来的列
export interface ValidationReport {
  checked_rows: number
  matched_rows: number
  rejected_rows: number
  derived_columns: string[]
  aggregate_used: boolean
  anchors_ok: boolean
  anchors_checked?: boolean
  missing_anchors: string[]
}

export interface ClaimInput {
  role: string
  entity: string
  metric: string
  week: string
  value: number
  unit: string
  text: string
}

// 一次回答只允许有一个主张：operation + 输入 + 结果 + 人话结论
export interface Claim {
  operation: string
  label: string
  week: string
  inputs: ClaimInput[]
  formula: string
  result: { value: number; unit: string; text: string }
  answer: string
  caveats?: string[]
  scenario?: Record<string, unknown> | null
}

export interface AskResponse {
  question_type: string
  answer: string
  rows: Record<string, unknown>[]
  confidence: string
  evidence: Array<string | null>
  engine?: 'llm' | 'rules' | 'mock'
  // path 说的是「答案怎么来的」：sql=模型写 SQL；explain=模型只解释算好的数；
  // rule=确定性规则；mock=离线演示的预置答案；mock_llm=离线演示里模拟「模型写 SQL」的样本
  path?: 'sql' | 'explain' | 'rule' | 'mock' | 'mock_llm' | string
  sql?: string | null
  rows_rejected?: number
  note?: string
  intent?: string
  terms?: { categories: string[]; merchants: string[]; metrics: string[] }
  follow_ups?: string[]
  response_time_ms?: number
  token_usage?: { prompt_tokens: number; completion_tokens: number; calls: number; models: string[] }
  calculation?: {
    formula?: string
    result?: Record<string, unknown>
    explanation?: string
    caveats?: string[]
  }
  claims?: Claim[]
  llm_rejected?: boolean
  answer_mode?: string
  // 本次带入了几轮对话上下文（0/缺省表示没开或没有历史）
  context_turns?: number
  bounds?: Record<string, unknown>
  rule_insight?: string
  validation_errors?: string[]
  fallback_used?: boolean
  fallback_reason?: string
  scope_denied?: boolean
  rows_validated?: boolean
  render_spec?: RenderSpec | null
  validation_report?: ValidationReport | null
  sub_qas?: Array<{ q: string; a: string }>
  // 本次回答按哪些槽位展开：头部回显，点一下换值即确定性重跑（不调模型）
  understanding?: Understanding | null
  // 本次按问题涉及的时间范围装载了哪几周的周报原文。装了什么要能看见，
  // 否则「有没有把周报装进上下文」永远是个黑箱
  week_context?: WeekContext | null
  // Copilot 专属：选中模块、隐式主语是否生效、下一步动作
  copilot?: CopilotBlock | null
}

// 回显槽位：key 是服务端认得的槽位名，values 是当前取值，options 是可换的取值
// 周报上下文：问题说到哪几周，就把那几周的原文节选装进模型上下文
export interface WeekContext {
  // 时间线索（"本周" / "前5周" / "2026-W33～2026-W35"）
  cue: string | null
  weeks: string[]
  chars: number
  docs: Array<{ week: string; title: string; chars: number; sentences: number }>
}

export interface CopilotAction {
  // trend / rank / why / compare / snapshot / todo / highlight / risk / focus / evidence
  kind: string
  label: string
  // 有 question 的是「接着问一句」，没有的是就地展开（如 evidence）
  question?: string
  hint?: string
}

export interface CopilotBlock {
  module: string | null
  type: string | null
  // 选中模块真的当上了主语（问题没点名对象时用选中的补上）
  subject_applied: boolean
  week_context: WeekContext | null
  actions: CopilotAction[]
}

export interface UnderstandingSlot {
  key: string
  label: string
  kind: string
  values: string[]
  options: string[]
}

export interface Understanding {
  // compiler=走语义层编译器；operations=走算子（占比/差值/倍数/推演/计数）
  executor: string
  tool?: string | null
  plan: Record<string, unknown>
  args: Record<string, unknown>
  slots: UnderstandingSlot[]
  // 依据/口径类答案与多问句合并的回答只展示、不给编辑位
  editable: boolean
  reason?: string
}

// 周环比一致性检测产出的 issue
export interface QualityIssue {
  issue_id: string
  doc_id: string
  week_label: string
  category: string | null
  merchant_type: string | null
  metric_name: string
  issue_type: string
  severity: string
  status: string
  current_value: number | null
  prev_reported: number | null
  prev_stored: number | null
  reported_wow: number | null
  computed_wow_reported: number | null
  computed_wow_stored: number | null
  diff_reported: number | null
  diff_stored: number | null
  tolerance: number | null
  delta_kind: string | null
  text_signal: string | null
  evidence_json: string | null
  resolution: string | null
  created_at: string
}

export interface ResolveIssue {
  resolution: string
  definition_id?: string
  effective_from?: string
  comment?: string
}

export interface DefinitionChange {
  change_id: string
  metric_name: string
  category: string | null
  old_definition: string | null
  new_definition: string | null
  new_definition_id: string | null
  effective_from: string | null
  status: string
  confirmed_by: string | null
  confirmed_at: string | null
}

export interface Series {
  metric: string
  entity: string
  points: Array<{
    week_label: string
    value: number
    wow_change_pct: number | null
    reported_wow: number | null
    wow_check_status: string
    definition_id: string | null
  }>
  segments: Array<{ from: string; to: string; definition_id: string }>
  break_points: Array<{ week: string; reason: string; from_definition: string; to_definition: string }>
  comparability: string
  derived_view_available: boolean
}

// 可视化看板数据
export interface DashboardKPI {
  metric: string
  value: number
  unit: string | null
  wow: number | null
}

export interface DashboardMatrixRow {
  category: string
  gmv: number
  unit: string | null
  wow: number | null
  share: number
}

export interface DashboardTrendPoint {
  week_label: string
  value: number
  wow: number | null
}

export interface DashboardEvent {
  event_id: string
  summary: string
  event_type: string
  occurred_at: string
}

export interface DashboardDecision {
  decision_id: string
  action_taken: string | null
  outcome: string | null
}

export interface DashboardData {
  empty: boolean
  week_label: string | null
  doc_title: string
  period_start: string | null
  period_end: string | null
  kpi: DashboardKPI[]
  matrix: DashboardMatrixRow[]
  total_gmv: number
  trends: DashboardTrendPoint[]
  events: DashboardEvent[]
  decisions: DashboardDecision[]
}
