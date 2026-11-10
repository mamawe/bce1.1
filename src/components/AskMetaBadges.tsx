import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AskResponse } from '../types'
import { metricLabel } from '../lib/metric-theme'
import { fmtMs } from '../lib/format'

/**
 * 悬停说明的定位有三种，按可用空间自动选：
 * below  指针下方（默认，指针在视口上半部分时用，避免被顶部挤出去）
 * above  指针上方（指针在下半部分时用）
 * beside 贴着按钮右侧（面板太窄、上方下方都放不下整条说明时）
 * 浮层用 fixed 定位，父级的 overflow / transform 都裁不到它。
 */
type TipPlacement = 'above' | 'below' | 'beside'

function InfoBadge(props: {
  tone: 'engine' | 'intent' | 'confidence'
  label: string
  title: string
  lines: string[]
  toneClass?: string
}) {
  const { tone, label, title, lines, toneClass } = props
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLSpanElement | null>(null)
  const [placement, setPlacement] = useState<TipPlacement>('below')
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null)
  const [open, setOpen] = useState(false)

  const place = useCallback(() => {
    const anchor = wrapRef.current?.getBoundingClientRect()
    if (!anchor) return
    const tip = tipRef.current?.getBoundingClientRect()
    const tipW = Math.min(tip?.width || 260, 300)
    const tipH = tip?.height || 120
    const margin = 10
    const vh = window.innerHeight
    const vw = window.innerWidth

    // 先选上下：下方放得下就下方，否则上方；都放不下就改成右侧
    let next: TipPlacement = 'below'
    if (anchor.bottom + margin + tipH > vh) next = anchor.top - margin - tipH > 0 ? 'above' : 'beside'

    let left = anchor.left + anchor.width / 2 - tipW / 2
    let top = next === 'below' ? anchor.bottom + margin : anchor.top - margin - tipH
    if (next === 'beside') {
      left = anchor.right + margin
      top = Math.min(Math.max(anchor.top + anchor.height / 2 - tipH / 2, margin), vh - tipH - margin)
    }
    // 水平方向别出视口：贴边时收回来，箭头单独对齐
    left = Math.min(Math.max(left, margin), Math.max(vw - tipW - margin, margin))
    setPlacement(next)
    setCoords({ left, top, width: tipW })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const onScrollOrResize = () => place()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, place])

  const show = () => setOpen(true)
  const hide = () => setOpen(false)

  return (
    <span
      className="meta-badge-wrap"
      ref={wrapRef}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span className={`meta-badge meta-badge-${tone}${toneClass ? ` ${toneClass}` : ''}`} aria-label={`${title}：${label}`}>{label}</span>
      <span
        ref={tipRef}
        className={`meta-tip meta-tip-${placement}${open ? ' is-open' : ''}`}
        role="tooltip"
        style={open && coords ? { left: coords.left, top: coords.top, maxWidth: coords.width } : undefined}
      >
        <span className="meta-tip-title">{title}</span>
        {lines.map((line) => <span className="meta-tip-line" key={line}>{line}</span>)}
      </span>
    </span>
  )
}

/**
 * 徽章说的是「答案怎么来的」，不是「谁写的话」。
 * 旧实现把 engine 直接翻成「LLM 生成 SQL」：情景推演里模型只负责解释、
 * sql 字段是空的，界面却仍然宣称生成了一条 SQL。
 */
const PATH_TEXT: Record<string, { title: string; hint: string }> = {
  sql: {
    title: 'LLM 生成 SQL',
    hint: '模型按本体词表写了单条 SELECT，执行结果逐行回查事实表后才拼进答案；核不上的行会被剔除。',
  },
  explain: {
    title: 'LLM 解释计算结果',
    hint: '数值由确定性算子算出（可复算），模型只解释含义，不得改动或新造数字；模型若说「算不了」会被丢弃。',
  },
  rule: {
    title: '确定性规则路径',
    hint: '按锚点直接查库或计算，本次没有模型参与。数字直接取自事实表，逐行可核对。',
  },
  compiled: {
    title: '语义层编译 · 模型规划',
    hint: '模型只输出结构化查询请求（度量/维度/周期），SQL 由编译器按本体生成，执行结果仍逐行回查事实表。',
  },
  rerun: {
    title: '改口径重跑 · 未调模型',
    hint: '按你在标签上选的口径确定性重跑：SQL 仍由编译器生成并回查事实表，本次一次模型都没调。',
  },
}

const CONFIDENCE_TEXT: Record<string, { title: string; hint: string }> = {
  high: { title: '置信度 · 高', hint: '数值全部能回查到事实表，没有发现自相矛盾的数字。' },
  medium: { title: '置信度 · 中', hint: '有部分数字核不上、被剔除，或走了降级路径，结论建议人工复核。' },
  low: { title: '置信度 · 低', hint: '依据不足或与上下文冲突，答案不能直接当结论用。' },
}

