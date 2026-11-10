import { useCallback, useEffect, useRef, useState } from 'react'
import { api, askRerun, askStream, getApiUser } from '../../api'
import type { Health } from '../../types'
import { clearTurns, loadTurns, newTurn, saveTurns, type AskTurn } from '../../lib/ask-history'
import AskMetaBadges from '../AskMetaBadges'
import {
  CalculationCard, EvidenceQuotes, FollowUps, ResultTable,
  UnderstandingChips, ValidationNotes,
} from '../AnswerExtras'
import { Empty, ErrorBox } from '../../ui'

// 上下文开关：只影响「要不要把最近几轮问答带给模型」，不影响数据的可见范围
const CONTEXT_KEY = 'bce_v11_ask_context'
const CONTEXT_TURNS = 6

// 快捷问题：覆盖取数、排名、趋势、归因、对比、情景推演等典型问法
const QUICK = [
  '各品类GMV排名和占比',
  '麻辣烫客单价下降 10% 对 GMV 和毛利率影响多少',
  '蔬菜和水产在 GMV、客单价、复购率、损耗率上的对比',
  '总体GMV最近5周趋势',
  '为什么蔬菜损耗率下降',
  '如果蔬菜GMV上涨10%会是多少',
  '总体净利率最近8周每周的环比变化',
  '损耗率低于 2.5% 的品类里毛利率最高的三个是谁',
  '哪些品类 GMV 份额超过 8% 且毛利率低于 20%',
]

/** 回答内容分类渲染：把答案里的文本段落、计算卡、证据引用、结果表分开渲染。
 *  旧实现把所有东西堆在一个 flex-column 里，答案越长越难看出结构。 */
function AnswerBody({ turn, busy, send, rerun }: {
  turn: AskTurn
  busy: boolean
  send: (q: string) => void
  rerun: (turn: AskTurn, slots: Record<string, string>) => void
}) {
  const meta = turn.meta
  const lines = (turn.text || '').split('\n').filter(Boolean)
  return (
    <div className="answer">
      {meta && <AskMetaBadges meta={meta} />}
      {meta && turn.done && (
        <UnderstandingChips meta={meta} busy={busy} onRun={(slots) => rerun(turn, slots)} />
      )}
      {meta?.context_turns ? (
        <p className="qa-note">本次带入 {meta.context_turns} 轮上下文，仅用于消解指代</p>
      ) : null}
      {meta?.note && <p className="qa-note">{meta.note}</p>}
      {meta?.fallback_used && meta.fallback_reason && !meta.note && (
        <p className="qa-note">降级原因：{meta.fallback_reason}</p>
      )}

      {/* 答案正文：按行渲染，第一行加粗作为结论句 */}
      <div className="answer-text">
        {lines.map((line, li) => (
          <p key={li} className={li === 0 && lines.length > 1 ? 'answer-lead' : ''}>{line}</p>
        ))}
        {!turn.done && <span className="qa-cursor" />}
      </div>

      {/* 校验告警 */}
      {meta && <ValidationNotes meta={meta} />}

      {/* 计算卡 */}
      {meta && <CalculationCard meta={meta} />}
      {meta?.calculation?.result && (
        <details className="qa-sql">
          <summary className="mono">查看计算明细</summary>
          <pre>{JSON.stringify(meta.calculation.result, null, 2)}</pre>
        </details>
      )}

      {/* SQL 代码块：默认展开，不藏在 details 里 */}
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

      {/* 证据引用 */}
      {meta && <EvidenceQuotes meta={meta} />}

      {/* 结果表 */}
      {meta?.rows?.length ? (
        <ResultTable rows={meta.rows} renderSpec={meta.render_spec} />
      ) : null}

      {/* 追问建议 */}
      {turn.done && meta && <FollowUps meta={meta} busy={busy} onSend={send} />}
    </div>
  )
}

