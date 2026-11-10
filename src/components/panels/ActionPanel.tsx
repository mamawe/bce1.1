import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, parseJson } from '../../api'
import { actionLabel, impactLabel, stripMd } from '../../lib/labels'
import type { ActionRow, ActionStats, DocContext, Outcome, Recommendation } from '../../types'
import { Badge, Empty, Loading, Meter } from '../../ui'
import InfoMark from '../InfoMark'

interface Props {
  ctx: DocContext | null
  latestWeek: string | null
  canApprove: boolean
  onChanged: () => void
  notify: (tone: 'ok' | 'err' | 'info', msg: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  proposed: '待审批',
  approved: '已采纳',
  rejected: '已否决',
  planned: '已排期',
  in_progress: '执行中',
  completed: '已完成',
  abandoned: '已放弃',
}

const NEXT_STATUS: Record<string, string> = {
  planned: 'in_progress',
  in_progress: 'completed',
}

/** 决策过程描述：建议是从哪来的、依据什么生成的、置信度如何 */
const DECISION_PROCESS: Record<string, string[]> = {
  promotion: [
    '触发条件：该品类/商户的 GMV 或订单量连续 2 周环比下降，且降幅超过 5%。',
    '依据来源：基于已核验的事实表数据，比对最近 3 周趋势后自动生成。',
    '预期效果：通过促销活动拉升订单量，预计 GMV 回升 3%–8%。',
  ],
  operations: [
    '触发条件：运营指标（复购率、转化率）偏离近 4 周均值超过 1 个标准差。',
    '依据来源：结合事件记录与事实表交叉分析，定位到具体运营环节。',
    '预期效果：调整运营策略后，目标指标在 2 周内回归正常区间。',
  ],
  assortment: [
    '触发条件：品类宽度或 SKU 数量低于该品类历史中位数。',
    '依据来源：基于本体中已登记的指标定义与历史数据对比。',
    '预期效果：扩充品类后预计覆盖更多长尾需求，GMV 提升 2%–5%。',
  ],
  pricing: [
    '触发条件：客单价或毛利率偏离同类品类的均值超过 10%。',
    '依据来源：横向对比同维度对象的数据分布，结合成本结构分析。',
    '预期效果：价格调整后预计优化毛利结构，毛利率提升 1–3 个百分点。',
  ],
  restock: [
    '触发条件：库存周转天数超过安全阈值，或出现断货风险信号。',
    '依据来源：基于事实表中的库存相关指标与历史消耗速率推算。',
    '预期效果：补货后预计减少缺货损失，GMV 恢复至正常水平。',
  ],
  cut_waste: [
    '触发条件：损耗率或损耗成本率连续 2 周高于该品类历史 90 分位。',
    '依据来源：基于事实表中的损耗数据与事件记录中的风险信号。',
    '预期效果：实施损耗控制后预计损耗率下降 0.5–2 个百分点。',
  ],
  review: [
    '触发条件：指标出现异常波动或口径变更被确认。',
    '依据来源：三角校验发现的异常与口径断点触发复盘建议。',
    '预期效果：复盘后形成改进措施并记录到决策表，闭环跟踪执行效果。',
  ],
}

export default function ActionPanel({ ctx, latestWeek, canApprove, onChanged, notify }: Props) {
  const [actions, setActions] = useState<ActionRow[]>([])
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const [stats, setStats] = useState<ActionStats | null>(null)
  const [busy, setBusy] = useState(true)

  const recs: Recommendation[] = ctx?.recommendations ?? []

  const refresh = useCallback(async () => {
    const [a, o, s] = await Promise.all([api.actions(), api.outcomes(), api.actionStats()])
    setActions(a.rows)
    setOutcomes(o.rows)
    setStats(s)
  }, [])

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    refresh().catch((e: Error) => { if (!cancelled) notify('err', e.message) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [refresh, notify])

  const actionByRec = useMemo(() => {
    const map = new Map<string, ActionRow>()
    actions.forEach((a) => { if (a.recommendation_id) map.set(a.recommendation_id, a) })
    return map
  }, [actions])

  const outcomeByAction = useMemo(() => {
    const map = new Map<string, Outcome>()
    outcomes.forEach((o) => map.set(o.action_id, o))
    return map
  }, [outcomes])

  async function act(rec: Recommendation, kind: 'approve' | 'reject') {
    try {
      if (kind === 'approve') await api.approve(rec.recommendation_id)
      else await api.reject(rec.recommendation_id)
      notify('ok', kind === 'approve' ? '建议已采纳，行动已建立' : '建议已否决')
      await refresh()
      onChanged()
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e))
    }
  }

