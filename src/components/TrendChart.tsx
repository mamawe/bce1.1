import { useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AXIS_TICK, BAIN, CHART_HEIGHT, CHART_MARGIN, MCK, formatNumber,
} from '../lib/chart-theme'
import { isPpMetric, metricColor, metricLabel } from '../lib/metric-theme'

export interface TrendPoint {
  week: string
  value: number
  wow: number | null
  /** 该周有口径断点：断点两侧不能连成一条线 */
  break?: boolean
}

interface Props {
  points: TrendPoint[]
  breaks: string[]
  metric: string
  unit: string
  scopeLabel: string
  footer?: ReactNode
  /** 组合图里叠加的对比序列（如环比走势、同期值） */
  overlay?: { key: string; label: string; unit?: string; values: Record<string, number | null> } | null
}

interface TooltipItem {
  value?: number | string | null
  dataKey?: string
  name?: string
  payload?: Record<string, unknown>
}

interface TooltipProps {
  active?: boolean
  payload?: TooltipItem[]
  unit: string
  metric: string
  overlayLabel?: string
  overlayUnit?: string
}

const fmt = formatNumber

function shortWeek(week: string): string {
  const m = week.match(/^\d{4}-W(\d{1,2})$/)
  return m ? `W${m[1]}` : week
}

function yDomain(values: number[], fromZero: boolean): [number, number] {
  if (fromZero) {
    const max = Math.max(...values.map((v) => (v < 0 ? 0 : v)))
    const min = Math.min(...values, 0)
    if (min < 0) {
      const span = Math.max(max - min, 1e-6)
      return [Number((min - span * 0.1).toFixed(2)), Number((max + span * 0.1).toFixed(2))]
    }
    return [0, Number((max * 1.15).toFixed(2))]
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, Math.abs(max) * 0.02, 1e-6)
  const pad = span * 0.15
  const lo = min >= 0 ? Math.max(0, min - pad) : min - pad
  return [Number(lo.toFixed(2)), Number((max + pad).toFixed(2))]
}

/** 率类指标环比说 pp，量类说 %，后缀错了会被读成两种意思 */
function wowText(wow: number | null | undefined, metric: string): string | null {
  if (wow == null) return null
  const suffix = isPpMetric(metric) ? 'pp' : '%'
  return `${wow > 0 ? '+' : ''}${wow}${suffix}`
}

