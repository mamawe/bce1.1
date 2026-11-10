import { useCallback, useEffect, useRef, useState } from 'react'
import { askStream, getApiUser } from '../../api'
import type { AskResponse, CopilotAction } from '../../types'
import CopilotTrace from '../CopilotTrace'
import AskMetaBadges from '../AskMetaBadges'
import {
  CalculationCard, EvidenceQuotes, FollowUps, ResultTable,
  UnderstandingChips, ValidationNotes,
} from '../AnswerExtras'
import { mergeStep, type TraceStep } from '../../lib/trace'
import { fmtChars, fmtMs } from '../../lib/format'
import { ACTION_ICONS, Icon, type IconName } from '../../lib/icons'
import {
  clearCopilotTurns, loadCopilotTurns, newCopilotTurn, saveCopilotTurns, type CopilotTurn,
} from '../../lib/copilot-history'
import { Empty, ErrorBox } from '../../ui'

// 多轮是 Copilot 的命根子：一个接不住「那肉类呢」的助手不叫 Copilot
const CONTEXT_TURNS = 6

interface Props {
  /** 用户在页面上选中的模块/数据模组名 */
  selectedModule?: string | null
  /** 选中模块的上下文描述 */
  selectedContext?: string | null
}

const QUICK_PROMPTS: Record<string, string[]> = {
  default: [
    '帮我总结本周经营亮点',
    '哪些品类需要重点关注？',
    '本周有什么风险信号？',
  ],
  metric: [
    '最近几周的趋势怎么样？',
    '在各品类间的差异大吗？',
    '为什么会变化？',
  ],
  category: [
    '本周的表现如何？',
    '与上周相比有什么变化？',
    '有哪些待办行动？',
  ],
  dashboard: [
    '本周整体经营情况如何？',
    '哪个品类增长最快？',
    '有什么需要关注的异常？',
  ],
}

const MODULE_NOUN: Record<string, string> = {
  metric: '指标', category: '品类', dashboard: '看板', default: '模块',
}

