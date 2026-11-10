import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Health, Ontology, DocumentRow } from '../../types'
import { Badge, Empty, Loading } from '../../ui'

/** 数据资产面板：展示库里有什么数据、覆盖范围、指标清单。
 *
 *  对应「数据资产」页签，让用户一眼看到：
 *  - 事实条数、覆盖周数、口径对象数、事件数、决策数
 *  - 已登记的指标清单（含单位与别名）
 *  - 品类与商户维度
 *  - 周报列表
 *  - LLM 接通状态（API Key 是否配置、模型名称）
 */
export default function AssetsPanel() {
  const [health, setHealth] = useState<Health | null>(null)
  const [ontology, setOntology] = useState<Ontology | null>(null)
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.health(), api.ontology(), api.documents()])
      .then(([h, o, d]) => {
        if (cancelled) return
        setHealth(h)
        setOntology(o)
        setDocs(d.rows)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <Loading label="载入数据资产" />
  if (error) return <Empty>加载失败：{error}</Empty>
  if (!health) return <Empty>无数据</Empty>

  const stats = health.stats
  const metrics = ontology?.metrics ?? {}
  const metricEntries = Object.entries(metrics)
  const categories = ontology?.dimensions.category ?? []
  const merchants = ontology?.dimensions.merchant_type ?? []
  const eventTypes = ontology?.event_types ?? []

  return (
    <div className="panel-body assets-panel">
      {/* 概览统计卡 */}
      <section className="assets-section">
        <h3 className="assets-section-title">数据概览</h3>
        <div className="assets-stats-grid">
          <StatCard label="事实数值" value={stats.facts} unit="条" tone="red" />
          <StatCard label="覆盖周数" value={stats.weeks} unit="周" tone="gray" />
          <StatCard label="时间线事件" value={stats.events} unit="条" tone="gray" />
          <StatCard label="决策记录" value={stats.decisions} unit="条" tone="gray" />
          <StatCard label="待核事实" value={stats.pending_candidates} unit="条" tone={stats.pending_candidates > 0 ? 'warn' : 'gray'} />
          <StatCard label="建议数" value={stats.recommendations} unit="条" tone="gray" />
          <StatCard label="行动数" value={stats.actions} unit="条" tone="gray" />
          <StatCard label="结果数" value={stats.outcomes} unit="条" tone="gray" />
        </div>
      </section>

      {/* LLM 接通状态 */}
      <section className="assets-section">
        <h3 className="assets-section-title">大语言模型接通状态</h3>
        <div className="assets-llm-status">
          <div className="assets-llm-row">
            <span className="assets-llm-label">问数 LLM</span>
            {health.llm_ask_enabled ? (
              <Badge tone="green">已接通</Badge>
            ) : (
              <Badge tone="red">未接通</Badge>
            )}
            <span className="assets-llm-model mono">{health.llm_model ?? '—'}</span>
          </div>
          {health.llm && !health.llm.ready && (
            <div className="assets-llm-detail">
              <p className="assets-llm-reason">{health.llm.reason}</p>
              <p className="assets-llm-hint">{health.llm.hint}</p>
            </div>
          )}
          {health.config_warnings && health.config_warnings.length > 0 && (
            <ul className="assets-warnings">
              {health.config_warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      </section>

      {/* 指标清单 */}
      <section className="assets-section">
        <h3 className="assets-section-title">已登记指标（{metricEntries.length}）</h3>
        <div className="assets-metric-list">
          {metricEntries.map(([key, m]) => (
            <div className="assets-metric-card" key={key}>
              <div className="assets-metric-head">
                <span className="assets-metric-name">{key}</span>
                <span className="assets-metric-unit mono">{m.unit}</span>
              </div>
              <div className="assets-metric-meta">
                <span>聚合: {m.aggregation}</span>
                <span>变化: {m.delta_kind}</span>
              </div>
              {m.aliases.length > 0 && (
                <div className="assets-metric-aliases">
                  别名: {m.aliases.join('、')}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 维度 */}
      <section className="assets-section">
        <h3 className="assets-section-title">数据维度</h3>
        <div className="assets-dims">
          <div className="assets-dim-group">
            <span className="assets-dim-label">品类（{categories.length}）</span>
            <div className="assets-dim-tags">
              {categories.map((c) => <span className="tag" key={c}>{c}</span>)}
            </div>
          </div>
          <div className="assets-dim-group">
            <span className="assets-dim-label">商户类型（{merchants.length}）</span>
            <div className="assets-dim-tags">
              {merchants.map((m) => <span className="tag" key={m}>{m}</span>)}
            </div>
          </div>
          {eventTypes.length > 0 && (
            <div className="assets-dim-group">
              <span className="assets-dim-label">事件类型（{eventTypes.length}）</span>
              <div className="assets-dim-tags">
                {eventTypes.map((e) => <span className="tag" key={e}>{e}</span>)}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 周报列表 */}
      <section className="assets-section">
        <h3 className="assets-section-title">周报列表（{docs.length}）</h3>
        <div className="qa-table-wrap">
          <table className="mini-table">
            <thead>
              <tr>
                <th>周次</th>
                <th>标题</th>
                <th>版本</th>
                <th>导入状态</th>
                <th>导入时间</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.doc_id}>
                  <td className="mono">{d.week_label ?? '—'}</td>
                  <td>{d.title}</td>
                  <td className="mono">v{d.doc_version}</td>
                  <td>
                    <Badge tone={d.ingest_status === 'completed' ? 'green' : 'warn'}>
                      {d.ingest_status}
                    </Badge>
                  </td>
                  <td className="mono small">{d.ingested_at?.slice(0, 19) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: string }) {
  return (
    <div className={`stat-card stat-card-${tone}`}>
      <div className="stat-card-value mono">{value.toLocaleString('zh-CN')}</div>
      <div className="stat-card-label">{label}<span className="stat-card-unit">{unit}</span></div>
    </div>
  )
}
