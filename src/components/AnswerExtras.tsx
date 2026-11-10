import { useEffect, useMemo, useState } from 'react'
import type { AskResponse, RenderSpec } from '../types'
import { metricLabel } from '../lib/metric-theme'
import { Icon } from '../lib/icons'

/** 问答面板与 Copilot 共用的结果渲染块。
 *
 *  为什么抽出来：Copilot 早先把 meta 整个丢掉（`onMeta: () => {}`），于是置信度、
 *  逐行回查、口径槽位、结果表在 Copilot 里全线归零——问数链路上最值钱的可核对性
 *  只剩一段无法验证的话。抽出这些块不是为了少写代码，是为了让两个面板不可能再
 *  出现「一个有校验报告、一个没有」的分叉。
 */

/** 结果表：每列都有表头，值带单位，主语（周/对象/指标）单独成列。
 *
 *  改造前这里是一张没有表头的两列表：第一列写死成 category ?? merchant_type ?? week_label，
 *  第二列取「第一个数字字段」。SQL 一换成计算列，两列就都在猜，用户看到的是一串没有名字的管子。
 */
export function ResultTable({ rows, renderSpec, max: maxRows = 12 }: {
  rows: Record<string, unknown>[]
  renderSpec?: RenderSpec | null
  max?: number
}) {
  const cols = useResultColumns(rows, renderSpec)
  if (!cols.length) return null
  const shown = rows.slice(0, maxRows)
  return (
    <div className="qa-rows">
      <span className="eyebrow">
        命中 {rows.length} 行{rows.length > shown.length ? `（展示前 ${shown.length} 行）` : ''}
      </span>
      <div className="qa-table-wrap">
        <table className="mini-table qa-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.numeric ? 'ta-r' : ''} title={c.title ?? c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, ri) => (
              <tr key={ri}>
                {cols.map((c) => (
                  <td key={c.key} className={c.numeric ? 'mono num ta-r' : ''}>
                    {formatCell(row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface ResultColumn {
  key: string
  label: string
  title?: string
  unit?: string
  pct?: boolean
  numeric?: boolean
}

const COLUMN_META: Record<string, { label: string; unit?: string; pct?: boolean; title?: string }> = {
  week_label: { label: '周', title: '周标识' },
  category: { label: '品类', title: '口径对象：品类' },
  merchant_type: { label: '商户', title: '口径对象：商户类型' },
  metric_name: { label: '指标' },
  metric_value: { label: '数值', title: '该周日均值（不是周合计）' },
  metric_unit: { label: '单位' },
  wow_change_pct: { label: '环比', pct: true, title: '相对上周的变化；率类指标为百分点(pp)' },
  yoy_change_pct: { label: '同比', pct: true },
  pct: { label: '占比', pct: true },
  占比: { label: '占比', pct: true },
  source_quote: { label: '原文出处' },
}

const SUBJECT_COLS = ['week_label', 'category', 'merchant_type', 'metric_name']

/** 有 render_spec 就按后端声明的列角色出表头：主语在前、度量带单位、派生列加标注。
 *  没有（降级路径）才回落到列名约定——两条路都不猜列名的语义。 */
function useResultColumns(rows: Record<string, unknown>[], renderSpec?: RenderSpec | null): ResultColumn[] {
  return useMemo(() => {
    const specCols = renderSpec?.columns ?? []
    if (specCols.length) {
      return specCols.map((c) => ({
        key: c.key,
        label: c.role === 'derived' ? `${c.label}（算出来）` : c.label,
        title: c.role === 'derived'
          ? `由已登记口径算出：${c.metric ?? c.label}，无法逐行回查原文`
          : c.metric
            ? `口径：${c.metric}${c.unit ? ` · 单位 ${c.unit}` : ''}`
            : undefined,
        unit: c.unit,
        pct: c.unit_kind === 'percent',
        numeric: c.role !== 'subject',
      }))
    }
    const keys = new Set<string>()
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)))
    const cols: ResultColumn[] = []
    SUBJECT_COLS.filter((k) => keys.has(k)).forEach((k) => {
      const meta = COLUMN_META[k]
      cols.push({ key: k, label: meta.label, title: meta.title, numeric: false })
    })
    if (keys.has('metric_value')) {
      cols.push({ key: 'metric_value', label: COLUMN_META.metric_value.label, numeric: true })
      if (keys.has('metric_unit')) {
        cols.push({ key: 'metric_unit', label: '单位', numeric: false })
      }
    }
    ;['wow_change_pct', 'yoy_change_pct', 'pct', '占比'].forEach((k) => {
      if (keys.has(k)) {
        const meta = COLUMN_META[k]
        cols.push({ key: k, label: meta.label, pct: true, numeric: true, title: meta.title })
      }
    })
    // 计算列（占比、倍数、差值…）：有名字就成列，没名字的裸数字不进表
    keys.forEach((k) => {
      if (cols.some((c) => c.key === k) || ['source_quote', 'metric_unit', 'report_date'].includes(k)) return
      if (!rows.some((r) => typeof r[k] === 'number')) return
      cols.push({ key: k, label: k, numeric: true })
    })
    if (keys.has('source_quote')) {
      cols.push({ key: 'source_quote', label: '原文出处', numeric: false })
    }
    return cols
  }, [rows, renderSpec])
}

function formatCell(value: unknown, col: ResultColumn): string {
  if (value == null || value === '') return '—'
  if (col.key === 'source_quote') {
    const text = String(value)
    return text.length > 28 ? `${text.slice(0, 28)}…` : text
  }
  if (typeof value === 'number') {
    // 率类固定一位小数，与周报原文（72.0%）对齐；其余整数不补小数、最多两位
    const n = col.pct
      ? value.toFixed(1)
      : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
    // render_spec 给的单位最准（量纲由本体声明），没有时才按列名猜百分号
    if (col.unit) return col.pct ? `${n}%` : `${n} ${col.unit}`
    const suffix = col.key === 'metric_value' ? '' : col.pct ? '%' : ''
    return `${n}${suffix}`
  }
  return String(value)
}

/** 回显 + 就地改口径：下拉只改草稿，点「确定并重跑」才整轮重跑。
 *
 *  为什么不边改边跑：改一个槽位就立刻发一次请求，用户想同时换「对象 + 周期」时
 *  中间态会被当成两次提问各算一遍，既慢又留下两条互相矛盾的答案。
 *  现在草稿只暂存「改过还没提交」的槽位，点确认后一次性交给服务端：
 *  重新路由（单值 / 切分 / 趋势 / 对比）→ 再计算，整轮只跑一次。
 *  依据/口径类答案与多问句合并的回答只展示不给编辑位，理由由服务端说明。 */
export function UnderstandingChips({ meta, busy, onRun, readOnly = false }: {
  meta: AskResponse
  busy: boolean
  onRun: (slots: Record<string, string>) => void
  /** Copilot 用只读模式：改口径要带模块上下文，Copilot 这边的重跑拿不到隐式主语，
   *  与其给一个会答偏的按钮，不如只回显口径、把编辑留在问数面板。 */
  readOnly?: boolean
}) {
  const u = meta.understanding
  // 草稿按对象重置：服务端每轮都会回传新的 understanding，旧草稿不能带进新一轮
  const [draft, setDraft] = useState<Record<string, string>>({})
  useEffect(() => { setDraft({}) }, [meta])
  if (!u?.slots?.length) return null
  const editable = u.editable && !readOnly

  const currentOf = (key: string) => u.slots.find((s) => s.key === key)?.values[0] ?? ''
  const changed = Object.entries(draft).filter(([key, value]) => value !== currentOf(key))
  const dirtyKeys = new Set(changed.map(([key]) => key))
  const labelOf = (key: string) => u.slots.find((s) => s.key === key)?.label ?? key

  return (
    <div className="qa-understanding">
      {/* 只读模式（Copilot）不把 reason 排进版面：它每一轮都一样，
          占一整行却每次都在说同一句话。放进 title，鼠标一停还是能看到。 */}
      <span className="qa-u-lead" title={editable ? undefined : (u.reason || '本次只回显口径')}>
        {editable ? '本次按' : '本次口径'}
      </span>
      {u.slots.map((s) => {
        const current = s.values.join('、')
        // 当前值可能是「2026-W30～2026-W35（6 周）」这类区间写法或多个对象，
        // 不在候选里；补成首项，否则下拉显示空白，用户以为没选上
        const options = current && !s.options.includes(current) ? [current, ...s.options] : s.options
        const value = draft[s.key] ?? current
        return (
          <label
            className={`qa-u-slot${dirtyKeys.has(s.key) ? ' is-dirty' : ''}`}
            key={s.key}
            title={editable ? `改${s.label}，改完点「确定并重跑」` : (u.reason || '该回答不提供编辑')}
          >
            <span className="qa-u-label">{s.label}</span>
            {editable ? (
              <select
                className="qa-u-select"
                aria-label={`改${s.label}`}
                value={value}
                disabled={busy}
                onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
              >
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <span className="qa-u-value">{current}</span>
            )}
          </label>
        )
      })}
      {!editable && u.reason && !readOnly && <span className="qa-u-reason">{u.reason}</span>}

      {/* 有改动才出现按钮：没改就没有可提交的东西，不放一个永远灰着的按钮占位 */}
      {editable && changed.length > 0 && (
        <div className="qa-u-actions" role="group" aria-label="确认口径变更">
          <span className="qa-u-dirty">
            待重跑：{changed.map(([key, value]) => `${labelOf(key)}=${value}`).join(' · ')}
          </span>
          <button type="button" className="btn small" disabled={busy} onClick={() => setDraft({})}>
            撤销
          </button>
          <button
            type="button"
            className="btn primary small"
            disabled={busy}
            title="按改后的口径重新路由（单值/切分/趋势/对比）并重算，不调用模型"
            onClick={() => onRun(Object.fromEntries(changed))}
          >
            {busy ? '重跑中…' : '确定并重跑'}
          </button>
        </div>
      )}
    </div>
  )
}

/** 校验告警：核不上的数字、剔掉的行。Copilot 里同样要说，不能因为换了皮肤就省掉。 */
export function ValidationNotes({ meta }: { meta: AskResponse }) {
  return (
    <>
      {!!meta?.validation_errors?.length && (
        <p className="qa-note qa-warn">
          模型叙述里有 {meta.validation_errors.length} 个数字在上下文里找不到依据：
          {meta.validation_errors.join('；')}
        </p>
      )}
      {!!meta?.rows_rejected && (
        <p className="qa-note qa-warn">
          有 {meta.rows_rejected} 行在事实表里回查不到对应数值，已从答案中剔除
        </p>
      )}
    </>
  )
}

/**
 * 追问建议。
 *
 * 两种排法：问数面板是 chips（追问是它的最后一行）；Copilot 是 list，
 * 与「下一步动作」装进同一个列表容器——两者都是「接着可以干什么」，
 * 分两套视觉的话，用户会以为动作更可靠、追问是随便给的。
 */
export function FollowUps({ meta, busy, onSend, variant = 'chips' }: {
  meta: AskResponse
  busy: boolean
  onSend: (q: string) => void
  /** list 形态交给调用方的容器布局，自己不再套一层 .chip-row */
  variant?: 'chips' | 'list'
}) {
  const items = meta?.follow_ups ?? []
  if (!items.length) return null
  if (variant === 'list') {
    return (
      <>
        {items.map((f) => (
          <button
            key={f}
            type="button"
            className="copilot-action copilot-action-ask"
            disabled={busy}
            title="接着问一句"
            onClick={() => onSend(f)}
          >
            <Icon name="return" size={13} />
            <span className="copilot-action-label">{f}</span>
          </button>
        ))}
      </>
    )
  }
  return (
    <div className="chip-row qa-followups">
      {items.map((f) => (
        <button key={f} type="button" className="chip qa-followup" disabled={busy} onClick={() => onSend(f)}>
          ↳ {f}
        </button>
      ))}
    </div>
  )
}

/** 证据引用：答案里的每一句话都要能翻到出处。 */
export function EvidenceQuotes({ meta }: { meta: AskResponse }) {
  const quotes = (meta?.evidence ?? []).filter(Boolean) as string[]
  if (!quotes.length) return null
  return (
    <div className="qa-evidence">
      {quotes.map((q, qi) => <blockquote key={qi}>{q}</blockquote>)}
    </div>
  )
}

/** 计算卡：算出来的数，把公式与口径摆出来，别只给一个结果。 */
export function CalculationCard({ meta }: { meta: AskResponse }) {
  const calc = meta?.calculation
  if (!calc?.result) return null
  return (
    <div className="qa-calc">
      <div className="qa-calc-head">
        <span className="qa-calc-label">{meta.claims?.[0]?.label ?? '计算结果'}</span>
        {typeof calc.result.text === 'string' && (
          <span className="qa-calc-value mono">{calc.result.text}</span>
        )}
      </div>
      {calc.formula && <div className="qa-calc-formula mono">{calc.formula}</div>}
      {!!calc.caveats?.length && (
        <ul className="qa-calc-caveats">
          {calc.caveats.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
    </div>
  )
}

/** 术语回显（AskMetaBadges 用） */
export function describeTerms(meta: AskResponse): string {
  const terms = meta.terms
  const parts = [
    ...(terms?.metrics ?? []).map((m) => metricLabel(m)),
    ...(terms?.categories ?? []),
    ...(terms?.merchants ?? []),
  ]
  return parts.length ? parts.join(' / ') : '未识别到具体对象（总体口径）'
}
