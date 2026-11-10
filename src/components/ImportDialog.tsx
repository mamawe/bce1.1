import { useEffect, useState } from 'react'
import { api } from '../api'
import type { IngestReport } from '../types'

interface Props {
  onClose: () => void
  onIngested: (msg: string) => void
  onError: (msg: string) => void
}

function summarize(rep: IngestReport): string {
  const parts = [`${rep.week_label} · ${rep.facts_accepted} 条数值`, `${rep.events_extracted} 个事件`]
  if (rep.decisions_extracted) parts.push(`${rep.decisions_extracted} 条决策`)
  if (rep.review_count) parts.push(`${rep.review_count} 条待核`)
  if (rep.recommendations_generated) parts.push(`${rep.recommendations_generated} 条建议`)
  return parts.join(' · ')
}

export default function ImportDialog({ onClose, onIngested, onError }: Props) {
  const [samples, setSamples] = useState<Array<{ id: string; title: string }>>([])
  const [picked, setPicked] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.samples().then((r) => setSamples(r.samples)).catch(() => setSamples([]))
  }, [])

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const rep = picked
        ? await api.ingest({ sample: picked })
        : await api.ingest({ title, content })
      onIngested(`《${rep.identity ? title || rep.doc_id : rep.doc_id}》已更新：${summarize(rep)}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onError(msg)
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = picked ? !busy : !busy && content.trim().length > 0

  return (
    <div className="modal-mask" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="导入周报">
        <div className="modal-head">
          <div>
            <div className="eyebrow">新增 / 更新周报</div>
            <h3>粘贴本周周报 Markdown</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>×</button>
        </div>

        <div className="modal-body">
          {samples.length > 0 && (
            <label className="field row">
              <span className="eyebrow">或用仓库示例</span>
              <select value={picked} onChange={(e) => setPicked(e.target.value)}>
                <option value="">不使用示例</option>
                {samples.map((s) => <option key={s.id} value={s.id}>{s.id.toUpperCase()}</option>)}
              </select>
            </label>
          )}

          {!picked && (
            <>
              <label className="field">
                <span className="eyebrow">标题</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：2026年第36周 销售周报（8月31日-9月6日）"
                />
              </label>
              <label className="field">
                <span className="eyebrow">正文</span>
                <textarea
                  className="md-input"
                  rows={12}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={'# 2026年第36周 销售周报\n\n| 品类 | GMV | 环比 |\n|---|---|---|\n| 蔬菜 | 128.4 万元 | +3.1% |'}
                />
              </label>
              <p className="modal-note">
                标题或正文需要写明 ISO 年份与周次（如"2026年第36周"或 front matter 的 week），
                否则系统会拒绝入库而不是猜一个年份。
              </p>
            </>
          )}

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!canSubmit}>
            {busy ? '解析中…' : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