function ChartTooltip({ active, payload, unit, metric, overlayLabel, overlayUnit }: TooltipProps) {
  if (!active || !payload?.length) return null
  const week = (payload[0]?.payload?.week as string) ?? ''
  const real = payload.filter((p) => typeof p.value === 'number')
  if (!real.length) return null
  return (
    <div className="trend-tooltip">
      <div className="trend-tooltip-week">{week}</div>
      {real.map((item, i) => {
        const isOverlay = item.dataKey === 'overlay'
        return (
          <div className="trend-tooltip-row" key={`${item.dataKey}-${i}`}>
            <span
              className="trend-tooltip-dot"
              style={{ background: isOverlay ? BAIN.silverGray : metricColor(metric) }}
            />
            <span className="trend-tooltip-name">
              {isOverlay ? overlayLabel : metricLabel(metric)}
            </span>
            <b>
              {fmt(item.value as number)}
              {isOverlay ? overlayUnit ?? '' : unit}
            </b>
            {!isOverlay && (
              <span className="trend-tooltip-wow">
                {wowText(payload[0]?.payload?.wow as number | null, metric) ?? '无环比'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

type ChartKind = 'line' | 'area' | 'bar' | 'combo'

/** auto：按数据自适应（默认，能看清波动）；zero：强制含 0 */
type ZeroMode = 'auto' | 'zero'

const ZERO_OPTIONS: Array<{ key: ZeroMode; label: string; hint: string }> = [
  { key: 'auto', label: '自适应', hint: '纵轴从数据最小值起，能看清波动（默认）' },
  { key: 'zero', label: '从 0 开始', hint: '纵轴含 0，看绝对量级；波动会被压平' },
]


const KIND_OPTIONS: Array<{ key: ChartKind; label: string; hint: string }> = [
  { key: 'line', label: '折线', hint: '看连续趋势，最省墨水' },
  { key: 'area', label: '面积', hint: '趋势 + 量级，适合单一指标' },
  { key: 'bar', label: '柱状', hint: '逐周对比，周数少时更清楚' },
  { key: 'combo', label: '组合', hint: '柱子看绝对值、折线看环比，同一张图两个问题' },
]

/**
 * 指标趋势图。默认折线，可切换面积/柱状/组合。
 * 口径断点把序列切成多段：断点两侧的口径不同，不能连成一条线——这一点在所有图型里都成立。
 */
export default function TrendChart({
  points, breaks, metric, unit, scopeLabel, footer, overlay,
}: Props) {
  // 「从 0 开始」不再是「能不能点」，而是「当前用哪一档」：
  // 之前按钮只在纵轴非零时渲染，点一下轴从 0 起，按钮自己就没了，退不回去。
  // 现在三档循环，任何时候都在，且说明当前是哪一档。
  const [zeroMode, setZeroMode] = useState<ZeroMode>('auto')
  const [kind, setKind] = useState<ChartKind>('line')

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.week.localeCompare(b.week)),
    [points],
  )
  const visibleBreaks = useMemo(
    () => breaks.filter((b) => sorted.some((p) => p.week === b)),
    [breaks, sorted],
  )

  const data = useMemo(() => {
    const segOf = (week: string) => visibleBreaks.filter((b) => b <= week).length
    return sorted.map((p) => {
      const row: Record<string, string | number | null> = {
        week: p.week,
        label: shortWeek(p.week),
        wow: p.wow,
        overlay: overlay?.values[p.week] ?? null,
      }
      row[`seg${segOf(p.week)}`] = p.value
      return row
    })
  }, [sorted, visibleBreaks, overlay])

  const values = useMemo(() => sorted.map((p) => p.value), [sorted])
  const domain = useMemo(
    () => yDomain(values, zeroMode === 'zero'),
    [values, zeroMode],
  )
  const color = metricColor(metric)
  const segCount = visibleBreaks.length + 1
  const trimmed = domain[0] > 0
  const note = visibleBreaks.length
    ? `口径在 ${visibleBreaks.map(shortWeek).join('、')} 变更，图形在此断开。`
    : zeroMode === 'zero' || !trimmed
      ? '纵轴含 0。'
      : `纵轴起点 ${fmt(domain[0])}${unit}（非零，已放大波动；可切「从 0 开始」看量级）。`

  if (sorted.length < 2) {
    return (
      <div className="chart-empty">
        该对象暂无可绘制的连续趋势（至少需要 2 周数据）。
      </div>
    )
  }

  const axisY = (
    <YAxis
      domain={domain}
      allowDataOverflow
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={false}
      width={52}
      tickFormatter={(v: number) => `${fmt(v)}${isPpMetric(metric) ? 'pp' : ''}`}
    />
  )
  const axisX = (
    <XAxis
      dataKey="label"
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={{ stroke: MCK.axis }}
      interval="preserveStartEnd"
      minTickGap={22}
    />
  )
  const grid = <CartesianGrid strokeDasharray="3 3" stroke={MCK.grid} vertical={false} />
  const tooltip = (
    <Tooltip
      cursor={{ stroke: MCK.axis, strokeDasharray: '3 3' }}
      content={
        <ChartTooltip
          unit={unit}
          metric={metric}
          overlayLabel={overlay?.label}
          overlayUnit={overlay?.unit}
        />
      }
    />
  )

  const segments = Array.from({ length: segCount }, (_, i) => i)

  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={`${scopeLabel} ${metricLabel(metric)}近${sorted.length}周趋势，单位${unit || '无'}，${note}`}
    >
      <div className="chart-kind-row">
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            title={option.hint}
            className={`chart-kind${kind === option.key ? ' is-active' : ''}`}
            onClick={() => setKind(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={CHART_MARGIN}>
          {grid}
          {axisX}
          {axisY}
          {tooltip}
          {kind === 'combo' && overlay && <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />}
          {visibleBreaks.map((b) => (
            <ReferenceLine key={b} x={shortWeek(b)} stroke={MCK.gray} strokeDasharray="3 3" />
          ))}
          {kind === 'bar' && segments.map((i) => (
            <Bar
              key={`bar-${i}`}
              dataKey={`seg${i}`}
              name={metricLabel(metric)}
              fill={color}
              radius={[3, 3, 0, 0]}
              maxBarSize={26}
              animationDuration={280}
            />
          ))}
          {kind === 'area' && segments.map((i) => (
            <Area
              key={`area-${i}`}
              type="monotone"
              dataKey={`seg${i}`}
              name={metricLabel(metric)}
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.16}
              dot={{ r: 3, strokeWidth: 0, fill: color }}
              activeDot={{ r: 5, fill: color }}
              connectNulls={false}
              animationDuration={280}
            />
          ))}
          {kind === 'line' && segments.map((i) => (
            <Line
              key={`seg-${i}`}
              type="monotone"
              dataKey={`seg${i}`}
              name={metricLabel(metric)}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: color }}
              activeDot={{ r: 5, fill: color }}
              connectNulls={false}
              animationDuration={280}
            />
          ))}
          {kind === 'combo' && (
            <>
              {segments.map((i) => (
                <Bar
                  key={`cbar-${i}`}
                  dataKey={`seg${i}`}
                  name={metricLabel(metric)}
                  fill={color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  animationDuration={280}
                />
              ))}
              <Line
                type="monotone"
                dataKey="overlay"
                name={overlay?.label ?? '对比序列'}
                stroke={BAIN.silverGray}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 3, strokeWidth: 0, fill: BAIN.silverGray }}
                connectNulls
                yAxisId="overlay"
              />
              <YAxis
                yAxisId="overlay"
                orientation="right"
                tick={{ fontSize: 9, fill: MCK.inkFaint }}
                tickLine={false}
                axisLine={false}
                width={34}
                tickFormatter={(v: number) => `${fmt(v)}${overlay?.unit ?? ''}`}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-foot">
        <span className="chart-note">{note}</span>
        <div className="chart-zero-seg" role="group" aria-label="纵轴刻度">
          {ZERO_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              title={option.hint}
              className={`chart-zero-toggle${zeroMode === option.key ? ' is-active' : ''}`}
              onClick={() => setZeroMode(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {footer}
      </div>
    </div>
  )
}
