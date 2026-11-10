import { useMemo, useState } from 'react'
import type { DocContext, DocumentDetail, Fact, Focus } from '../../types'
import { methodLabel, stripMd } from '../../lib/labels'
import { Badge, Empty, Loading } from '../../ui'

interface Props {
  ctx: DocContext | null
  detail: DocumentDetail | null
  loading: boolean
  onFocusClick: (focus: Focus) => void
}

function fmt(value: number, unit: string | null): string {
  const digits = Math.abs(value) >= 100 ? 0 : 1
  return `${value.toFixed(digits)}${unit ?? ''}`
}

export default function EvidencePanel({ ctx, detail, loading, onFocusClick }: Props) {
  const [category, setCategory] = useState<string>('全部')
  const [showQuotes, setShowQuotes] = useState(false)

  const facts: Fact[] = ctx?.facts ?? []
  const categories = useMemo(
    () => ['全部', ...Array.from(new Set(facts.map((f) => f.category))).sort()],
    [facts],
  )
  const grouped = useMemo(() => {
    const rows = category === '全部' ? facts : facts.filter((f) => f.category === category)
    const map = new Map<string, Fact[]>()
    rows.forEach((f) => {
      const key = f.category
      map.set(key, [...(map.get(key) ?? []), f])
    })
    return [...map.entries()].sort((a, b) => (a[0] === '总体' ? -1 : b[0] === '总体' ? 1 : a[0].localeCompare(b[0])))
  }, [facts, category])

  if (loading) return <div className="panel-body"><Loading label="载入本周数据" /></div>

  // 点击箭头跳转到周报原文对应位置：在文档中查找包含引文的元素并滚动高亮
  function jumpToQuote(quote: string) {
    if (!quote) return
    const snippet = quote.slice(0, 30).replace(/[.*+?^${}()|[\]\\\\]/g, '')
    const el = document.querySelector(`[data-quote^="${snippet}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('md-highlight-flash')
      setTimeout(() => el.classList.remove('md-highlight-flash'), 2000)
    }
  }

  return (
    <div className="panel-body">
      <div className="ev-head">
        <div className="chip-row">
          {categories.slice(0, 12).map((c) => (
            <button
              type="button"
              key={c}
              className={`chip ${c === category ? 'active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button type="button" className="link-btn" onClick={() => setShowQuotes((v) => !v)}>
          {showQuotes ? '收起原文' : '查看原文'}
        </button>
      </div>

      <div className="ev-summary mono">
        <span>{detail?.week_label ?? '—'}</span>
        <span>{facts.length} 条数值</span>
        <span>{grouped.length} 个口径组</span>
      </div>

      {facts.length === 0 && (
        <Empty>本周没有可见的入库数值。可能是权限未覆盖该品类，或周报表格未被识别。</Empty>
      )}

      {grouped.map(([cat, rows]) => (
        <section className="ev-group" key={cat}>
          <div className="ev-group-head">
            <button
              type="button"
              className="ev-cat"
              onClick={() => onFocusClick({
                matched: cat, label: cat, kind: 'category', category: cat,
              })}
              title="查看该品类上下文"
            >
              {cat}
            </button>
            <span className="mono muted">{rows.length} 条</span>
          </div>
          <table className="mini-table">
            <thead>
              <tr><th>指标</th><th className="ta-r">数值</th><th className="ta-r">环比</th><th>来源</th></tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.metric_name}
                    {f.merchant_type ? <span className="muted"> · {f.merchant_type}</span> : null}
                  </td>
                  <td className="ta-r mono num">{fmt(f.metric_value, f.metric_unit)}</td>
                  <td className={`ta-r mono ${f.wow_change_pct == null ? 'muted' : f.wow_change_pct >= 0 ? 'up' : 'down'}`}>
                    {f.wow_change_pct == null ? '—' : `${f.wow_change_pct > 0 ? '+' : ''}${f.wow_change_pct.toFixed(1)}%`}
                  </td>
                  <td>
                    <Badge tone={f.extraction_method.startsWith('table') ? 'mint' : f.extraction_method === 'llm' ? 'violet' : 'neutral'}>
                      {methodLabel(f.extraction_method)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {showQuotes && (
            <div className="ev-quotes">
              {rows.filter((f) => f.source_quote).slice(0, 6).map((f) => {
                const quote = stripMd(f.source_quote)
                return (
                  <blockquote key={f.id}>
                    <span className="mono muted">{f.metric_name}</span> {quote}
                    <button
                      type="button"
                      className="ev-quote-arrow"
                      title="跳转至周报原文对应位置"
                      onClick={() => jumpToQuote(quote)}
                      aria-label="跳转至周报原文"
                    >→</button>
                  </blockquote>
                )
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
