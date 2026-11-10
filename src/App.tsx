import { useCallback, useEffect, useMemo, useState } from 'react'
import { UnauthorizedError, api, getApiToken, setApiUser } from './api'
import type {
  DocContext, DocumentDetail, DocumentRow, EntityRow, Focus, PanelKey, User,
} from './types'
import ReportView from './components/ReportView'
import ImportDialog from './components/ImportDialog'
import AboutBCE from './components/AboutBCE'
import AskPanel from './components/panels/AskPanel'
import ContextPanel from './components/panels/ContextPanel'
import EvidencePanel from './components/panels/EvidencePanel'
import ReviewPanel from './components/panels/ReviewPanel'
import ActionPanel from './components/panels/ActionPanel'
import AssetsPanel from './components/panels/AssetsPanel'
import DashboardPanel from './components/panels/DashboardPanel'
import CopilotPanel from './components/panels/CopilotPanel'
import LoginGate from './components/LoginGate'

const USERS = [
  { id: 'admin', label: '王总管', role: '全局' },
  { id: 'exec_li', label: '李高管', role: '全局' },
  { id: 'lead_veg', label: '蔬菜负责人', role: '蔬菜' },
  { id: 'analyst_wang', label: '王分析师', role: '蔬菜/肉类/水产' },
  { id: 'viewer', label: '只读用户', role: '无品类' },
]

const PANELS: Array<{ key: PanelKey; label: string; icon: string }> = [
  { key: 'context', label: '业务上下文', icon: '◎' },
  { key: 'evidence', label: '数据证据', icon: '▤' },
  { key: 'review', label: '待核事实', icon: '⚠' },
  { key: 'action', label: '行动闭环', icon: '⟳' },
  { key: 'assets', label: '数据资产', icon: '◈' },
  { key: 'ask', label: '智能问答', icon: '✦' },
  { key: 'dashboard', label: '看板', icon: '▦' },
]

const PANEL_TITLES: Record<PanelKey, string> = {
  context: '业务上下文',
  evidence: '数据证据',
  review: '待核事实',
  action: '行动闭环',
  assets: '数据资产',
  ask: '智能问答',
  dashboard: '可视化看板',
}

type Theme = 'light' | 'sepia' | 'dark'
const THEMES: Array<{ key: Theme; label: string }> = [
  { key: 'light', label: '浅色' },
  { key: 'sepia', label: '护眼' },
  { key: 'dark', label: '深色' },
]

// 支持 ?theme=sepia&user=lead_veg 直接落到某个外观/身份，便于分享和对比
function initialTheme(): Theme {
  const q = new URLSearchParams(window.location.search).get('theme') as Theme | null
  if (q && THEMES.some((t) => t.key === q)) return q
  const saved = localStorage.getItem('bce_v11_theme') as Theme | null
  return saved && THEMES.some((t) => t.key === saved) ? saved : 'light'
}

function initialUser(): string {
  return new URLSearchParams(window.location.search).get('user')
    || localStorage.getItem('bce_v11_user')
    || 'admin'
}

const PANEL_KEYS: PanelKey[] = ['context', 'evidence', 'review', 'action', 'assets', 'ask', 'dashboard']

// 侧边栏收起来之后，还留一条竖条：点哪个图标直接把面板展开到那一页
const PANEL_ICONS: Record<PanelKey, string> = {
  context: '◎',
  evidence: '▤',
  review: '⚠',
  action: '⟳',
  assets: '◈',
  ask: '✦',
  dashboard: '▦',
}

