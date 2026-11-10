import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  MCK, divergingColor, formatNumber, sequentialColor, seriesColor, TOOLTIP_STYLE,
} from '../lib/chart-theme'
import { metricLabel } from '../lib/metric-theme'

export interface CompareRow {
  name: string
  value: number
}

interface Props {
  rows: CompareRow[]
  metric: string
  unit: string
  /** 当前聚焦对象，在图上高亮，便于"我在这堆里的哪个位置" */
  highlight?: string | null
  /** 占比饼图用的整体值（可选），用于「占总体多少」 */
  total?: number | null
  footer?: string
}

const fmt = formatNumber

type Mode = 'rank' | 'share' | 'diverging'

const MODES: Array<{ key: Mode; label: string; hint: string }> = [
  { key: 'rank', label: '排名', hint: '横向条形，长条排序看谁大谁小' },
  { key: 'share', label: '占比', hint: '环形图，看各部分对整体的贡献' },
  { key: 'diverging', label: '偏离', hint: '以中位数为基准的发散条，看谁在基准之上/之下' },
]

/**
 * 横向对比图：同一指标在不同品类/商户之间的分布。
 * 三种形态各答一个问题——谁最大（排名）、谁占多少（占比）、谁偏离常态（发散）。
 */
export default function CompareChart({ rows, metric, unit, highlight, total, footer }: Props) {
  const [mode, setMode] = useState<Mode>('rank')

  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows])
  const sum = useMemo(() => sorted.reduce((n, r) => n + r.value, 0), [sorted])
  const median = useMemo(() => {
    if (!sorted.length) return 0
    const mid = Math.floor(sorted.length / 2)
    const asc = [...sorted].sort((a, b) => a.value - b.value)
    return sorted.length % 2 ? asc[mid].value : (asc[mid - 1].value + asc[mid].value) / 2
  }, [sorted])

  if (sorted.length < 2) {
    return <div className="chart-empty">同口径下只有一个对象有数，画不出对比。</div>
  }

  const diverging = sorted.map((r) => ({ ...r, delta: r.value - median }))
  const maxAbs = Math.max(...diverging.map((d) => Math.abs(d.delta)), 1e-6)

  return (
    <div className="compare-chart">
      <div className="chart-kind-row">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            title={m.hint}
            className={`chart-kind${mode === m.key ? ' is-active' : ''}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'rank' && (
        <ResponsiveContainer width="100%" height={Math.max(150, sorted.length * 24 + 30)}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 46, bottom: 0, left: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={62}
              tick={{ fontSize: 10, fill: MCK.inkSoft }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: MCK.bgAlt }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [`${fmt(Number(v))}${unit}`, metricLabel(metric)] as [string, string]}
            />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={16} animationDuration={260}>
              {sorted.map((row) => (
                <Cell
                  key={row.name}
                  fill={row.name === highlight ? seriesColor(1) : sequentialColor(0.45 + 0.55 * (row.value / (sorted[0].value || 1)))}
                />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v) => `${fmt(Number(v))}${unit}`}
                style={{ fontSize: 10, fill: MCK.inkSoft }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {mode === 'share' && (
        <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie
              data={sorted}
              dataKey="value"
              nameKey="name"
              innerRadius={46}
              outerRadius={78}
              paddingAngle={1}
              animationDuration={260}
            >
              {sorted.map((row, i) => (
                <Cell key={row.name} fill={row.name === highlight ? seriesColor(1) : seriesColor(i)} />
              ))}
            </Pie>
            <Legend
              verticalAlign="bottom"
              iconSize={8}
              wrapperStyle={{ fontSize: 10 }}
              formatter={(name: string) => {
                const row = sorted.find((r) => r.name === name)
                const pct = row && sum ? ((row.value / sum) * 100).toFixed(1) : '—'
                return `${name} ${pct}%`
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [
                `${fmt(Number(v))}${unit} · 占 ${sum ? ((Number(v) / sum) * 100).toFixed(1) : '—'}%`,
                String(name),
              ] as [string, string]}
            />
          </PieChart>
        </ResponsiveContainer>
      )}

      {mode === 'diverging' && (
        <ResponsiveContainer width="100%" height={Math.max(150, diverging.length * 24 + 30)}>
          <BarChart data={diverging} layout="vertical" margin={{ top: 4, right: 46, bottom: 0, left: 4 }}>
            <XAxis type="number" hide domain={[-maxAbs * 1.1, maxAbs * 1.1]} />
            <YAxis
              type="category"
              dataKey="name"
              width={62}
              tick={{ fontSize: 10, fill: MCK.inkSoft }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: MCK.bgAlt }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [
                `${Number(v) > 0 ? '+' : ''}${fmt(Number(v))}${unit}（中位数 ${fmt(median)}${unit}）`,
                '相对中位数',
              ] as [string, string]}
            />
            <Bar dataKey="delta" radius={3} maxBarSize={16} animationDuration={260}>
              {diverging.map((row) => (
                <Cell
                  key={row.name}
                  fill={row.name === highlight ? seriesColor(1) : divergingColor(0.5 + (row.delta / (maxAbs * 2)) * 0.5)}
                />
              ))}
              <LabelList
                dataKey="delta"
                position="right"
                formatter={(v) => `${Number(v) > 0 ? '+' : ''}${fmt(Number(v))}`}
                style={{ fontSize: 10, fill: MCK.inkSoft }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="chart-foot">
        <span className="chart-note">
          {mode === 'diverging'
            ? `以中位数 ${fmt(median)}${unit} 为基准，向绿色为高于基准、向红色为低于基准。`
            : `共 ${sorted.length} 个对象；${total ? `合计 ${fmt(total)}${unit}。` : `最大值 ${sorted[0].name} ${fmt(sorted[0].value)}${unit}。`}`}
        </span>
        {footer && <span className="chart-note">{footer}</span>}
      </div>
    </div>
  )
}
