import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MCK, formatNumber, sequentialColor, TOOLTIP_STYLE } from '../lib/chart-theme'

export interface StructureStep {
  name: string
  /** 金额类步骤：正向为收入项，负向为扣减项 */
  delta: number
  /** 累计到这一步的值，瀑布图的"落点" */
  cumulative: number
  kind: 'total' | 'subtract' | 'subtotal'
}

interface Props {
  steps: StructureStep[]
  unit: string
  title: string
}

const fmt = formatNumber

type Mode = 'waterfall' | 'stacked'

const MODES: Array<{ key: Mode; label: string; hint: string }> = [
  { key: 'waterfall', label: '瀑布', hint: '从 GMV 一层层扣到净利，看清每一层吃掉了多少' },
  { key: 'stacked', label: '堆叠', hint: '同一根柱子里按构成拆开，比水面下更省高度' },
]

/**
 * 结构图：损益穿透这类「总额 → 逐步扣减 → 小计」的链条。
 * 瀑布图把每一步的增减画成悬空的柱子，落点即累计值；
 * 堆叠图把同一维度拆成占比条，用来比品类之间谁的成本更重。
 */
export default function StructureChart({ steps, unit, title }: Props) {
  const [mode, setMode] = useState<Mode>('waterfall')

  // 瀑布图：每根柱子从 base 画到 base+delta，负向用珊瑚红、正向用蓝、小计用深灰
  const waterfall = useMemo(
    () => steps.map((s) => ({
      name: s.name,
      base: s.delta >= 0 ? s.cumulative - s.delta : s.cumulative,
      size: Math.abs(s.delta),
      delta: s.delta,
      kind: s.kind,
    })),
    [steps],
  )

  if (steps.length < 2) {
    return <div className="chart-empty">没有可拆解的结构数据。</div>
  }

  return (
    <div className="structure-chart">
      <div className="chart-title sm">{title}</div>
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

      {mode === 'waterfall' && (
        <ResponsiveContainer width="100%" height={Math.max(190, 150)}>
          <BarChart data={waterfall} margin={{ top: 14, right: 8, bottom: 2, left: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: MCK.inkSoft }}
              tickLine={false}
              axisLine={{ stroke: MCK.axis }}
              interval={0}
              height={38}
              angle={-28}
              textAnchor="end"
            />
            <YAxis
              tick={{ fontSize: 9, fill: MCK.inkFaint }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              cursor={{ fill: MCK.bgAlt }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(_v, _n, item) => {
                const row = item?.payload as { delta: number; kind: string } | undefined
                const sign = (row?.delta ?? 0) >= 0 ? '+' : ''
                return [`${sign}${fmt(row?.delta ?? 0)}${unit}`, row?.kind === 'subtotal' ? '小计' : '本层']
              }}
            />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="size" stackId="w" radius={[2, 2, 0, 0]} maxBarSize={30} animationDuration={260}>
              {waterfall.map((row) => (
                <Cell
                  key={row.name}
                  fill={
                    row.kind === 'total' || row.kind === 'subtotal'
                      ? MCK.gray
                      : row.delta >= 0 ? MCK.positive : MCK.negative
                  }
                />
              ))}
              <LabelList
                dataKey="delta"
                position="top"
                formatter={(v) => `${Number(v) >= 0 ? '+' : ''}${fmt(Number(v))}`}
                style={{ fontSize: 9, fill: MCK.inkSoft }}
              />
            </Bar>
            <ReferenceLine y={0} stroke={MCK.axis} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {mode === 'stacked' && (
        <ResponsiveContainer width="100%" height={190}>
          <BarChart
            data={[{ name: title, ...Object.fromEntries(steps.map((s, i) => [`s${i}`, Math.abs(s.delta)])) }]}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
          >
            <XAxis type="number" tick={{ fontSize: 9, fill: MCK.inkFaint }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10, fill: MCK.inkSoft }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: MCK.bgAlt }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [`${fmt(Number(v))}${unit}`, String(name)]}
            />
            {steps.map((s, i) => (
              <Bar
                key={s.name}
                dataKey={`s${i}`}
                name={s.name}
                stackId="a"
                fill={sequentialColor(0.25 + (i / Math.max(steps.length - 1, 1)) * 0.7)}
                maxBarSize={34}
                animationDuration={260}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="chart-foot">
        <span className="chart-note">
          深色为总额与小计，绿色为增项、红色为扣减；同一份数据换个画法，结论不该变。
        </span>
      </div>
    </div>
  )
}
