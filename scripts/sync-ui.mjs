#!/usr/bin/env node
// 把 ../frontend/src 的组件源码同步到本目录的 src/，供 monorepo 内维护使用。
//
// vecel 是独立项目：它有自己的 package.json、vite 配置和一份完整的源码副本，
// 单独拷走这个目录（脱离 ../frontend）也能 npm install && npm run build。
// 但在 monorepo 里改完 UI，需要跑一次本脚本让演示站跟上，否则两份代码会漂。
//
// 两个文件刻意不同步，改它们只能改 vecel 这一份：
//   src/api.ts                        离线站的数据层指向 mock，真实系统打 /api/v1
//   src/components/panels/AskPanel.tsx 演示站多挂三个「模型写 SQL」的快捷问题
//
// 用法：node scripts/sync-ui.mjs
import { cp, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const from = path.join(repoRoot, 'frontend', 'src')
const to = path.join(repoRoot, 'vecel', 'src')

const SKIP = new Set([
  'api.ts',
  'api.real.ts',
  path.join('components', 'panels', 'AskPanel.tsx'),
])

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

if (!(await exists(from))) {
  console.error(`找不到 ${from}：本脚本只在 monorepo 里可用，独立分发的 vecel 不需要它。`)
  process.exit(1)
}

let copied = 0
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const rel = path.relative(from, abs)
    if (SKIP.has(rel)) continue
    if (entry.isDirectory()) {
      await walk(abs)
      continue
    }
    const dest = path.join(to, rel)
    await cp(abs, dest, { recursive: true })
    copied += 1
  }
}

await walk(from)
console.log(`已同步 ${copied} 个文件到 vecel/src`)
console.log('跳过（演示站专属）：' + [...SKIP].join('、'))
