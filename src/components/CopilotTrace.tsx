import { useState } from 'react'
import type { TraceStep } from '../lib/trace'
import { fmtMs } from '../lib/format'
import { Icon, toolIcon } from '../lib/icons'

function Body({ step, id, status }: { step: TraceStep; id: string; status?: string }) {
  const sql = typeof step.args?.sql === 'string' ? step.args.sql : ''
  const rest = step.args
    ? Object.fromEntries(Object.entries(step.args).filter(([key]) => key !== 'sql'))
    : {}
  const hasRest = Object.keys(rest).length > 0
  const statusText = status === 'error' ? '失败'
    : status === 'running' ? '进行中'
      : status === 'ok' ? '成功' : '未完成'
  return (
    <div className="trace-body" id={`trace-body-${id}`}>
      {step.detail && <div className="trace-text">{step.detail}</div>}
      {sql && <pre>{sql}</pre>}
      {hasRest && <pre>{JSON.stringify(rest, null, 2)}</pre>}
      <div className="trace-meta">
        {step.tool && <span>{step.tool}</span>}
        <span>{statusText}</span>
        {step.duration_ms != null && <span>{fmtMs(step.duration_ms)}</span>}
      </div>
    </div>
  )
}

/** 折叠态的一行摘要。说法要和展开后的列表对得上：
 *  步数 = 列表行数，耗时 = 各步之和，有失败就优先说失败。 */
function summarize(steps: TraceStep[], live: boolean) {
  const total = steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0)
  const failed = steps.filter((s) => s.status === 'error').length
  const running = live && steps.some((s) => s.status === 'running')
  return { count: steps.length, total, failed, running }
}

/**
 * 工具调用轨迹：一行一次调用，明细再往里收一层。
 *
 * collapsible=true 时整段能收成一行摘要——回答结束后轨迹不再抢正文的位置，
 * 但「调了几步、花了多久、有没有失败」仍然摆在明面上。
 */
export default function CopilotTrace({
  steps, live = true, collapsible = false, defaultOpen = true,
}: {
  steps: TraceStep[]
  live?: boolean
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  if (!steps.length) return null

  const s = summarize(steps, live)
  const failed = s.failed > 0

  if (collapsible) {
    const label = open
      ? (s.running ? `正在跑第 ${s.count} 步…` : failed ? `${s.count} 步 · ${s.failed} 步失败` : `完成 ${s.count} 步`)
      : (failed ? `${s.count} 步中有 ${s.failed} 步失败` : `${s.count} 步全部完成`)
    return (
      <div className="copilot-trace">
        <button
          type="button"
          className={`trace-summary${open ? ' is-open' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className="trace-dot"
            data-status={s.running ? 'running' : failed ? 'error' : 'ok'}
            aria-hidden
          />
          <Icon name={failed ? 'risk' : s.running ? 'clock' : 'check'} size={12} />
          <span className="trace-summary-text">{label}</span>
          <span className="trace-dur">{fmtMs(s.total)}</span>
          <span className="trace-chevron" aria-hidden><Icon name="chevron" size={12} /></span>
        </button>
        {open && (
          <div className="trace-list">
            <StepList steps={steps} live={live} expandedId={expandedId} onToggle={setExpandedId} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="copilot-trace">
      <StepList steps={steps} live={live} expandedId={expandedId} onToggle={setExpandedId} />
    </div>
  )
}

function StepList({ steps, live, expandedId, onToggle }: {
  steps: TraceStep[]
  live: boolean
  expandedId: string | null
  onToggle: (id: string | null) => void
}) {
  return (
    <>
      {steps.map((step, i) => {
        const id = step.id || `${i}-${step.title}`
        // 整轮已结束还挂着 running 的，是中途失败没来得及收尾：别再让它转圈
        const status = !live && step.status === 'running' ? undefined : step.status
        const isOpen = expandedId === id
        return (
          <div className={`trace-item${isOpen ? ' is-open' : ''}`} key={id} data-status={status || 'ok'}>
            <button
              type="button"
              className="trace-head"
              aria-expanded={isOpen}
              aria-controls={`trace-body-${id}`}
              onClick={() => onToggle(isOpen ? null : id)}
            >
              <span className="trace-dot" data-status={status || 'ok'} aria-hidden />
              <span className="trace-icon" aria-hidden>
                <Icon name={toolIcon(step.tool, step.type)} size={13} />
              </span>
              <span className="trace-name">{step.title}</span>
              {step.detail && <span className="trace-preview">{step.detail}</span>}
              <span className="trace-dur">{fmtMs(step.duration_ms)}</span>
              <span className="trace-chevron" aria-hidden><Icon name="chevron" size={12} /></span>
            </button>
            {isOpen && <Body step={step} id={id} status={status} />}
          </div>
        )
      })}
    </>
  )
}
