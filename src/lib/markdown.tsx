import { Fragment, type ReactNode } from 'react'
import type { EntityRow, Focus } from '../types'

export interface TermIndex {
  regex: RegExp
  map: Map<string, EntityRow>
  entities: EntityRow[]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 允许名称中间出现空格："SKU 宽度" 也能匹配 "SKU宽度"
function flexiblePattern(s: string): string {
  return s
    .replace(/\s+/g, '')
    .split('')
    .map(escapeRegExp)
    .join('\\s*')
}

export function buildTermIndex(entities: EntityRow[]): TermIndex | null {
  const map = new Map<string, EntityRow>()
  const terms: string[] = []
  for (const ent of entities) {
    for (const name of [ent.entity_name, ...(ent.aliases ?? [])]) {
      const trimmed = name.trim()
      const key = trimmed.toLowerCase()
      const keyNs = key.replace(/\s+/g, '')
      if (key && !map.has(key)) {
        map.set(key, ent)
        terms.push(trimmed)
      }
      if (keyNs && keyNs !== key && !map.has(keyNs)) map.set(keyNs, ent)
    }
  }
  if (terms.length === 0) return null
  terms.sort((a, b) => b.length - a.length)
  return {
    regex: new RegExp(`(${terms.map(flexiblePattern).join('|')})`, 'gi'),
    map,
    entities,
  }
}

function lookup(seg: string, index: TermIndex): EntityRow | null {
  const lower = seg.toLowerCase()
  return index.map.get(lower) ?? index.map.get(lower.replace(/\s+/g, '')) ?? null
}

const NUMBER_RE = /([+-]?\d[\d,]*(?:\.\d+)?)\s*(%|万元|万|元|pp|个百分点|倍|单|人|家|次|天|小时|分钟|件|kg|克|吨)/g

function highlightNumbers(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  NUMBER_RE.lastIndex = 0
  while ((m = NUMBER_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<span key={`${keyBase}-n${m.index}`} className="num-hit">{m[0]}</span>)
    last = m.index + m[0].length
  }
  if (last === 0) return [text]
  if (last < text.length) out.push(text.slice(last))
  return out
}

export interface InlineHandlers {
  index: TermIndex | null
  selected: Focus | null
  onFocusClick: (focus: Focus) => void
}

type Piece = { text: string; ent: EntityRow | null; combo?: { category: string; metric: string } }

const isDimension = (e: EntityRow) => e.category === 'OBJECT' || e.category === 'OWNER'
const isMetric = (e: EntityRow) => e.category === 'METRIC'
const isComboEntity = (e: EntityRow | undefined): boolean => e?.category === 'COMBO'

/**
 * 「蔬菜客单价」在正文里是一个对象，后端已经把每种写法登记成 COMBO 实体，
 * 这里按名字最长优先匹配即可整体命中。没有后端组合实体时（例如静态快照较旧），
 * 再用下面的 mergePieces 兜底把紧挨着的「品类 + 指标」拼起来。
 */
/** 组合实体的名字里带着品类与指标，二者要从名字里还原出来给上下文面板用 */
function comboParts(e: EntityRow, allEntities: EntityRow[]): { category: string; metric: string } | null {
  const name = e.entity_name
  // 1) 「蔬菜的客单价」：显式带「的」，直接切开
  const marked = name.split('的')
  if (marked.length === 2 && marked[0] && marked[1]) return { category: marked[0], metric: marked[1] }
  // 2) 「蔬菜客单价」「蔬菜损耗」：按指标全称（含省略「率」的写法）从左找切点
  const metrics = allEntities
    .filter((x) => x.category === 'METRIC')
    .flatMap((m) => [m.entity_name, m.entity_name.replace(/率$/, '')])
    .filter((t) => t.length >= 2)
  let best: { idx: number; metric: string } | null = null
  for (const token of metrics) {
    const idx = name.indexOf(token)
    if (idx <= 0) continue
    if (!best || idx < best.idx) best = { idx, metric: token }
  }
  if (!best) return null
  const category = name.slice(0, best.idx)
  return category ? { category, metric: best.metric } : null
}

// 「蔬菜」+「客单价」紧挨着出现时合成一个单元；中间隔了字或标点就不合
function mergePieces(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  for (let i = 0; i < pieces.length; i++) {
    const cur = pieces[i]
    const gap = pieces[i + 1]
    const nxt = pieces[i + 2]
    if (cur.ent && nxt?.ent && gap && gap.text === '') {
      if (isDimension(cur.ent) && isMetric(nxt.ent)) {
        out.push({
          text: cur.text + nxt.text,
          ent: cur.ent,
          combo: { category: cur.ent.entity_name, metric: nxt.ent.entity_name },
        })
        i += 2
        continue
      }
      if (isMetric(cur.ent) && isDimension(nxt.ent)) {
        out.push({
          text: cur.text + nxt.text,
          ent: nxt.ent,
          combo: { category: nxt.ent.entity_name, metric: cur.ent.entity_name },
        })
        i += 2
        continue
      }
    }
    if (cur.text !== '') out.push(cur)
  }
  return out
}

function splitPieces(text: string, index: TermIndex): Piece[] {
  return text
    .split(index.regex)
    .map((seg, i) => ({ text: seg, ent: i % 2 === 1 ? lookup(seg, index) : null }))
}

function focusOfPiece(piece: Piece, index: TermIndex | null): Focus {
  const ent = piece.ent
  if (ent && isComboEntity(ent) && index) {
    const parts = comboParts(ent, index.entities)
    if (parts) {
      return {
        matched: piece.text,
        label: `${parts.category} · ${parts.metric}`,
        kind: 'combo',
        category: parts.category,
        metric: parts.metric,
      }
    }
    // 认不出品类/指标就退化成普通实体：仍然可点，上下文面板按名字查
    return { matched: piece.text, label: ent.entity_name, kind: 'category', entity: ent }
  }
  if (piece.combo) {
    const { category, metric } = piece.combo
    return {
      matched: piece.text,
      label: `${category} · ${metric}`,
      kind: 'combo',
      category,
      metric,
    }
  }
  return {
    matched: piece.text,
    label: ent!.entity_name,
    kind: ent!.category === 'METRIC' ? 'metric' : ent!.category === 'OWNER' ? 'merchant' : 'category',
    entity: ent!,
  }
}

function renderEntities(text: string, h: InlineHandlers, keyBase: string): ReactNode[] {
  if (!h.index) return highlightNumbers(text, keyBase)
  const pieces = mergePieces(splitPieces(text, h.index))
  return pieces.map((piece, i) => {
    if (!piece.ent) {
      return <Fragment key={`${keyBase}-${i}`}>{highlightNumbers(piece.text, `${keyBase}-${i}`)}</Fragment>
    }
    const focus = focusOfPiece(piece, h.index)
    const active = h.selected?.matched === piece.text
    return (
      <span
        key={`${keyBase}-${i}`}
        className={`entity-hit${piece.combo ? ' is-combo' : ''}${active ? ' is-active' : ''}`}
        title={`${focus.label} · 点击查看业务上下文`}
        onClick={(e) => { e.stopPropagation(); h.onFocusClick(focus) }}
      >
        {piece.text}
      </span>
    )
  })
}

function stripMdInline(s: string): string {
  return s.replace(/\*\*/g, '').replace(/`/g, '').trim()
}

function blockKey(text: string): string {
  return stripMdInline(text).slice(0, 30)
}

export function renderInline(text: string, h: InlineHandlers, keyBase = 'i'): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={`${keyBase}-b${i}`}>{renderEntities(part.slice(2, -2), h, `${keyBase}-bi${i}`)}</strong>
      }
      return <Fragment key={`${keyBase}-t${i}`}>{renderEntities(part, h, `${keyBase}-ti${i}`)}</Fragment>
    })
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()))
}

function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

export function renderMarkdown(md: string, h: InlineHandlers): ReactNode[] {
  const lines = md.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    if (trimmed === '') { i++; continue }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={key++} className="md-hr" />)
      i++
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      const Tag = (`h${level + 1}` as unknown) as keyof JSX.IntrinsicElements
      blocks.push(
        <Tag key={key++} className={`md-h md-h${level}`} data-quote={blockKey(heading[2])}>
          {renderInline(heading[2], h, `h${key}`)}
        </Tag>,
      )
      i++
      continue
    }

    if (trimmed.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim())
        i++
      }
      const parsed = rows.map(splitTableRow).filter((cells) => !isSeparatorRow(cells))
      const [head, ...rest] = parsed
      blocks.push(
        <div key={key++} className="md-table-wrap" data-quote={blockKey(head?.join(' ') ?? '')}>
          <table className="md-table">
            {head && (
              <thead>
                <tr>{head.map((cell, ci) => <th key={ci}>{renderInline(cell, h, `th${key}-${ci}`)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {rest.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => <td key={ci}>{renderInline(cell, h, `td${key}-${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={key++} className="md-quote" data-quote={blockKey(quote.join(' '))}>
          {renderInline(quote.join(' '), h, `q${key}`)}
        </blockquote>,
      )
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="md-ul">
          {items.map((item, li) => <li key={li} data-quote={blockKey(item)}>{renderInline(item, h, `ul${key}-${li}`)}</li>)}
        </ul>,
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className="md-ol">
          {items.map((item, li) => <li key={li} data-quote={blockKey(item)}>{renderInline(item, h, `ol${key}-${li}`)}</li>)}
        </ol>,
      )
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^-{3,}$/.test(lines[i].trim()) &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key++} className="md-p" data-quote={blockKey(paraLines.join(' '))}>
        {paraLines.map((pl, pi) => (
          <Fragment key={`p${key}-${pi}`}>
            {renderInline(pl.trim(), h, `p${key}-${pi}`)}
            {/\s{2,}$/.test(pl) && pi < paraLines.length - 1 ? <br /> : ' '}
          </Fragment>
        ))}
      </p>,
    )
  }

  return blocks
}
