import { useEffect, useState } from 'react'
import { api, setApiToken } from '../api'
import type { AuthConfig } from '../types'

const DEMO_USERS = [
  { id: 'admin', label: '王总管 · 全局' },
  { id: 'exec_li', label: '李高管 · 全局' },
  { id: 'lead_veg', label: '蔬菜负责人 · 蔬菜' },
  { id: 'analyst_wang', label: '王分析师 · 蔬菜/肉类/水产' },
  { id: 'viewer', label: '只读用户 · 无品类' },
]

const AUTH_ERRORS: Record<string, string> = {
  state_mismatch: '登录状态校验失败（可能是多人共用同一浏览器标签），请重试。',
  state_expired: '登录链接已过期，请重新发起。',
  missing_code: '飞书没有返回授权码。',
  lark_failed: '飞书鉴权失败，请检查应用凭据与重定向地址配置。',
  lark_no_open_id: '飞书没有返回 open_id，无法识别身份。',
}

/**
 * 登录门：没有有效 token 时挡在应用外面。
 * 有飞书就只给飞书；没有飞书且非生产，才给演示账号直登，免得本地跑不起来。
 */
export default function LoginGate({ onDone }: { onDone: () => void }) {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    // 飞书回跳带的 token：落到本地就立刻抹掉，别留在地址栏和浏览器历史里
    const returned = q.get('token')
    const authError = q.get('auth_error')
    if (returned || authError) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (returned) {
      setApiToken(returned)
      onDone()
      return
    }
    if (authError) setError(AUTH_ERRORS[authError] || `登录失败：${authError}`)
    api.authConfig().then(setConfig).catch(() => setError('后端不可达，无法获取登录方式'))
  }, [onDone])

  const devLogin = async (id: string) => {
    setBusy(id)
    setError('')
    try {
      const res = await api.devLogin(id)
      setApiToken(res.token)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="login-gate">
      <div className="login-card">
        <h1>BCE 1.1</h1>
        <p className="login-sub">Business Context Engine · 请先登录</p>

        {error && <div className="login-error" role="alert">{error}</div>}

        {config?.lark_enabled && (
          <a className="login-lark" href="/api/v1/auth/lark/authorize">使用飞书登录</a>
        )}

        {config && !config.lark_enabled && (
          <p className="login-hint">
            未配置飞书应用（LARK_APP_ID / LARK_APP_SECRET），飞书登录不可用。
          </p>
        )}

        {config?.dev_login && (
          <div className="login-dev">
            <p className="login-hint">开发环境：用演示账号直登（生产环境不开放）</p>
            <div className="login-users">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => devLogin(u.id)}
                >{busy === u.id ? '登录中…' : u.label}</button>
              ))}
            </div>
          </div>
        )}

        {config && config.warnings.length > 0 && (
          <ul className="login-warnings">
            {config.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}
