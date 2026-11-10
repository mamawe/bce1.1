// 静态演示站不发请求，token 只是让复用组件里的 getApiToken() 有个值。
export function getApiToken() {
  return 'demo'
}

export function setApiToken(_token: string) {}

// 身份仍只影响前端展示，和后端版同语义（localStorage 记住当前身份）
export function setApiUser(id: string) {
  localStorage.setItem('bce_v11_user', id)
}

export function getApiUser() {
  return localStorage.getItem('bce_v11_user') || 'admin'
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}
