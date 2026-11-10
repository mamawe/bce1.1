import { useMemo } from 'react'
import type { DocumentDetail, EntityRow, Focus } from '../types'
import { buildTermIndex, renderMarkdown } from '../lib/markdown'

interface Props {
  detail: DocumentDetail
  entities: EntityRow[]
  selected: Focus | null
  onFocusClick: (focus: Focus) => void
}

export default function ReportView({ detail, entities, selected, onFocusClick }: Props) {
  const blocks = useMemo(() => {
    return renderMarkdown(detail.content ?? '', {
      index: buildTermIndex(entities),
      selected,
      onFocusClick,
    })
  }, [detail.content, entities, selected, onFocusClick])

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

      <article className="doc-content">{blocks}</article>
    </div>
  )
}
