/** 工具调用轨迹的数据形状。runtime 与 UI 共用，别在两边各写一份。 */

export interface TraceStep {
  /** 后端一次调用发两条同 id 事件：running → ok/error */
  id?: string
  /** route / plan / tool_call / compute / analyze / error / result */
  type: string
  title: string
  detail?: string
  status?: 'running' | 'ok' | 'error'
  duration_ms?: number
  /** 具体工具名，如 metric_facts / semantic.compiler / llm.answer */
  tool?: string
  args?: Record<string, unknown>
}

/** 按 id 合并：先出现的保持原位，后来的覆盖状态与耗时。没有 id 的旧事件直接追加。 */
export function mergeStep(steps: TraceStep[], next: TraceStep): TraceStep[] {
  if (!next.id) return [...steps, next]
  const i = steps.findIndex((s) => s.id === next.id)
  if (i < 0) return [...steps, next]
  const out = steps.slice()
  out[i] = { ...out[i], ...next }
  return out
}
