import type { AskResponse } from '../types'

/** 一轮问答。持久化时只留可复现的内容，流式过程态（done/进行中）不入库。 */
export interface AskTurn {
  id: string
  q: string
  text: string
  meta?: AskResponse
  error?: string
  done: boolean
  askedAt: number
}

const KEY = 'bce_v11_ask_history'
const MAX_TURNS = 50
const MAX_TEXT = 20000

function turnKey(userId: string): string {
  // 换身份必须换历史：受限身份不能从 localStorage 读到上一身份问出来的大盘数字
  return `${KEY}:${userId || 'guest'}`
}

export function newTurn(q: string): AskTurn {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, q, text: '', done: false, askedAt: Date.now() }
}

function clip(turn: AskTurn): AskTurn {
  return { ...turn, text: turn.text.length > MAX_TEXT ? turn.text.slice(0, MAX_TEXT) : turn.text, done: true }
}

export function loadTurns(userId: string): AskTurn[] {
  try {
    const raw = localStorage.getItem(turnKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isTurn).map(clip)
  } catch {
    return [] // 存储被禁用或内容损坏都不该让面板崩掉
  }
}

export function saveTurns(userId: string, turns: AskTurn[]): void {
  try {
    localStorage.setItem(turnKey(userId), JSON.stringify(turns.slice(-MAX_TURNS).map(clip)))
  } catch {
    /* 配额满 / 隐私模式下静默失败，历史只是优化项 */
  }
}

export function clearTurns(userId: string): void {
  try {
    localStorage.removeItem(turnKey(userId))
  } catch {
    /* 同上 */
  }
}

function isTurn(value: unknown): value is AskTurn {
  if (!value || typeof value !== 'object') return false
  const t = value as Partial<AskTurn>
  return typeof t.q === 'string' && typeof t.text === 'string'
}
