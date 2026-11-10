import { useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '../../api'
import type { DashboardData } from '../../types'
import { Badge, Empty, ErrorBox, Loading } from '../../ui'
import { BAIN, formatNumber, TOOLTIP_STYLE } from '../../lib/chart-theme'
import { isPpMetric, metricColor, metricLabel } from '../../lib/metric-theme'
import { stripMd } from '../../lib/labels'
import {
  Area, Bar, CartesianGrid, ComposedChart, Line, Pie, PieChart, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, BarChart, LabelList,
} from 'recharts'

/** KPI 卡：核心指标 + 环比 */
function KpiCard({ kpi, onClick }: { kpi: DashboardData['kpi'][number]; onClick?: (m: string) => void }) {
  const wow = kpi.wow
  const wowText = wow != null ? `${wow > 0 ? '+' : ''}${wow.toFixed(1)}${isPpMetric(kpi.metric) ? 'pp' : '%'}` : '—'
  const wowClass = wow == null ? 'muted' : wow >= 0 ? 'up' : 'down'
  const color = metricColor(kpi.metric)

  return (
    <div
      className="dash-kpi-card"
      style={{ borderLeftColor: color }}
      onClick={() => onClick?.(kpi.metric)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="dash-kpi-label">{metricLabel(kpi.metric)}</div>
      <div className="dash-kpi-value mono">
        {formatNumber(kpi.value)}
        <span className="dash-kpi-unit">{kpi.unit ?? ''}</span>
      </div>
      <div className={`dash-kpi-wow ${wowClass}`}>
        {wowText} 环比
      </div>
    </div>
  )
}

/** 品类矩阵：横向条形 + 占比饼图 */
function CategoryMatrix({ rows, totalGmv, onCategoryClick }: {
  rows: DashboardData['matrix']
  totalGmv: number
  onCategoryClick?: (cat: string) => void
}) {
  const [view, setView] = useState<'bar' | 'pie'>('bar')

  if (!rows.length) return null

  const sorted = [...rows].sort((a, b) => b.gmv - a.gmv)

  return (
    <div className="dash-matrix">
      <div className="dash-section-head">
        <h3>品类分布</h3>
        <div className="chart-kind-row" style={{ width: 'auto' }}>
          <button className={`chart-kind${view === 'bar' ? ' is-active' : ''}`} onClick={() => setView('bar')}>排名</button>
          <button className={`chart-kind${view === 'pie' ? ' is-active' : ''}`} onClick={() => setView('pie')}>占比</button>
        </div>
      </div>

      {view === 'bar' && (
        <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 28 + 20)}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 50, bottom: 0, left: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="category"
              width={62}
              tick={{ fontSize: 11, fill: BAIN.inkSoft }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: BAIN.bgAlt }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: unknown) => [`${formatNumber(Number(v))}万元`, 'GMV'] as [string, string]}
            />
            <Bar dataKey="gmv" radius={[0, 3, 3, 0]} maxBarSize={18} animationDuration={280}
              onClick={(d: unknown) => { if (d && typeof d === 'object' && 'category' in d) { const cat = (d as { category: string }).category; onCategoryClick?.(cat) } }}
            >
              {sorted.map((row) => (
                <Cell key={row.category} fill={BAIN.red} fillOpacity={0.5 + 0.5 * (row.gmv / (sorted[0]?.gmv || 1))} />
              ))}
              <LabelList
                dataKey="gmv"
                position="right"
                formatter={(v: unknown) => `${formatNumber(Number(v))}`}
                style={{ fontSize: 10, fill: BAIN.inkSoft }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === 'pie' && (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={sorted}
              dataKey="gmv"
              nameKey="category"
              innerRadius={50}
              outerRadius={82}
              paddingAngle={1}
              animationDuration={280}
              onClick={(d: unknown) => { if (d && typeof d === 'object' && 'category' in d) { const cat = (d as { category: string }).category; onCategoryClick?.(cat) } }}
            >
              {sorted.map((_, i) => (
                <Cell key={i} fill={i === 0 ? BAIN.red : i === 1 ? BAIN.navy : i === 2 ? BAIN.deepRed : BAIN.teal} />
              ))}
            </Pie>
            <Legend
              verticalAlign="bottom"
              iconSize={8}
              wrapperStyle={{ fontSize: 10 }}
              formatter={(name: string) => {
                const row = sorted.find((r) => r.category === name)
                return `${name} ${row?.share ?? 0}%`
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: unknown, name: unknown) => [
                `${formatNumber(Number(v))}万元 · 占 ${totalGmv ? ((Number(v) / totalGmv) * 100).toFixed(1) : '—'}%`,
                String(name),
              ] as [string, string]}
            />
          </PieChart>
        </ResponsiveContainer>
      )}

      <div className="chart-foot">
        <span className="chart-note">
          合计 {formatNumber(totalGmv)} 万元 · {sorted.length} 个品类
        </span>
      </div>
    </div>
  )
}

