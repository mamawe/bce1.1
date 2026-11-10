import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  title: string
  lines: string[]
  /** 自定义图标大小，默认 14 */
  size?: number
}

/**
 * 信息标记：一个圆形 ℹ 图标，鼠标悬停（或键盘聚焦）时展示说明浮层。
 *
 * 复用 AskMetaBadges 的定位策略（fixed + 运行时算坐标），确保不会被
 * 父级 overflow / transform 裁切。所有需要「悬停看详细原因」的地方统一用它。
 */
export default function InfoMark({ title, lines, size = 14 }: Props) {
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null)

  const place = useCallback(() => {
    const anchor = wrapRef.current?.getBoundingClientRect()
    if (!anchor) return
    const tip = tipRef.current?.getBoundingClientRect()
    const tipW = Math.min(tip?.width || 280, 320)
    const tipH = tip?.height || 120
    const margin = 10
    const vh = window.innerHeight
    const vw = window.innerWidth

    let left = anchor.left + anchor.width / 2 - tipW / 2
    let top: number
    if (anchor.bottom + margin + tipH <= vh) {
      top = anchor.bottom + margin
    } else if (anchor.top - margin - tipH > 0) {
      top = anchor.top - margin - tipH
    } else {
      left = anchor.right + margin
      top = Math.min(Math.max(anchor.top, margin), vh - tipH - margin)
    }
    left = Math.min(Math.max(left, margin), Math.max(vw - tipW - margin, margin))
    setCoords({ left, top, width: tipW })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const handler = () => place()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    // 键盘用户按 Esc 就收起来：浮层是 fixed 的，鼠标移开也关不掉的话就会一直糊在面板上
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, place])

  return (
    <span
      className={`info-mark-wrap${open ? ' is-open' : ''}`}
      ref={wrapRef}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      // 触屏没有 hover：点一下开、再点一下关，免得只能靠 Esc
      onClick={() => setOpen((v) => !v)}
    >
      <span
        className="info-mark-icon"
        aria-label={title}
        style={{ width: size, height: size, fontSize: size * 0.72 }}
      >
        ℹ
      </span>
      <span
        ref={tipRef}
        // is-open 必须跟着 open 走：写死的话浮层永远显示，用户关不掉
        className={`meta-tip${open ? ' is-open' : ''}`}
        role="tooltip"
        style={open && coords ? { left: coords.left, top: coords.top, maxWidth: coords.width } : undefined}
      >
        <span className="meta-tip-title">{title}</span>
        {lines.map((line, i) => <span className="meta-tip-line" key={i}>{line}</span>)}
      </span>
    </span>
  )
}