export default function CopilotPanel({ selectedModule, selectedContext }: Props) {
  const userId = getApiUser()
  const [turns, setTurns] = useState<CopilotTurn[]>(() => loadCopilotTurns(userId))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 换身份换历史：与问数面板同一个规矩，受限身份不能读到上一身份的答案
  useEffect(() => { setTurns(loadCopilotTurns(userId)) }, [userId])
  useEffect(() => { saveCopilotTurns(userId, turns) }, [userId, turns])
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length])

  const moduleType = selectedModule
    ? selectedContext === 'metric' ? 'metric'
      : selectedContext === 'category' ? 'category'
      : 'dashboard'
    : 'default'

  const quickPrompts = QUICK_PROMPTS[moduleType] ?? QUICK_PROMPTS.default

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy) return
    setInput('')

    // 不再拼「关于指标「GMV」，」这种前缀：模块名由 context_module 结构化上送，
    // 服务端拿它当隐式主语（问题没点名对象时直接用选中的），不靠话术糊一层。
    // 客户端拼一遍、服务端再拼一遍，既白花 token 又会污染意图判定。
    const turn = newCopilotTurn(text, selectedModule, selectedContext)
    setTurns((prev) => [...prev, turn])
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const patch = (fn: (t: CopilotTurn) => CopilotTurn) =>
      setTurns((prev) => prev.map((t) => (t.id === turn.id ? fn(t) : t)))

    // 多轮上下文：只带「问 + 最终答案」，思考过程与 SQL 一律不上送
    const history = turns
      .filter((t) => t.done && !t.error && t.text.trim())
      .slice(-CONTEXT_TURNS)
      .map((t) => ({ q: t.q, a: t.text }))

    try {
      await askStream(
        text,
        {
          onMeta: (meta: AskResponse) => patch((t) => ({ ...t, meta })),
          onChunk: (piece) => patch((t) => ({ ...t, text: t.text + piece })),
          onReplace: (text) => patch((t) => ({ ...t, text })),
          onError: (message) => patch((t) => ({ ...t, error: message, done: true })),
          onThinking: (step) => patch((t) => ({
            ...t,
            thinking: mergeStep(t.thinking || [], step),
          })),
        },
        ctrl.signal,
        history,
        selectedModule,
        selectedContext,
      )
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === 'AbortError'
      patch((t) => ({
        ...t,
        error: cancelled ? '已停止' : e instanceof Error ? e.message : String(e),
        done: true,
      }))
    } finally {
      patch((t) => ({ ...t, done: true }))
      setBusy(false)
      abortRef.current = null
    }
  }

  const reset = useCallback(() => {
    if (busy) return
    clearCopilotTurns(userId)
    setTurns([])
  }, [busy, userId])

  return (
    <div className="copilot-panel">
      {/* 面板不再重复一遍「✦ Copilot」——侧栏标题已经在上面了。
          这里只说「现在在问谁」，那是 situational awareness，不是标题。 */}
      <div className="copilot-header">
        {selectedModule ? (
          <div className="copilot-focus">
            <Icon name="focus" size={13} />
            <span className="copilot-focus-tag">{selectedModule}</span>
            <span className="muted">{MODULE_NOUN[moduleType]} · 提问可省略主语</span>
          </div>
        ) : (
          <div className="copilot-focus is-idle">
            <Icon name="focus" size={13} />
            <span className="muted">在左边点一个指标或品类，它就当你的主语</span>
          </div>
        )}
      </div>

      <div className="copilot-scroll" ref={bodyRef}>
        {turns.length === 0 && !busy && (
          <>
            <div className="copilot-quick">
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="copilot-quick-btn"
                  disabled={busy}
                  onClick={() => send(q)}
                >
                  <Icon name="return" size={12} />
                  <span>{q}</span>
                </button>
              ))}
            </div>
            <Empty>
              Copilot 会把选中的模块当主语，并把问题涉及的那几周周报节选装进上下文。
              答案旁边有一行「依据」，点开能看到它调过什么、每一行是否回查得上。
            </Empty>
          </>
        )}

        {turns.map((t) => (
          <CopilotMessage key={t.id} turn={t} busy={busy} onSend={send} />
        ))}
      </div>

      <div className="copilot-composer">
        <textarea
          value={input}
          rows={2}
          placeholder={selectedModule ? `就「${selectedModule}」提问，可以省略主语…` : '输入你的问题…'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              send(input)
            }
          }}
        />
        <div className="copilot-input-foot">
          <span className="copilot-hint mono">Ctrl / ⌘ + Enter</span>
          {turns.length > 0 && (
            <button type="button" className="btn small" onClick={reset} disabled={busy}>清空</button>
          )}
          {busy ? (
            <button type="button" className="btn small" onClick={() => abortRef.current?.abort()}>停止</button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={busy || !input.trim()}
              onClick={() => send(input)}
            >
              提问
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** 一轮对话。
 *
 * 四个区块从上到下依次是：元信息（怎么答的、带了什么上下文）→ 正文 →
 * 依据（默认收起，出问题才自动摊开）→ 接着可以。
 * 之前这些块是平级的，徽章、上下文条、结果表、动作卡一路堆下来，
 * 用户分不清哪段是答案、哪段是凭据。 */
function CopilotMessage({ turn, busy, onSend }: {
  turn: CopilotTurn
  busy: boolean
  onSend: (q: string) => void
}) {
  const meta = turn.meta
  const lines = (turn.text || '').split('\n').filter(Boolean)
  // null = 没手动干预，按本轮状态自己决定：进行中摊开看进度，答完收起，
  // 但凡是核不上的（低置信 / 有行数被剔 / 报错）一律摊开——藏起来等于没说。
  const [override, setOverride] = useState<boolean | null>(null)
  const hasProblem = !!turn.error
    || meta?.confidence === 'low'
    || !!meta?.validation_errors?.length
    || !!meta?.rows_rejected
  const evidenceOpen = override ?? (!turn.done || hasProblem)

  return (
    <div className="copilot-turn">
      <div className="bubble bubble-q">
        <div className="bubble-label">问</div>
        <div className="bubble-body">
          {turn.module && (
            <span className="copilot-q-module" title={`这一轮选中的是${MODULE_NOUN[turn.moduleType ?? 'default']} ${turn.module}`}>
              <Icon name="focus" size={10} />
              {turn.module}
            </span>
          )}
          {turn.q}
        </div>
      </div>
      <div className="bubble bubble-a">
        <div className="bubble-label">答</div>
        <div className="bubble-body">
          <div className="answer">
            {turn.error && <ErrorBox message={turn.error} />}

            {/* ① 元信息：徽章给结论的可信度，标签给这轮带了什么上下文 */}
            {meta && (
              <div className="answer-meta">
                <AskMetaBadges meta={meta} />
                <ContextTags meta={meta} />
              </div>
            )}
            {meta && turn.done && (
              <UnderstandingChips meta={meta} busy={busy} readOnly onRun={() => {}} />
            )}

            {/* ② 正文 */}
            {turn.text && (
              <div className="answer-text">
                {lines.map((line, li) => (
                  <p key={li} className={li === 0 && lines.length > 1 ? 'answer-lead' : ''}>{line}</p>
                ))}
              </div>
            )}
            {!turn.done && !turn.text && !turn.error && !turn.thinking?.length && (
              <span className="copilot-cursor" />
            )}

            {/* ③ 依据：工具轨迹、告警、计算公式、结果表、原文、SQL */}
            {meta && (
              <EvidenceDrawer
                meta={meta}
                steps={turn.thinking}
                live={!turn.done}
                open={evidenceOpen}
                onToggle={(v) => setOverride(v)}
              />
            )}

            {/* ④ 接着可以：服务端按本次结果给的动作，后面接追问 */}
            {turn.done && (meta?.copilot?.actions?.length || meta?.follow_ups?.length) ? (
              <div className="copilot-next">
                <span className="copilot-next-lead">接着可以</span>
                <div className="copilot-next-list">
                  {meta?.copilot?.actions?.map((a) => (
                    <CopilotActionButton
                      key={`${a.kind}-${a.label}`}
                      action={a}
                      busy={busy}
                      onSend={onSend}
                      onOpenEvidence={() => setOverride(true)}
                    />
                  ))}
                  {meta && <FollowUps meta={meta} busy={busy} onSend={onSend} variant="list" />}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 装载上下文的两个标签：主语从哪来、周报装了哪几周。
 *  解释写进 title，标签本身一句话——气泡里放不下整句话，但鼠标一停就全。 */
function ContextTags({ meta }: { meta: AskResponse }) {
  const wc = meta.week_context
  const module = meta.copilot?.module
  const applied = meta.copilot?.subject_applied
  if (!applied && !wc?.weeks?.length) return null
  const weeks = wc?.weeks ?? []
  const more = weeks.length > 2 ? ` 等 ${weeks.length} 周` : ''
  return (
    <div className="answer-tags">
      {applied && module && (
        <span className="answer-tag" title="问题没点名对象，主语用你在页面上选中的模块补上了">
          <Icon name="focus" size={11} />
          主语 {module}
        </span>
      )}
      {weeks.length > 0 && (
        <span
          className="answer-tag"
          title={`把以下周报原文节选装进了上下文：${weeks.join('、')}（线索「${wc?.cue ?? '本周'}」）`}
        >
          <Icon name="evidence" size={11} />
          周报 {weeks.slice(0, 2).join('、')}{more}
          {wc?.chars ? ` · ${fmtChars(wc.chars)}` : ''}
        </span>
      )}
    </div>
  )
}

/** 依据抽屉。
 *
 *  为什么默认收起：Copilot 要短，满屏缓存其结果表和 SQL 就变成了另一个问数面板。
 *  为什么不全藏掉：标题行始终写着「N 步 · 多久 · 有没有失败」，并且只要答案有
 *  任何核不上的地方（低置信、行数被剔、报错），它就默认是开的。 */
function EvidenceDrawer({ meta, steps, live, open, onToggle }: {
  meta: AskResponse
  steps: TraceStep[] | undefined
  live: boolean
  open: boolean
  onToggle: (v: boolean) => void
}) {
  const stepCount = steps?.length ?? 0
  const rowCount = meta.rows?.length ?? 0
  const parts = [
    stepCount ? `${stepCount} 步` : '',
    rowCount ? `${rowCount} 行` : '',
    meta.validation_report?.checked_rows
      ? `回查 ${meta.validation_report.matched_rows}/${meta.validation_report.checked_rows}`
      : '',
    meta.response_time_ms != null ? fmtMs(meta.response_time_ms) : '',
  ].filter(Boolean)

  return (
    <details className="evidence" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary className="evidence-head">
        <span className="evidence-caret" aria-hidden><Icon name="chevron" size={11} /></span>
        <Icon name="snapshot" size={12} />
        <span className="evidence-title">依据</span>
        {parts.length > 0 && <span className="evidence-sub mono">{parts.join(' · ')}</span>}
      </summary>
      <div className="evidence-body">
        {steps && steps.length > 0 && (
          <CopilotTrace steps={steps} live={live} collapsible defaultOpen />
        )}
        {meta && <ValidationNotes meta={meta} />}
        {meta && <CalculationCard meta={meta} />}
        {meta?.calculation?.result && (
          <details className="qa-sql">
            <summary className="mono">查看计算明细</summary>
            <pre>{JSON.stringify(meta.calculation.result, null, 2)}</pre>
          </details>
        )}
        {meta?.rows?.length ? (
          <ResultTable rows={meta.rows} renderSpec={meta.render_spec} max={8} />
        ) : null}
        {meta && <EvidenceQuotes meta={meta} />}
        {meta?.sql && (
          <div className="qa-sql">
            <div className="qa-sql-head">生成的 SQL</div>
            <pre className="mono">{meta.sql}</pre>
          </div>
        )}
        {meta?.rule_insight && (
          <details className="qa-sql">
            <summary className="mono">查看确定性结论（未过 LLM）</summary>
            <pre>{meta.rule_insight}</pre>
          </details>
        )}
      </div>
    </details>
  )
}

/** 下一步动作：由服务端按本次结果给，不是前端写死的一组按钮。
 *  问出「蔬菜 GMV 316 万」和问出「算不了」，下一步不该是同一套。 */
function CopilotActionButton({ action, busy, onSend, onOpenEvidence }: {
  action: CopilotAction
  busy: boolean
  onSend: (q: string) => void
  onOpenEvidence: () => void
}) {
  // evidence 类动作没有 question：它做的事情是就地翻开依据区
  const icon = (ACTION_ICONS[action.kind] ?? 'why') as IconName
  return (
    <button
      type="button"
      className={`copilot-action copilot-action-${action.kind}`}
      disabled={busy}
      title={action.question ? `问：${action.question}` : (action.hint || '展开依据')}
      onClick={() => (action.question ? onSend(action.question) : onOpenEvidence())}
    >
      <Icon name={icon} size={13} />
      <span className="copilot-action-label">{action.label}</span>
      {action.hint && <span className="copilot-action-hint">{action.hint}</span>}
    </button>
  )
}
