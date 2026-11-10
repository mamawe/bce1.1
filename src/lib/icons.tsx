import type { ReactNode } from 'react'

/**
 * 全站线性图标：16×16 网格、1.35 描边、currentColor。
 *
 * 为什么要有这一份：Copilot 侧栏之前是两套图标挨着用——工具轨迹画 SVG，
 * 下一步动作和面板标题用 emoji（📈 ✅ ⚠️ ✦）。emoji 由系统字体渲染，
 * 换台机器字重、描边、配色都不一样，跟旁边的 SVG 放一起马上看得出是两种东西。
 * 统一之后，图标只跟 currentColor 走，主题切换也一起变。
 */
export type IconName =
  // 下一步动作（与后端 copilot.actions[].kind 对齐）
  | 'trend' | 'rank' | 'why' | 'compare' | 'snapshot' | 'todo'
  | 'highlight' | 'risk' | 'focus' | 'evidence'
  // 工具轨迹按命名空间选的图标
  | 'database' | 'code' | 'model' | 'box'
  // 结构与状态
  | 'spark' | 'chevron' | 'return' | 'clock' | 'check' | 'filter'

const SHAPES: Record<IconName, ReactNode> = {
  // 实心：唯一的例外，星芒用填充才立得住
  spark: <path d="M8 2.2l1.5 4.1L13.6 8l-4.1 1.5L8 13.6 6.5 9.5 2.4 8l4.1-1.5z" fill="currentColor" stroke="none" />,

  trend: (
    <>
      <path d="M2.4 11.7l3.3-3.5 2.3 2 4.1-4.5" />
      <path d="M9.9 5.7h2.9v2.9" />
    </>
  ),
  // 三条递减横线：说的是「排序」，不是一个柱状图
  rank: <path d="M2.6 4.3h9.2M2.6 8h6.2M2.6 11.7h3.6" />,
  why: (
    <>
      <circle cx="7.1" cy="7.1" r="4.3" />
      <path d="M10.2 10.2l3.2 3.2" />
      <path d="M5.4 7.1h3.4M7.1 5.4v3.4" />
    </>
  ),
  compare: (
    <>
      <path d="M2.8 5.6h9.4M2.8 10.4h9.4" />
      <path d="M5.4 3.6L3.2 5.6l2.2 2M10.6 8.4l2.2 2-2.2 2" />
    </>
  ),
  snapshot: (
    <>
      <rect x="2.6" y="3.2" width="10.8" height="9.6" rx="1.8" />
      <path d="M2.6 6.5h10.8M6.4 6.5v6.3" />
    </>
  ),
  todo: (
    <>
      <path d="M2.9 4.5l1.4 1.4 2.4-2.6" />
      <path d="M2.9 10.5l1.4 1.4 2.4-2.6" />
      <path d="M8.2 5.2h5M8.2 11.2h5" />
    </>
  ),
  highlight: <path d="M8 2.4l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.7l4-.6z" />,
  risk: (
    <>
      <path d="M8 2.9l5.2 9.3H2.8z" />
      <path d="M8 6.4v2.6M8 10.6v.9" />
    </>
  ),
  focus: (
    <>
      <circle cx="8" cy="8" r="5.2" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  evidence: (
    <>
      <path d="M4.2 2.6h5l2.6 2.6v8.2H4.2z" />
      <path d="M9.2 2.6v2.6h2.6" />
      <path d="M6 8.2h4M6 10.6h2.8" />
    </>
  ),

  database: (
    <>
      <ellipse cx="8" cy="3.7" rx="4.6" ry="1.9" />
      <path d="M3.4 3.7v8.2c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V3.7" />
      <path d="M3.4 7.8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9" />
    </>
  ),
  code: <path d="M5.6 4.6L2.4 8l3.2 3.4M10.4 4.6L13.6 8l-3.2 3.4" />,
  model: <path d="M8 2.4l1.5 4.1L13.6 8l-4.1 1.5L8 13.6 6.5 9.5 2.4 8l4.1-1.5z" strokeLinejoin="round" />,
  box: (
    <>
      <rect x="2.4" y="2.9" width="11.2" height="10.2" rx="2" />
      <path d="M5 6.3l2 1.9-2 1.9M8.8 10.1h2.4" />
    </>
  ),
  filter: <path d="M2.6 3.8h10.8L9.4 8.5v4.2l-2.8 1.4V8.5z" />,

  chevron: <path d="M6 3.5L10.5 8 6 12.5" />,
  // 折返箭头：追问用它起头，和「下一步动作」在同一行里也能分得开
  return: (
    <>
      <path d="M3.2 4.4v4.2h6.6" />
      <path d="M7.9 6.6l1.9 2-1.9 2" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 4.9V8l2.4 1.6" />
    </>
  ),
  check: <path d="M3 8.4l3.2 3.2L13 4.8" />,
}

/** 后端给的 action.kind → 图标。取不到就用 search，不用 emoji 兜。 */
export const ACTION_ICONS: Record<string, IconName> = {
  trend: 'trend',
  rank: 'rank',
  why: 'why',
  compare: 'compare',
  snapshot: 'snapshot',
  todo: 'todo',
  highlight: 'highlight',
  risk: 'risk',
  focus: 'focus',
  evidence: 'evidence',
}

/** 工具名按命名空间选图标：who.answer 这种写法取最前面一段。 */
export function toolIcon(tool: string | undefined, fallback: string): IconName {
  const kind = (tool || '').split('.')[0] || fallback
  if (['metric_facts', 'fact', 'db', 'ontology'].includes(kind)) return 'database'
  if (['semantic', 'planner'].includes(kind)) return 'code'
  if (['llm', 'model'].includes(kind)) return 'model'
  return 'box'
}

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  )
}
