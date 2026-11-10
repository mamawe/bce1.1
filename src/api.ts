// 离线演示站唯一的 API 实现：全部走内存 mock，不连后端、不调模型。
//
// 这个目录是从 ../frontend/src 复制出来的独立副本。真实系统的 api.ts 打
// /api/v1，这里的 api.ts 直接指向 mock-api.ts——同一棵组件树，两种数据源。
import * as mockApi from './mock-api'

export const api = mockApi.api
export const askStream = mockApi.askStream
export const askRerun = mockApi.askRerun
export const parseJson = mockApi.parseJson

// 身份与 token：演示站没有真实登录态。getApiToken 默认给一个占位 token，
// 让页面开门即进；真实系统没 token 就必须走登录门，这里刻意不同。
const DEMO_TOKEN = 'offline-demo-token'

export function setApiToken(next: string) {
  try {
    if (next) localStorage.setItem('bce_v11_token', next)
    else localStorage.removeItem('bce_v11_token')
  } catch { /* 禁用 localStorage 的环境（file://、隐私模式）忽略即可 */ }
}

export function getApiToken() {
  try {
    return localStorage.getItem('bce_v11_token') || DEMO_TOKEN
  } catch {
    return DEMO_TOKEN
  }
}

export function setApiUser(id: string) {
  try { localStorage.setItem('bce_v11_user', id) } catch { /* 同上 */ }
}

export function getApiUser() {
  try {
    return localStorage.getItem('bce_v11_user') || 'admin'
  } catch {
    return 'admin'
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}