/** 趋势图：总体 GMV 近 N 周 */
function TrendSection({ points }: { points: DashboardData['trends'] }) {
  const [kind, setKind] = useState<'line' | 'area' | 'bar' | 'combo'>('line')
  const data = useMemo(() => points.map((p) => ({
    label: p.week_label.replace(/^\d{4}-W/, 'W'),
    week: p.week_label,
    value: p.value,
    wow: p.wow,
  })), [points])

  if (data.length < 2) {
    return (
      <div className="dash-trend">
        <div className="dash-section-head"><h3>GMV 趋势</h3></div>
        <div className="chart-empty">至少需要 2 周数据才能画出趋势。</div>
      </div>
    )
  }

  return (
    <div className="dash-trend">
      <div className="dash-section-head">
        <h3>总体 GMV 趋势（{data.length} 周）</h3>
        <div className="chart-kind-row" style={{ width: 'auto' }}>
          {(['line', 'area', 'bar', 'combo'] as const).map((k) => (
            <button key={k} className={`chart-kind${kind === k ? ' is-active' : ''}`} onClick={() => setKind(k)}>
              {k === 'line' ? '折线' : k === 'area' ? '面积' : k === 'bar' ? '柱状' : '组合'}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 2, left: -6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BAIN.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: BAIN.inkFaint }} tickLine={false} axisLine={{ stroke: BAIN.axis }} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={{ fontSize: 10, fill: BAIN.inkFaint }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            cursor={{ stroke: BAIN.axis, strokeDasharray: '3 3' }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: unknown, _name: unknown, item: { payload?: { wow?: number | null } }) => {
              const wow = item?.payload?.wow
              return [`${formatNumber(Number(v))} 万元${wow != null ? ` · 环比 ${wow > 0 ? '+' : ''}${wow}%` : ''}`, 'GMV'] as [string, string]
            }}
          />
          {kind === 'bar' && <Bar dataKey="value" name="GMV" fill={BAIN.red} radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={280} />}
          {kind === 'area' && <Area type="monotone" dataKey="value" name="GMV" stroke={BAIN.red} strokeWidth={2} fill={BAIN.red} fillOpacity={0.16} dot={{ r: 3, strokeWidth: 0, fill: BAIN.red }} activeDot={{ r: 5 }} connectNulls={false} animationDuration={280} />}
          {kind === 'line' && <Line type="monotone" dataKey="value" name="GMV" stroke={BAIN.red} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: BAIN.red }} activeDot={{ r: 5 }} connectNulls={false} animationDuration={280} />}
          {kind === 'combo' && (
            <>
              <Bar dataKey="value" name="GMV" fill={BAIN.red} radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={280} />
              <Line type="monotone" dataKey="wow" name="环比" stroke={BAIN.navy} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, strokeWidth: 0, fill: BAIN.navy }} connectNulls yAxisId="wow" />
              <YAxis yAxisId="wow" orientation="right" tick={{ fontSize: 9, fill: BAIN.inkFaint }} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 事件与决策摘要 */
function EventsDecisions({ events, decisions }: { events: DashboardData['events']; decisions: DashboardData['decisions'] }) {
  return (
    <div className="dash-events-decisions">
      <div className="dash-ed-col">
        <div className="dash-section-head"><h3>本周事件 · {events.length}</h3></div>
        {events.length === 0
          ? <Empty>本周无可见事件</Empty>
          : <div className="dash-event-list">
              {events.slice(0, 8).map((e) => (
                <div className="dash-event-item" key={e.event_id}>
                  <Badge tone={e.event_type === 'RISK' ? 'amber' : 'mint'}>{e.event_type}</Badge>
                  <span className="dash-event-text">{stripMd(e.summary).slice(0, 80)}</span>
                </div>
              ))}
            </div>
        }
      </div>
      <div className="dash-ed-col">
        <div className="dash-section-head"><h3>本周决策 · {decisions.length}</h3></div>
        {decisions.length === 0
          ? <Empty>本周无可见决策</Empty>
          : <div className="dash-event-list">
              {decisions.slice(0, 8).map((d) => (
                <div className="dash-event-item" key={d.decision_id}>
                  <Badge tone="violet">{d.outcome ?? 'PENDING'}</Badge>
                  <span className="dash-event-text">{stripMd(d.action_taken).slice(0, 80)}</span>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  )
}

interface Props {
  onSelectMetric?: (metric: string) => void
  onSelectCategory?: (category: string) => void
}

export default function DashboardPanel({ onSelectMetric, onSelectCategory }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.dashboard()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Loading label="载入可视化看板" />
  if (error) return <ErrorBox message={error} />
  if (!data || data.empty) return <Empty>暂无周报数据。请先导入周报后再查看可视化看板。</Empty>

  return (
    <div className="dash-container">
      {/* 看板头部 */}
      <div className="dash-header">
        <div>
          <div className="eyebrow">可视化周报看板</div>
          <h2 className="dash-title">{data.doc_title || '周报看板'}</h2>
        </div>
        <div className="dash-header-meta mono">
          <span className="week-chip">{data.week_label ?? '—'}</span>
          {data.period_start && data.period_end && (
            <span className="muted">{data.period_start} ~ {data.period_end}</span>
          )}
        </div>
      </div>

      {/* KPI 卡片组 */}
      <div className="dash-kpi-row">
        {data.kpi.map((k) => (
          <KpiCard key={k.metric} kpi={k} onClick={onSelectMetric} />
        ))}
      </div>

      {/* 品类矩阵 + 趋势 */}
      <div className="dash-two-col">
        <CategoryMatrix rows={data.matrix} totalGmv={data.total_gmv} onCategoryClick={onSelectCategory} />
        <TrendSection points={data.trends} />
      </div>

      {/* 品类明细表 */}
      <div className="dash-matrix-table">
        <div className="dash-section-head"><h3>品类明细</h3></div>
        <div className="qa-table-wrap">
          <table className="mini-table qa-table">
            <thead>
              <tr>
                <th>品类</th>
                <th className="ta-r">GMV</th>
                <th className="ta-r">占比</th>
                <th className="ta-r">环比</th>
              </tr>
            </thead>
            <tbody>
              {data.matrix.map((r) => (
                <tr key={r.category} onClick={() => onSelectCategory?.(r.category)} style={{ cursor: onSelectCategory ? 'pointer' : 'default' }}>
                  <td>{r.category}</td>
                  <td className="ta-r mono num">{formatNumber(r.gmv)}{r.unit ?? ''}</td>
                  <td className="ta-r mono">{r.share}%</td>
                  <td className={`ta-r mono ${r.wow == null ? 'muted' : r.wow >= 0 ? 'up' : 'down'}`}>
                    {r.wow == null ? '—' : `${r.wow > 0 ? '+' : ''}${r.wow.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 事件与决策 */}
      <EventsDecisions events={data.events} decisions={data.decisions} />

      <div className="dash-footer">
        <span className="muted">数据来源：已核验事实表 · 按当前身份权限过滤</span>
        <button className="btn small" onClick={load}>刷新</button>
      </div>
    </div>
  )
}
