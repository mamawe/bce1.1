import type { AskResponse } from '../types'
import type { TraceStep } from './trace'

/** Copilot 的一轮对话。与 ask-history 分开存：两个面板的对话不是一回事，
 *  Copilot 每轮还带着「选中了哪个模块」，混在一个桶里会串味。 */
export interface CopilotTurn {
  id: string
  q: string
  text: string
  done: boolean
  error?: string
  thinking?: TraceStep[]
  meta?: AskResponse
  /** 这一轮问的时候选中的模块：历史里要能看出当时在问什么 */
  module?: string | null
  moduleType?: string | null
  askedAt: number
}

const KEY = 'bce_v11_copilot'
const MAX_TURNS = 30
const MAX_TEXT = 8000

function turnKey(userId: string): string {
  // 换身份必须换历史：受限身份不能从 localStorage 读到上一身份问出来的大盘数字
  return `${KEY}:${userId || 'guest'}`
}

export function newCopilotTurn(q: string, module?: string | null, moduleType?: string | null): CopilotTurn {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    q, text: '', done: false, module, moduleType, askedAt: Date.now(),
  }
}

function clip(turn: CopilotTurn): CopilotTurn {
  return {
    ...turn,
    text: turn.text.length > MAX_TEXT ? turn.text.slice(0, MAX_TEXT) : turn.text,
    done: true,
  }
}

export function loadCopilotTurns(userId: string): CopilotTurn[] {
  try {
    const raw = localStorage.getItem(turnKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isTurn).map(clip)
  } catch {
    return []
  }
}

export function saveCopilotTurns(userId: string, turns: CopilotTurn[]): void {
  try {
    localStorage.setItem(turnKey(userId), JSON.stringify(turns.slice(-MAX_TURNS).map(clip)))
  } catch {
    /* 配额满 / 隐私模式下静默失败 */
  }
}

export function clearCopilotTurns(userId: string): void {
  try {
    localStorage.removeItem(turnKey(userId))
  } catch {
    /* 同上 */
  }
}

function isTurn(value: unknown): value is CopilotTurn {
  if (!value || typeof value !== 'object') return false
  const t = value as Partial<CopilotTurn>
  return typeof t.q === 'string' && typeof t.text === 'string'
}
