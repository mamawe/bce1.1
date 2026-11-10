import { useEffect, useMemo, useRef } from 'react'
import type { DocumentDetail, EntityRow, Focus } from '../types'
import { buildTermIndex, renderMarkdown } from '../lib/markdown'

interface Props {
  detail: DocumentDetail
  entities: EntityRow[]
  selected: Focus | null
  onFocusClick: (focus: Focus) => void
}

export default function ReportView({ detail, entities, selected, onFocusClick }: Props) {
  const articleRef = useRef<HTMLElement>(null)

  // 正文只在「换了周报 / 实体表变了」时重新解析。点高亮词只切换选中态，
  // 不再把整篇 Markdown 重新渲染一遍——否则每次点击都要多花几百毫秒。
  const blocks = useMemo(() => {
    return renderMarkdown(detail.content ?? '', {
      index: buildTermIndex(entities),
      selected: null,
      onFocusClick,
    })
  }, [detail.content, entities, onFocusClick])

  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    root.querySelectorAll('.entity-hit.is-active').forEach((el) => el.classList.remove('is-active'))
    if (!selected) return
    root.querySelectorAll('.entity-hit').forEach((el) => {
      if (el.textContent === selected.matched) el.classList.add('is-active')
    })
  }, [selected, blocks])

  const period = detail.period_start && detail.period_end
    ? `${detail.period_start} ~ ${detail.period_end}`
    : '周期未标注'

  return (
    <div className="doc-sheet">
      <div className="doc-meta">
        <div className="doc-meta-main">
          <span className="week-chip mono">{detail.week_label ?? detail.doc_id}</span>
          <span className="doc-period">{period}</span>
        </div>
        <div className="doc-meta-sub mono">
          <span>版本 v{detail.doc_version}</span>
          <span>周期来源 {detail.time_source ?? '未标注'}</span>
          {detail.source_url ? (
            <a href={detail.source_url} target="_blank" rel="noreferrer">原文</a>
          ) : null}
        </div>
      </div>

      {detail.hidden_sections.length > 0 && (
        <div className="scope-note">
          受品类权限限制，已隐藏 {detail.hidden_sections.length} 个章节：
          {detail.hidden_sections.join('、')}
        </div>
      )}

      <article className="doc-content" ref={articleRef}>{blocks}</article>
    </div>
  )
}