const INTENT_TEXT: Record<string, string> = {
  METRIC_VALUE: '问单点数值：某对象某个指标的最新取值。',
  METRIC_DISTRIBUTION: '问分布/排名：各品类或各商户在同一指标上的排序与占比。',
  COMPARISON: '问对比：两个对象或两个指标的差值、倍数。',
  TREND: '问趋势：同一指标在若干周上的走势。',
  ATTRIBUTION: '问归因：为什么涨/跌，答案来自事件与决策记录。',
  RECOMMENDATION: '问建议：列出待审批的行动建议及其依据。',
  WHAT_IF: '问情景推演：假设某指标变动后的大致结果。',
  ENTITY_LOOKUP: '问概况：某个品类/商户/指标在库里有哪些数据。',
  COUNT: '问数量：数一数有多少个品类/商户/周，不是取某个指标的数值。',
  CLARIFY: '路由判定缺关键槽位（指标/对象/周次），先反问一句再查。',
  AGGREGATE: '问汇总：库内数据覆盖范围与计数。',
  GENERAL: '通用问答，未落到具体指标取数。',
  OFF_TOPIC: '与业务无关的问题，按规则直接拒答，不进取数链路。',
  SCOPE_DENIED: '当前身份的品类权限不覆盖该对象，接口直接拒绝。',
}

export default function AskMetaBadges({ meta }: { meta: AskResponse }) {
  // 老响应没有 path：按 sql / engine 推一个等价结论，别让历史会话显示成「未知引擎」
  const pathKey: string = meta.path
    ?? (meta.sql ? 'sql' : meta.engine === 'llm' ? 'explain' : 'rule')
  const engine = PATH_TEXT[pathKey] ?? {
    title: pathKey,
    hint: '本次答案的执行方式。',
  }
  const intentKey = meta.intent ?? meta.question_type
  const confidence = CONFIDENCE_TEXT[meta.confidence] ?? {
    title: `置信度 · ${meta.confidence}`, 
    hint: '答案的可信程度，由数字回查与上下文校验结果决定。',
  } as { title: string; hint: string }
  const usage = meta.token_usage
  const tokens = usage?.calls
    ? `模型调用 ${usage.calls} 次，prompt ${usage.prompt_tokens} + completion ${usage.completion_tokens} token。`
    : '本次没有发生模型调用（规则路径），token 用量为 0。'

  return (
    <div className="qa-meta">
      {/* 第一行：三个圆角矩形徽标 */}
      <div className="qa-badges">
        <InfoBadge
          tone="engine"
          label={engine.title}
          title="生成方式"
          lines={[
            engine.hint,
            meta.fallback_used ? `本次发生降级：${meta.fallback_reason || meta.note || '已切到规则路径'}` : '本次未降级。',
          ]}

        />
        <InfoBadge
          tone="intent"
          label={intentKey}
          title="意图分类"
          lines={[INTENT_TEXT[intentKey] ?? '问题被归入这一类取数处理。', `分析对象：${describeTerms(meta)}`]}

        />
        <InfoBadge
          tone="confidence"
          label={meta.confidence}
          title={confidence.title}
          lines={[
            confidence.hint,
            validateText(meta),
            meta.rows_rejected ? `${meta.rows_rejected} 行数字在事实表里回查不到，已剔除。` : '没有整行被剔除。',
          ]}
          toneClass={`meta-badge-${meta.confidence}`}
        />
      </div>
      {/* 第二行：耗时与 token。单独一行，不参与上面徽标的换行计算 */}
      <div className="qa-usage" title={tokens}>
        <span className="qa-usage-item mono">耗时 {fmtMs(meta.response_time_ms)}</span>
        <span className="qa-usage-sep" aria-hidden>·</span>
        <span className="qa-usage-item mono">
          {usage?.calls ? `token ${usage.prompt_tokens}+${usage.completion_tokens}` : 'token 0'}
        </span>
      </div>
    </div>
  )
}

/** 「已逐行回查 10/10」或「含派生计算，未回查」：把校验报告翻成人话 */
function validateText(meta: AskResponse): string {
  const rep = meta.validation_report
  if (!rep) return '本次没有校验报告（旧版本响应）。'
  // 「没检查」不等于「检查通过」：问题里没点名对象/周次时，锚点校验是不跑的
  const anchorNote = rep.anchors_checked === false ? '本次问题没点名对象/周次，锚点校验未触发。' : ''
  if (rep.derived_columns?.length) {
    const cols = rep.derived_columns.join('、')
    return `含派生计算，未回查：${cols}。这些数由已登记口径算出，可复算但不对应某一行原文。${anchorNote}`
  }
  if (!rep.checked_rows) return `本次没有需要逐行回查的数值。${anchorNote}`
  const head = `已逐行回查 ${rep.matched_rows}/${rep.checked_rows}`
  if (rep.aggregate_used) return `${head}（含聚合结果，按明细重算比对）。${anchorNote}`
  return `${head}。${anchorNote}`
}

function describeTerms(meta: AskResponse): ReactNode {
  const terms = meta.terms
  const parts = [
    ...(terms?.metrics ?? []).map((m) => metricLabel(m)),
    ...(terms?.categories ?? []),
    ...(terms?.merchants ?? []),
  ]
  return parts.length ? parts.join(' / ') : '未识别到具体对象（总体口径）'
}
