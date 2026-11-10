import type { ReactNode } from 'react'

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Meter({ value, tone = 'cyan' }: { value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className={`meter meter-${tone}`}>
      <span style={{ width: `${pct}%` }} />
      <em>{pct}%</em>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Loading({ label = '载入中' }: { label?: string }) {
  return (
    <div className="loading">
      <span className="loading-bar" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="error-box"><span>ERR</span>{message}</div>
}
