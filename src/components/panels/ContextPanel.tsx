import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { aggLabel, stripMd } from '../../lib/labels'
import { isPpMetric, metricColor, metricLabel } from '../../lib/metric-theme'
import type { DocContext, Fact, Focus, Series } from '../../types'
import TrendChart, { type TrendPoint } from '../TrendChart'
import CompareChart, { type CompareRow } from '../CompareChart'
import StructureChart, { type StructureStep } from '../StructureChart'
import { Badge, Empty, ErrorBox, Loading } from '../../ui'

interface Props {
  focus: Focus | null
  ctx: DocContext | null
  weekLabel: string | null
}

const KIND_LABEL = {
  metric: '指标',
  merchant: '商户类型',
  category: '品类',
  combo: '品类 × 指标',
} as const

const KIND_TONE = {
  metric: 'violet',
  merchant: 'amber',
  category: 'cyan',
  combo: 'mint',
} as const

export default function ContextPanel({ focus, ctx, weekLabel }: Props) {
  const [history, setHistory] = useState<Fact[]>([])
  const [series, setSeries] = useState<Series | null>(null)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)

  useEffect(() => {
    setShowDetail(false)
    setSelectedMetric(null)
  }, [focus])

  useEffect(() => {
    if (!focus) { setSeries(null); return }
    // 组合点击或单指标点击都能定位到唯一序列，才谈得上"口径断点"
    const category = focus.kind === 'combo' ? focus.category : focus.kind === 'metric' ? '总体' : null
    const metric = focus.kind === 'combo' ? focus.metric : focus.kind === 'metric' ? focus.label : null
    if (!category || !metric) { setSeries(null); return }
    let cancelled = false
    api.series(metric, category)
      .then((s) => { if (!cancelled) setSeries(s) })
      .catch(() => { if (!cancelled) setSeries(null) })
    return () => { cancelled = true }
  }, [focus])

  useEffect(() => {
    if (!focus) { setHistory([]); return }
    let cancelled = false
    setBusy(true)
    setError('')
    const params = focus.kind === 'combo'
      ? { category: focus.category, metric: focus.metric }
      : focus.kind === 'metric'
        ? { metric: focus.label }
        : focus.kind === 'merchant'
          ? { merchant: focus.label }
          : { category: focus.label }
    api.facts(params)
      .then((r) => {
        if (cancelled) return
        setHistory(r.rows)
        setDenied(r.denied)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [focus])

  // 本周与该对象直接相关的数值行
  const weekFacts = useMemo(() => {
    if (!focus || !ctx) return []
    return ctx.facts.filter((f) => {
      // 组合对象的「品类」也可能是商户类型：沙县小吃客单价存在 merchant_type 上
      if (focus.kind === 'combo') {
        return f.metric_name === focus.metric
          && (f.category === focus.category || f.merchant_type === focus.category)
      }
      if (focus.kind === 'metric') return f.metric_name === focus.label
      if (focus.kind === 'merchant') return f.merchant_type === focus.label
      return f.category === focus.label
    })
  }, [focus, ctx])

  const headline = useMemo(() => {
    if (!weekFacts.length || !focus) return null
    if (focus.kind === 'metric') {
      return weekFacts.find((f) => f.category === '总体' && !f.merchant_type) ?? weekFacts[0]
    }
    // 组合对象优先「总体口径 + 该品类」那一条：沙县小吃客单价既有 merchant_type 行，
    // 也有品类表里的整体客单价，前者才是用户点这个词想看的
    if (focus.kind === 'combo') {
      return weekFacts.find((f) => f.merchant_type === focus.category) ?? weekFacts[0]
    }
    return weekFacts.find((f) => f.metric_name === 'GMV') ?? weekFacts[0]
  }, [weekFacts, focus])

  // 纯指标视角下每行属于不同品类/商户，必须标出来否则看着像重复行
  const showOwnerCol = focus?.kind === 'metric'

  // 组合视图：该指标本周在其它对象上的分布，用来看它在不在合理区间
  const peers = useMemo(() => {
    if (!focus || focus.kind !== 'combo' || !ctx) return []
    // 商户维度的组合（沙县小吃客单价）横向比的是其它商户，品类维度比的是其它品类
    const isMerchant = ctx.facts.some((f) => f.merchant_type === focus.category)
    return ctx.facts
      .filter((f) => {
        if (f.metric_name !== focus.metric) return false
        if (isMerchant) return !!f.merchant_type && f.merchant_type !== focus.category
        return !f.merchant_type && f.category !== '总体' && f.category !== focus.category
      })
      .sort((a, b) => b.metric_value - a.metric_value)
  }, [focus, ctx])

  const peerRank = useMemo(
    () => (headline
      ? peers.findIndex((p) => p.category === focus?.category || p.merchant_type === focus?.category) + 1
      : 0),
    [peers, headline, focus],
  )

  const latest = useMemo(() => {
    if (!history.length) return null
    return [...history].sort((a, b) => b.week_label.localeCompare(a.week_label))[0].week_label
  }, [history])

  const metricNames = useMemo(() => {
    const names = [...new Set(history.map((f) => f.metric_name))]
    return names.sort((a, b) => (a === 'GMV' ? -1 : b === 'GMV' ? 1 : a.localeCompare(b)))
  }, [history])

  const chartMetric = !focus
    ? null
    : focus.kind === 'metric'
      ? focus.label
      : focus.kind === 'combo'
        ? focus.metric
        : selectedMetric && metricNames.includes(selectedMetric)
          ? selectedMetric
          : metricNames.includes('GMV')
            ? 'GMV'
            : metricNames[0] ?? null

  const seriesMatches = !!series && !!chartMetric && series.metric === chartMetric && (
    focus?.kind === 'metric'
      ? series.entity === '总体'
      : focus?.kind === 'combo'
        ? series.entity === focus.category
        : focus?.kind === 'merchant'
          ? series.entity === focus.label
          : false
  )

  const chartPoints = useMemo<TrendPoint[]>(() => {
    if (!focus || !chartMetric) return []
    if (seriesMatches && series && series.points.length >= 2) {
      return series.points.map((p) => ({ week: p.week_label, value: p.value, wow: p.wow_change_pct }))
    }
    let rows = history.filter((f) => f.metric_name === chartMetric)
    if (focus.kind === 'merchant') {
      rows = rows.filter((f) => f.merchant_type === focus.label)
    } else if (focus.kind === 'combo') {
      // 品类组合看品类序列，商户组合看商户序列
      const owner = focus.category ?? ''
      rows = rows.filter((f) => (f.merchant_type === owner) || (f.category === owner && !f.merchant_type))
    } else {
      const category = focus.kind === 'metric' ? '总体' : focus.label
      rows = rows.filter((f) => f.category === category && !f.merchant_type)
    }
    const byWeek = new Map<string, Fact>()
    for (const r of rows) byWeek.set(r.week_label, r)
    return [...byWeek.values()]
      .sort((a, b) => a.week_label.localeCompare(b.week_label))
      .map((r) => ({ week: r.week_label, value: r.metric_value, wow: r.wow_change_pct }))
  }, [focus, chartMetric, seriesMatches, series, history])

  // 组合图叠加的是「环比」这条线：柱看绝对值、线看变化率，一张图回答两个问题
  const chartOverlay = useMemo(() => {
    if (!chartPoints.length) return null
    const values: Record<string, number | null> = {}
    for (const p of chartPoints) values[p.week] = p.wow
    if (Object.values(values).every((v) => v == null)) return null
    return { key: 'wow', label: '环比', unit: isPpMetric(chartMetric ?? '') ? 'pp' : '%', values }
  }, [chartPoints, chartMetric])

  // 横向对比：同一指标在其它对象上的分布（组合视图、品类/商户视图都给）
  const compareRows = useMemo<CompareRow[]>(() => {
    if (!ctx || !chartMetric) return []
    const owner = focus?.kind === 'combo' || focus?.kind === 'merchant' ? focus?.category ?? focus?.label : null
    const isMerchant = !!owner && ctx.facts.some((f) => f.merchant_type === owner)
    const rows: CompareRow[] = []
    if (isMerchant) {
      for (const f of ctx.facts) {
        if (f.metric_name === chartMetric && f.merchant_type) rows.push({ name: f.merchant_type, value: f.metric_value })
      }
    } else {
      for (const f of ctx.facts) {
        if (f.metric_name === chartMetric && !f.merchant_type && f.category !== '总体') {
          rows.push({ name: f.category, value: f.metric_value })
        }
      }
    }
    // 去重（同品类可能出现叙述值与表格值两条）
    const byName = new Map<string, CompareRow>()
    for (const r of rows) if (!byName.has(r.name)) byName.set(r.name, r)
    return [...byName.values()]
  }, [ctx, chartMetric, focus])

  // 结构图：损益穿透（金额 → 小计 → 净利润），只有选中总体或品类且有金额类指标时才画
  const structureSteps = useMemo<StructureStep[]>(() => {
    if (!ctx) return []
    const scope = focus?.kind === 'combo' ? focus.category : focus?.kind === 'category' ? focus.label : '总体'
    const rows = ctx.facts.filter((f) => !f.merchant_type && (scope === '总体' ? f.category === '总体' : f.category === scope))
    const gmv = rows.find((f) => f.metric_name === 'GMV')
    if (!gmv || gmv.metric_unit !== '万元') return []
    const costRate = (metric: string) => {
      const hit = rows.find((f) => f.metric_name === metric)
      return hit ? (gmv.metric_value * hit.metric_value) / 100 : 0
    }
    const steps: StructureStep[] = [{ name: 'GMV', delta: gmv.metric_value, cumulative: gmv.metric_value, kind: 'total' }]
    let acc = gmv.metric_value
    const deducts: Array<[string, number]> = [
      ['商品成本', costRate('商品成本率')],
      ['运输成本', costRate('运输成本率')],
      ['仓储成本', costRate('仓储成本率')],
      ['销售费用', costRate('销售费用率')],
      ['损耗', costRate('损耗成本率') || costRate('损耗率')],
      ['管理费用', costRate('管理费用率')],
    ]
    const known = deducts.filter(([, v]) => v > 0)
    if (known.length < 2) return []
    for (const [name, value] of known) {
      acc -= value
      steps.push({ name, delta: -value, cumulative: acc, kind: 'subtract' })
    }
    const net = rows.find((f) => f.metric_name === '净利润') ?? rows.find((f) => f.metric_name === '净利率')
    if (net && net.metric_unit === '万元') {
      steps.push({ name: '净利润', delta: net.metric_value, cumulative: net.metric_value, kind: 'subtotal' })
    } else if (net && net.metric_unit === '%') {
      const netValue = (gmv.metric_value * net.metric_value) / 100
      steps.push({ name: '净利润', delta: netValue, cumulative: netValue, kind: 'subtotal' })
    }
    return steps
  }, [ctx, focus])

  const chartBreaks = seriesMatches && series ? series.break_points.map((b) => b.week) : []
  const chartUnit = history.find((f) => f.metric_name === chartMetric && f.metric_unit)?.metric_unit ?? ''
  const chartScope = !focus
    ? ''
    : focus.kind === 'metric'
      ? '总体'
      : focus.kind === 'combo'
        ? focus.category ?? ''
        : focus.label

  const relatedEvents = useMemo(() => {
    if (!focus || !ctx) return []
    const keys = [focus.category, focus.metric, focus.label].filter(Boolean) as string[]
    return ctx.events.filter((e) => keys.some((k) => (e.summary ?? '').includes(k) || e.entity_name === k))
  }, [focus, ctx])

  const relatedDecisions = useMemo(() => {
    if (!focus || !ctx) return []
    const keys = [focus.category, focus.metric, focus.label].filter(Boolean) as string[]
    return ctx.decisions.filter((d) => keys.some((k) => (d.action_taken ?? '').includes(k) || (d.outcome_detail ?? '').includes(k)))
  }, [focus, ctx])

  if (!focus) {
    return (
      <div className="panel-body">
        <Empty>点击周报正文里的高亮词，这里会显示它的本周数值、历史趋势、以及本周与它有关的事件和决策。「品类+指标」连写时（如蔬菜客单价）会作为一个整体点击，直接给那一条数据。</Empty>
      </div>
    )
  }

  return (
    <div className="panel-body">
      <div className="ctx-head">
        <div>
          <div className="eyebrow">{KIND_LABEL[focus.kind]}上下文</div>
          <h3 className="ctx-title">{focus.label}</h3>
          {focus.entity?.description && focus.kind !== 'combo' && <p className="muted">{focus.entity.description}</p>}
        </div>
        <Badge tone={KIND_TONE[focus.kind]}>{KIND_LABEL[focus.kind]}</Badge>
      </div>

      {error && <ErrorBox message={error} />}
      {denied && <Empty>你当前身份的品类权限不覆盖这个对象，接口没有返回数据。</Empty>}
      {busy && <Loading label="载入历史数值" />}

      {!busy && !denied && (
        <section className="summary-card">
          <div className="summary-label">核心指标 · 本周（{weekLabel ?? '—'}）</div>
          {headline ? (
            <>
              <div className="ctx-hero">
                <div className="ctx-hero-value">
                  {headline.metric_value}
                  <em>{headline.metric_unit ?? ''}</em>
                </div>
                <div className="ctx-hero-label">
                  {focus.kind === 'combo' ? `${focus.category} ${focus.metric}`
                    : focus.kind === 'metric' ? `总体 ${focus.label}`
                      : metricLabel(headline.metric_name)}
                  {headline.wow_change_pct != null && (
                    <span className={headline.wow_change_pct >= 0 ? 'up' : 'down'}>
                      {' '}{headline.wow_change_pct > 0 ? '+' : ''}{headline.wow_change_pct.toFixed(1)}
                      {isPpMetric(headline.metric_name) ? 'pp' : '%'} 环比
                    </span>
                  )}
                  {headline.wow_change_pct == null && <span className="muted"> · 周报未给该口径环比</span>}
                </div>
              </div>
              {focus.kind === 'combo' && peers.length > 1 && (
                <div className="summary-note">
                  本周该指标在 {peers.length} 个品类中排第 {peerRank || '—'}
                </div>
              )}
            </>
          ) : (
            <div className="ctx-missing">
              <p>本周报里没有「{focus.label}」的正式数值。</p>
              <p className="muted">
                {latest
                  ? <>库里最近一次出现是在 <b>{latest}</b>。本周它只在正文被提到，没有进表格基线，或因未通过校验停在「待核事实」里 —— 系统不会为了让面板有数而把未核验的值当事实用。</>
                  : '整库都没有这个对象的数值，说明周报从未以表格形式报过它。'}
              </p>
            </div>
          )}
        </section>
      )}

      {!busy && chartPoints.length >= 2 && chartMetric && (
        <section className="chart-section">
          <div className="chart-title">
            指标趋势{chartUnit ? `（${chartUnit}）` : ''}
            <span className="chart-scope">{chartScope}</span>
          </div>
          {(focus.kind === 'category' || focus.kind === 'merchant') && metricNames.length > 1 && (
            <div className="metric-selector">
              {metricNames.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`metric-chip${m === chartMetric ? ' is-active' : ''}`}
                  style={m === chartMetric ? { borderColor: metricColor(m) } : undefined}
                  onClick={() => setSelectedMetric(m)}
                >
                  <span className="metric-chip-dot" style={{ background: metricColor(m) }} />
                  {metricLabel(m)}
                </button>
              ))}
            </div>
          )}
          <TrendChart
            points={chartPoints}
            breaks={chartBreaks}
            metric={chartMetric}
            unit={chartUnit}
            scopeLabel={chartScope}
            overlay={chartOverlay}
            footer={weekFacts.length > 1 && focus.kind !== 'combo' ? (
              <label className="chart-check">
                <input
                  type="checkbox"
                  checked={showDetail}
                  onChange={(e) => setShowDetail(e.target.checked)}
                />
                核对明细
              </label>
            ) : undefined}
          />
          {series && series.comparability === 'not_comparable' && (
            <div className="ctx-comparability">
              该序列跨了 {series.segments.length} 个口径定义（
              {series.segments.map((s) => `${s.from}–${s.to} ${s.definition_id}`).join('；')}
              ），图上已断开，不画成一条连续趋势。
            </div>
          )}
        </section>
      )}

      {!busy && compareRows.length >= 2 && chartMetric && (
        <section className="chart-section">
          <div className="chart-title">
            横向对比{chartUnit ? `（${chartUnit}）` : ''}
            <span className="chart-scope">
              {chartMetric} · {compareRows.length} 个对象
            </span>
          </div>
          <CompareChart
            rows={compareRows}
            metric={chartMetric}
            unit={chartUnit}
            highlight={focus?.kind === 'combo' ? focus.category ?? null : focus?.label ?? null}
          />
        </section>
      )}

      {!busy && structureSteps.length >= 3 && (
        <section className="chart-section">
          <StructureChart steps={structureSteps} unit="万元" title="损益穿透（周均日）" />
        </section>
      )}

      {!busy && weekFacts.length > 1 && focus.kind !== 'combo' && showDetail && (
        <section className="chart-detail">
          <div className="eyebrow">
            {focus.kind === 'metric' ? '本周该指标的全部数值' : '本周该对象的全部数值'} · {weekFacts.length} 条
          </div>
          <table className="mini-table">
            <thead>
              <tr>
                {showOwnerCol && <th>口径对象</th>}
                <th>指标</th>
                <th className="ta-r">数值</th>
                <th className="ta-r">环比</th>
                <th>统计口径</th>
              </tr>
            </thead>
            <tbody>
              {weekFacts.map((f) => (
                <tr key={f.id}>
                  {showOwnerCol && (
                    <td>{f.merchant_type ? `商户 · ${f.merchant_type}` : f.category}</td>
                  )}
                  <td>{f.metric_name}</td>
                  <td className="ta-r mono num">{f.metric_value}{f.metric_unit ?? ''}</td>
                  <td className={`ta-r mono ${f.wow_change_pct == null ? 'muted' : f.wow_change_pct >= 0 ? 'up' : 'down'}`}>
                    {f.wow_change_pct == null ? '—' : `${f.wow_change_pct > 0 ? '+' : ''}${f.wow_change_pct.toFixed(1)}%`}
                  </td>
                  <td className="muted">{aggLabel(f.aggregation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="ctx-section">
        <div className="eyebrow">本周相关事件 · {relatedEvents.length}</div>
        {relatedEvents.length === 0
          ? <Empty>本周没有与它相关的事件记录</Empty>
          : relatedEvents.map((e) => {
            const summary = stripMd(e.summary)
            const quote = e.source_quote ? stripMd(e.source_quote) : ''
            // summary 与 source_quote 都来自同一句话：summary 是截断版（180 字），
            // source_quote 是完整版。当句子短于 180 字时两者完全相同，
            // 只显示一个——避免同一段文字出现两行的无意义重复。
            const showQuote = quote && quote !== summary
            return (
              <div className="ctx-event" key={e.event_id}>
                <div className="ctx-event-head">
                  <Badge tone={e.event_type === 'RISK' ? 'amber' : 'mint'}>{e.event_type}</Badge>
                  <span className="mono muted">{e.occurred_at}</span>
                </div>
                <p>{summary}</p>
                {showQuote && <blockquote>{quote}</blockquote>}
              </div>
            )
          })}
      </section>

      <section className="ctx-section">
        <div className="eyebrow">本周相关决策 · {relatedDecisions.length}</div>
        {relatedDecisions.length === 0
          ? <Empty>本周没有与它相关的决策记录</Empty>
          : relatedDecisions.map((d) => (
            <div className="ctx-decision" key={d.decision_id}>
              <p>{stripMd(d.action_taken)}</p>
              <div className="muted">
                {d.owner ?? '未指派'} · 结果 {d.outcome ?? 'PENDING'}
                {d.effective_from ? ` · 自 ${d.effective_from}` : ''}
              </div>
            </div>
          ))}
      </section>
    </div>
  )
}
