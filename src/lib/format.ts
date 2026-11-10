/**
 * 界面里的数字写法。统一放这里，是为了让同一个数字在两处呈现一致。
 *
 * 起因：『耗时』在答案头部写 1.20s（AskMetaBadges 内部的 fmtMs，两位小数），
 * 在工具轨迹里写 1.2s（trace.ts 的 fmtDuration，一位小数）。同一条回答上下
 * 挨着两个精度不同的数，看着像两个指标。
 */

/** 耗时：毫秒 <1s、秒保留一位。空值给「—」，不要让界面出现「0ms」。 */
export function fmtMs(ms?: number | null): string {
  if (ms == null) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.max(1, Math.round(ms))}ms`
}

/** 上下文装载量：1200 → 1.2k 字。周报那条标签要短，写满四位数字会挤掉别的内容。 */
export function fmtChars(n?: number | null): string {
  if (n == null) return ''
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k 字` : `${n} 字`
}