function initialPanel(): PanelKey {
  const q = new URLSearchParams(window.location.search).get('panel') as PanelKey | null
  // 首屏默认落在「业务上下文」，配合下面的 GMV 默认选中，打开就是 GMV 趋势
  return q && PANEL_KEYS.includes(q) ? q : 'context'
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getApiToken())
  const [userId, setUserId] = useState(initialUser)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [user, setUser] = useState<User | null>(null)
  const [online, setOnline] = useState(true)

  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [docId, setDocId] = useState('')
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [ctx, setCtx] = useState<DocContext | null>(null)
  const [entities, setEntities] = useState<EntityRow[]>([])
  // 默认选中「总体 GMV」：首屏的业务上下文面板直接有本周数值和历史趋势，不是空白引导页
  const [selected, setSelected] = useState<Focus | null>({ matched: 'GMV', label: 'GMV', kind: 'metric' })

  const [panel, setPanel] = useState<PanelKey>(initialPanel)
  // 回收按钮：收起后正文区变宽，浮起来的窄条能一键展开（并记住上次停在哪一页）
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    if (localStorage.getItem('bce_v11_rail') === 'off') return true
    // 移动端默认收起底部抽屉，先让周报正文占满屏幕；点顶部 tab 再展开
    return window.matchMedia('(max-width: 900px)').matches
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [docLoading, setDocLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState<{ tone: 'ok' | 'err' | 'info'; msg: string } | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // Copilot 相关状态
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotModule, setCopilotModule] = useState<string | null>(null)
  const [copilotContext, setCopilotContext] = useState<string | null>(null)

  const reload = useCallback(() => setReloadTick((t) => t + 1), [])

  const notify = useCallback((tone: 'ok' | 'err' | 'info', msg: string) => {
    setToast({ tone, msg })
    window.setTimeout(() => setToast(null), 6000)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('bce_v11_theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('bce_v11_rail', railCollapsed ? 'off' : 'on')
  }, [railCollapsed])

  // 身份切换 → 重新拉取权限范围内的实体与文档列表
  useEffect(() => {
    if (!authed) return
    setApiUser(userId)
    api.me().then(setUser).catch((err) => {
      if (err instanceof UnauthorizedError) setAuthed(false)
      setUser(null)
    })
    api.entities().then((r) => setEntities(r.entities)).catch(() => setEntities([]))
    api.documents()
      .then((r) => {
        setOnline(true)
        setDocs(r.rows)
        setDocId((cur) => (r.rows.some((d) => d.doc_id === cur) ? cur : (r.rows[0]?.doc_id ?? '')))
      })
      .catch(() => { setOnline(false); setDocs([]); setDocId('') })
  }, [userId, reloadTick, authed])

  // 选中周报 → 正文 + 该周上下文
  useEffect(() => {
    if (!docId) { setDetail(null); setCtx(null); return }
    let cancelled = false
    setDocLoading(true)
    Promise.all([api.document(docId), api.docContext(docId)])
      .then(([d, c]) => {
        if (cancelled) return
        setDetail(d)
        setCtx(c)
      })
      .catch((err: Error) => { if (!cancelled) notify('err', `加载周报失败：${err.message}`) })
      .finally(() => { if (!cancelled) setDocLoading(false) })
    return () => { cancelled = true }
  }, [docId, userId, reloadTick, notify])

  const handleFocusClick = useCallback((focus: Focus) => {
    setSelected(focus)
    setPanel('context')
  }, [])

  const handleIngested = useCallback((msg: string) => {
    setImportOpen(false)
    notify('ok', msg)
    reload()
  }, [notify, reload])

  // Dashboard 选中模块 → 打开 Copilot
  const handleSelectMetric = useCallback((metric: string) => {
    setCopilotModule(metric)
    setCopilotContext('metric')
    setCopilotOpen(true)
  }, [])

  const handleSelectCategory = useCallback((category: string) => {
    setCopilotModule(category)
    setCopilotContext('category')
    setCopilotOpen(true)
  }, [])

  const pendingReview = ctx?.candidates.length ?? 0
  const canApprove = !!user && ['admin', 'executive', 'dept_lead', 'category_lead'].includes(user.role)
  const pendingAction = useMemo(
    () => (ctx?.recommendations ?? []).filter((r) => r.status === 'proposed').length,
    [ctx],
  )
  const badges: Partial<Record<PanelKey, number>> = { review: pendingReview, action: pendingAction }

  if (!authed) {
    return <LoginGate onDone={() => setAuthed(true)} />
  }

  return (
    <div className="app-shell">
      <header className={`topbar${mobileMenuOpen ? ' menu-open' : ''}`}>
        <div className="topbar-left">
          <span className="logo-mark">B</span>
          <button type="button" className="brand-btn" onClick={() => setAboutOpen(true)} title="关于 BCE">
            <span className="brand-text">
              <span className="brand-name">BCE</span>
              <span className="brand-sub">Business Context Engine</span>
            </span>
          </button>
        </div>

        {/* 移动端汉堡：header 只保留一行，面板入口和身份/主题/报告都收进菜单 */}
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-expanded={mobileMenuOpen}
          aria-controls="topbar-menu"
          aria-label={mobileMenuOpen ? '关闭菜单' : '打开菜单'}
          title={mobileMenuOpen ? '关闭菜单' : '打开菜单'}
        >
          <span aria-hidden>{mobileMenuOpen ? '×' : '☰'}</span>
        </button>

        {mobileMenuOpen && (
          <div className="mobile-menu-scrim" role="presentation" onClick={() => setMobileMenuOpen(false)} />
        )}

        <div className="topbar-menu" id="topbar-menu">
          <div className="topbar-center">
            {!online && <span className="badge badge-red">后端离线</span>}
            {PANELS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`top-tab ${panel === p.key ? 'active' : ''}`}
                // 顶部 tab 只负责「把对应面板展开到侧边栏」：主屏永远是周报，
                // 所以侧边栏收起时点 tab 必须一并展开，否则点了什么都不会发生
                onClick={() => { setPanel(p.key); setRailCollapsed(false); setMobileMenuOpen(false) }}
                title={p.label}
              >
                <span aria-hidden>{p.icon}</span>
                {p.label}
                {badges[p.key] ? <em className="tab-badge">{badges[p.key]}</em> : null}
              </button>
            ))}
            {/* Copilot 按钮：挂在 header tab bar 的最末尾，和面板 tab 视觉一致，
                它打开的是独立的 Copilot 侧边栏，所以用 is-open 而不是 is-active */}
            <button
              type="button"
              className={`top-tab copilot-tab${copilotOpen ? ' is-open' : ''}`}
              onClick={() => { setCopilotOpen((v) => !v); setMobileMenuOpen(false) }}
              title={copilotOpen ? '关闭 Copilot' : '打开 Copilot'}
              aria-pressed={copilotOpen}
            >
              <span aria-hidden>✦</span>
              Copilot
            </button>
          </div>

          <div className="topbar-right">
            <div className="theme-switch" role="group" aria-label="显示主题">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={theme === t.key ? 'active' : ''}
                  onClick={() => setTheme(t.key)}
                >{t.label}</button>
              ))}
            </div>
            <select
              className="user-select"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setMobileMenuOpen(false) }}
              title="切换身份（演示权限隔离）"
            >
              {USERS.map((u) => <option key={u.id} value={u.id}>{u.label} · {u.role}</option>)}
            </select>
            <button
              type="button"
              className="import-btn"
              onClick={() => { setImportOpen(true); setMobileMenuOpen(false) }}
            >＋ 导入周报</button>
            <label className="doc-select-label" htmlFor="doc-select">报告</label>
            <select
              id="doc-select"
              className="doc-select"
              value={docId}
              onChange={(e) => { setDocId(e.target.value); setMobileMenuOpen(false) }}
              disabled={docs.length === 0}
            >
              {docs.length === 0 && <option value="">暂无可见周报</option>}
              {docs.map((d) => (
                <option key={d.doc_id} value={d.doc_id} title={d.title}>{d.week_label ?? d.doc_id}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className={`layout${railCollapsed ? ' rail-collapsed' : ''}${copilotOpen ? ' copilot-open' : ''}`}>
        <main className="doc-pane">
          {docLoading && <div className="doc-loading">载入中…</div>}
          {!docLoading && !detail && (
            <div className="doc-empty">
              <p>还没有可读的周报</p>
              <p className="doc-empty-sub">点击右上角「导入周报」，粘贴 Markdown 周报即可解析成数值、事件与建议。</p>
            </div>
          )}
          {!docLoading && detail && (
            <>
              <div className="doc-hint">
                阅读周报，<span className="hint-sample">点击高亮词</span> 查看业务上下文，
                或用 <span className="hint-action">智能问答</span> 直接取数
              </div>
              <ReportView
                detail={detail}
                entities={entities}
                selected={selected}
                onFocusClick={handleFocusClick}
              />
            </>
          )}
        </main>

        <aside className="side-rail" aria-label="面板快捷入口">
          <button
            type="button"
            className="rail-btn rail-toggle"
            onClick={() => setRailCollapsed(false)}
            title="展开侧边栏"
            aria-label="展开侧边栏"
          >
            ‹
          </button>
          {PANELS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`rail-btn${panel === p.key ? ' is-active' : ''}`}
              title={`展开并打开「${p.label}」`}
              aria-label={p.label}
              onClick={() => { setPanel(p.key); setRailCollapsed(false) }}
            >
              <span aria-hidden>{PANEL_ICONS[p.key]}</span>
              {badges[p.key] ? <em className="rail-dot" aria-hidden /> : null}
            </button>
          ))}
        </aside>

        {/* 移动端底部抽屉的遮罩：点空白处收起侧栏，header 保持可点 */}
        {!railCollapsed && (
          <div className="drawer-scrim" role="presentation" onClick={() => setRailCollapsed(true)} />
        )}

        <aside className="side-panel">
          <div className="panel-head">
            <h2>{PANEL_TITLES[panel]}</h2>
            <div className="panel-head-right">
              <span className="muted mono" style={{ fontSize: 11 }}>
                {detail?.week_label ?? ''}
              </span>
              <button
                type="button"
                className="panel-close"
                onClick={() => setRailCollapsed(true)}
                title="收起侧边栏"
                aria-label="收起侧边栏"
              >
                ›
              </button>
            </div>
          </div>
          <div className="panel-host" key={`${panel}-${userId}-${docId}`}>
            {panel === 'dashboard' && (
              <DashboardPanel onSelectMetric={handleSelectMetric} onSelectCategory={handleSelectCategory} />
            )}
            {panel === 'ask' && <AskPanel />}
            {panel === 'context' && (
              <ContextPanel focus={selected} ctx={ctx} weekLabel={detail?.week_label ?? null} />
            )}
            {panel === 'evidence' && (
              <EvidencePanel ctx={ctx} detail={detail} loading={docLoading} onFocusClick={handleFocusClick} />
            )}
            {panel === 'review' && (
              <ReviewPanel ctx={ctx} onChanged={reload} notify={notify} canApprove={canApprove} />
            )}
            {panel === 'action' && (
              <ActionPanel ctx={ctx} latestWeek={docs[0]?.week_label ?? null} canApprove={canApprove} onChanged={reload} notify={notify} />
            )}
            {panel === 'assets' && <AssetsPanel />}
          </div>
        </aside>

        {/* Copilot 侧边栏 */}
        {copilotOpen && (
          <aside className="copilot-sidebar">
            <div className="copilot-sidebar-head">
              <div className="copilot-title-row">
                <span className="copilot-icon">✦</span>
                <h3>Copilot</h3>
              </div>
              <button
                type="button"
                className="panel-close"
                onClick={() => setCopilotOpen(false)}
                title="关闭 Copilot"
                aria-label="关闭 Copilot"
              >×</button>
            </div>
            <CopilotPanel
              selectedModule={copilotModule}
              selectedContext={copilotContext}
            />
          </aside>
        )}

        {/* Copilot FAB 已移除，按钮挪到顶部 header 的 tab bar 末尾 */}
      </div>

      {toast && (
        <div className={`toast toast-${toast.tone}`}>
          <span className="toast-dot" />
          <span>{toast.msg}</span>
          <button type="button" className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {aboutOpen && <AboutBCE onClose={() => setAboutOpen(false)} />}

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onIngested={handleIngested}
          onError={(msg) => notify('err', msg)}
        />
      )}
    </div>
  )
}