  async function setStatus(action: ActionRow, status: string) {
    try {
      await api.actionStatus(action.action_id, status)
      notify('info', `行动状态更新为「${STATUS_LABEL[status] ?? status}」`)
      await refresh()
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e))
    }
  }

  async function evaluate(action: ActionRow) {
    const week = window.prompt('用哪一周的数据评估结果？', latestWeek ?? '')
    if (!week) return
    try {
      const o = await api.evaluate(action.action_id, week)
      notify(o.success === 'yes' ? 'ok' : 'info', `评估完成：${o.success === 'yes' ? '达成预期' : o.success === 'inconclusive' ? '证据不足' : '未达成'}`)
      await refresh()
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="panel-body">
      {stats && (
        <div className="ac-stats">
          <div><span className="big mono">{stats.proposed}</span><em>待审批建议</em></div>
          <div><span className="big mono">{Math.round((stats.completion_rate ?? 0) * 100)}%</span><em>行动完成率</em></div>
          <div><span className="big mono">{Math.round((stats.success_rate ?? 0) * 100)}%</span><em>结果达成率</em></div>
        </div>
      )}

      {busy && <Loading label="载入行动" />}

      {!busy && recs.length === 0 && (
        <Empty>本周没有基于已核验事实生成的待办建议。</Empty>
      )}

      {recs.map((rec) => {
        const targets = parseJson<string[]>(rec.target_entities_json, [])
        const action = actionByRec.get(rec.recommendation_id)
        const outcome = action ? outcomeByAction.get(action.action_id) : null
        const impact = impactLabel(parseJson<Record<string, unknown>>(rec.expected_impact_json, {}))
        return (
          <div className="ac-card" key={rec.recommendation_id}>
            <div className="ac-head">
              <span className="ac-title">
                {actionLabel(rec.action_type)}
                {targets.length ? <span className="muted"> · {targets.join('、')}</span> : null}
              </span>
              <Badge tone={rec.status === 'proposed' ? 'amber' : rec.status === 'approved' ? 'mint' : 'neutral'}>
                {STATUS_LABEL[rec.status] ?? rec.status}
              </Badge>
            </div>
            <p className="ac-why">
              {rec.rationale}
              <InfoMark
                title="决策过程"
                lines={DECISION_PROCESS[rec.action_type] ?? [
                  '该建议由系统基于已核验的事实表数据自动生成。',
                  `建议类型：${actionLabel(rec.action_type)}`,
                  `置信度：${rec.confidence.toFixed(2)}（${rec.confidence >= 0.7 ? '较高' : '中等，建议人工复核'}）`,
                  rec.rationale ? `判定依据：${rec.rationale}` : '判定依据来自趋势分析与横向对比。',
                ]}
              />
            </p>
            {rec.source_quote && <blockquote>{stripMd(rec.source_quote)}</blockquote>}
            <div className="ac-meta mono">
              <span>负责 {rec.owner_role}</span>
              <span>风险 {rec.risk || '低'}</span>
              {impact && <span className="ac-impact">{impact}</span>}
            </div>
            <div className="ac-confidence">
              <span className="eyebrow">把握度</span>
              <Meter value={rec.confidence} tone={rec.confidence >= 0.7 ? 'cyan' : 'amber'} />
            </div>

            {rec.status === 'proposed' ? (
              <div className="ac-actions">
                <button type="button" className="btn small primary" disabled={!canApprove} onClick={() => act(rec, 'approve')}>采纳并建行动</button>
                <button type="button" className="btn small" disabled={!canApprove} onClick={() => act(rec, 'reject')}>否决</button>
                {!canApprove && <span className="muted" style={{ fontSize: 11 }}>当前身份只能查看，审批需要负责人权限</span>}
              </div>
            ) : (
              action && (
                <div className="ac-loop">
                  <div className="ac-loop-row">
                    <span className="mono muted">行动</span>
                    <span>{STATUS_LABEL[action.status] ?? action.status}</span>
                    {NEXT_STATUS[action.status] && canApprove && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setStatus(action, NEXT_STATUS[action.status])}
                      >推进到 {STATUS_LABEL[NEXT_STATUS[action.status]]}</button>
                    )}
                    {(action.status === 'completed' && !outcome) && canApprove && (
                      <button type="button" className="link-btn" onClick={() => evaluate(action)}>评估结果</button>
                    )}
                  </div>
                  {outcome && (
                    <div className="ac-outcome">
                      <Badge tone={outcome.success === 'yes' ? 'mint' : outcome.success === 'no' ? 'red' : 'amber'}>
                        {outcome.success === 'yes' ? '达成' : outcome.success === 'no' ? '未达成' : '证据不足'}
                      </Badge>
                      <span>{outcome.notes}</span>
                      <InfoMark
                        title="结果评估依据"
                        lines={[
                          outcome.success === 'yes'
                            ? '评估结论：达成预期。行动执行后，目标指标的变化方向与预期一致，且幅度落在预期区间内。'
                            : outcome.success === 'no'
                              ? '评估结论：未达成。行动执行后，目标指标的变化方向与预期不一致，或幅度未达到预期。'
                              : '评估结论：证据不足。行动执行后，相关数据不足以判定是否达成预期，可能因为数据缺失或周期不足。',
                          `评估说明：${outcome.notes || '系统自动比对行动前后指标变化，与预期效果进行对照。'}`,
                        ]}
                      />
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