export default function AskPanel() {
  const [input, setInput] = useState('')
  const userId = getApiUser()
  // 历史按身份分桶并落在 localStorage 里：切到别的页签再回来不必重问
  const [turns, setTurns] = useState<AskTurn[]>(() => loadTurns(userId))
  const [busy, setBusy] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const [useContext, setUseContext] = useState<boolean>(() => {
    try { return localStorage.getItem(CONTEXT_KEY) === '1' } catch { return false }
  })
  const abortRef = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // 面板一打开就问一次后端状态：没有模型时要把原因说清楚，而不是让人盯着「确定性规则路径」猜
  useEffect(() => {
    let cancelled = false
    api.health().then((h) => { if (!cancelled) setHealth(h) }).catch(() => { if (!cancelled) setHealth(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { saveTurns(userId, turns) }, [userId, turns])
  useEffect(() => {
    try { localStorage.setItem(CONTEXT_KEY, useContext ? '1' : '0') } catch { /* 存储被禁用时静默 */ }
  }, [useContext])

  // 新答案落在面板底部，回来时直接停在最新一轮；空对话保持顶部，别一进来就滚过欢迎区
  useEffect(() => {
    const el = bodyRef.current
    if (el && turns.length > 0) el.scrollTop = el.scrollHeight
  }, [turns.length])

  const reset = useCallback(() => {
    if (busy) return
    clearTurns(userId)
    setTurns([])
  }, [busy, userId])

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy) return
    setInput('')
    const turn = newTurn(text)
    setTurns((prev) => [...prev, turn])
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const patch = (fn: (t: AskTurn) => AskTurn) =>
      setTurns((prev) => prev.map((t) => (t.id === turn.id ? fn(t) : t)))
    // 上下文只取「问 + 最终答案」：思考过程、claim、SQL 一律不带
    const history = useContext
      ? turns.filter((t) => t.done && !t.error && t.text.trim())
          .slice(-CONTEXT_TURNS)
          .map((t) => ({ q: t.q, a: t.text }))
      : undefined
    try {
      await askStream(
        text,
        {
          onMeta: (meta) => patch((t) => ({ ...t, meta })),
          onChunk: (piece) => patch((t) => ({ ...t, text: t.text + piece })),
          onReplace: (text) => patch((t) => ({ ...t, text })),
          onError: (message) => patch((t) => ({ ...t, error: message, done: true })),
        },
        ctrl.signal,
        history,
      )
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === 'AbortError'
      patch((t) => ({
        ...t,
        error: cancelled ? '已停止生成' : e instanceof Error ? e.message : String(e),
        done: true,
      }))
    } finally {
      patch((t) => ({ ...t, done: true }))
      setBusy(false)
      abortRef.current = null
    }
  }

  /** 提交改过的槽位，整轮重跑：服务端重新路由后按新口径确定性执行，答案替换原气泡。 */
  async function rerun(turn: AskTurn, slots: Record<string, string>) {
    const u = turn.meta?.understanding
    if (!u || busy || !u.editable) return
    if (!Object.keys(slots).length) return
    setBusy(true)
    const patch = (fn: (t: AskTurn) => AskTurn) =>
      setTurns((prev) => prev.map((t) => (t.id === turn.id ? fn(t) : t)))
    // 先留一份原答案：重跑失败或连接被掐断时要把原口径的结果还回去，
    // 不能让用户改一个标签就把已经看到的答案弄成空白
    const snapshot = { text: turn.text, meta: turn.meta, error: turn.error }
    patch((t) => ({ ...t, text: '', meta: undefined, error: undefined, done: false }))
    const restore = () => patch((t) => (t.text.trim() ? t : { ...t, ...snapshot, done: true }))
    try {
      await askRerun(turn.q, u, slots, {
        onMeta: (meta) => patch((t) => ({ ...t, meta })),
        onChunk: (piece) => patch((t) => ({ ...t, text: t.text + piece })),
        onReplace: (text) => patch((t) => ({ ...t, text })),
        onError: (message) => patch((t) => ({ ...t, error: message })),
      })
    } catch (e) {
      patch((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }))
    } finally {
      restore()
      patch((t) => ({ ...t, done: true }))
      setBusy(false)
    }
  }

  const llmMissing = !!health && (health.llm_ask_enabled === false || health.llm?.ready === false)

  return (
    <div className="panel-body ask-panel">
      {/* 只有历史在滚动：老问题被顶上去，提问框永远贴在侧边栏最下边 */}
      <div className="ask-scroll" ref={bodyRef}>
        {/* 欢迎区：空对话时展示能力简介 */}
        {turns.length === 0 && !busy && (
          <div className="qa-welcome">
            <div className="qa-welcome-icon" aria-hidden>💬</div>
            <h3 className="qa-welcome-title">问数助手</h3>
            <p className="qa-welcome-desc">
              基于本周周报的已核验事实回答问题。数据来源单一（周报事实表），但支持自然语言提问：
              取数、排名、趋势、归因、对比、情景推演，以及待办建议查询。
            </p>
            <div className="qa-welcome-capabilities">
              <span className="qa-cap">取数</span>
              <span className="qa-cap">排名</span>
              <span className="qa-cap">趋势</span>
              <span className="qa-cap">归因</span>
              <span className="qa-cap">对比</span>
              <span className="qa-cap">推演</span>
            </div>
          </div>
        )}

        {llmMissing && (
          <div className="llm-notice" role="status">
            <div className="llm-notice-head">
              <span className="llm-notice-dot" aria-hidden />
              没有配置 LLM，当前走确定性规则路径
            </div>
            <p className="llm-notice-why">{health?.llm?.reason || '未检测到可用的模型配置'}</p>
            {health?.llm?.hint && <p className="llm-notice-hint">怎么开：{health.llm.hint}</p>}
            <p className="llm-notice-foot">
              取数、排序、环比计算照常可用且逐行可核对；只有归因、情景推演这类要「讲一段话」的问题会退化。
            </p>
          </div>
        )}

        {/* 快捷问题 */}
        <div className="chip-row qa-quick">
          {QUICK.map((q) => (
            <button type="button" key={q} className="chip" disabled={busy} onClick={() => send(q)}>{q}</button>
          ))}
        </div>

        {turns.length > 0 && (
          <div className="ask-history-bar">
            <span className="muted">已保留 {turns.length} 轮问答，切页后回来仍在</span>
            <button type="button" className="btn small" onClick={reset} disabled={busy}>清空历史</button>
          </div>
        )}

        {turns.length === 0 && !busy && (
          <Empty>
            问题会先在本体词表里认指标和品类，再让模型生成 SQL；SQL 只允许单条 SELECT，受限身份走只读视图，
            返回的每一行还要回事实表核对。核不上的一律不进答案，模型不可用时降级到确定性规则路径。
          </Empty>
        )}

      {/* 对话气泡：问答分开左右展示 */}
      {turns.map((t) => (
        <div className="ask-turn" key={t.id}>
          {/* 问题气泡：右对齐 */}
          <div className="bubble bubble-q">
            <div className="bubble-label">问</div>
            <div className="bubble-body">{t.q}</div>
          </div>
          {/* 回答气泡：左对齐 */}
          <div className="bubble bubble-a">
            <div className="bubble-label">答</div>
            <div className="bubble-body">
              {t.error && <ErrorBox message={t.error} />}
              <AnswerBody turn={t} busy={busy} send={send} rerun={rerun} />
            </div>
          </div>
        </div>
      ))}
      </div>

      {/* 提问框固定在这一层的底部：它不在滚动容器里，所以老问题只会往上顶 */}
      <div className="ask-composer">
        <textarea
          value={input}
          rows={2}
          placeholder="就本周周报提问，例如：蔬菜客单价最近几周怎么样"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 回车换行，Ctrl/⌘ + Enter 才发送：周报问题常常是多行贴进来的，
            // 误触回车就发出去会打断输入。
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              send(input)
            }
          }}
        />
        <div className="ask-input-foot">
          <label
            className="ask-ctx"
            title={`把最近 ${CONTEXT_TURNS} 轮问答带给模型，用于消解「那肉类呢」这类指代；答案里的数字仍从事实表取`}
          >
            <input
              type="checkbox"
              checked={useContext}
              onChange={(e) => setUseContext(e.target.checked)}
            />
            带上下文
          </label>
          <span className="ask-hint mono">Ctrl / ⌘ + Enter 发送 · Enter 换行</span>
          {busy ? (
            <button type="button" className="btn small" onClick={() => abortRef.current?.abort()}>停止</button>
          ) : null}
          <button
            type="button"
            className="btn primary"
            disabled={busy || !input.trim()}
            onClick={() => send(input)}
          >
            {busy ? '回答中…' : '提问'}
          </button>
        </div>
      </div>
    </div>
  )
}
