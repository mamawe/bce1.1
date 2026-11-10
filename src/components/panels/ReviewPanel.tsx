import { useCallback, useEffect, useState } from 'react'
import type { Candidate, DocContext, QualityIssue } from '../../types'
import { api, parseJson } from '../../api'
import { stripMd } from '../../lib/labels'
import { Badge, Empty, Loading, Meter } from '../../ui'
import InfoMark from '../InfoMark'

interface Props {
  ctx: DocContext | null
  canApprove: boolean
  onChanged: () => void
  notify: (tone: 'ok' | 'err' | 'info', msg: string) => void
}

interface Payload {
  metric?: string
  category?: string
  merchant_type?: string | null
  value?: number
  unit?: string | null
  source_quote?: string | null
  reason?: string
  wow?: Record<string, number | null>
}

const ISSUE_LABEL: Record<string, string> = {
  extraction_error: '抽取/列映射错误',
  report_internal_inconsistency: '周报本期·上期·环比自相矛盾',
  prior_value_mismatch: '报告上期值与库内上周值不符',
  definition_change_suspected: '疑似口径变更',
  data_error_suspected: '疑似数据错误',
}

const REASON_DETAIL: Record<string, string> = {
  extraction_error: '模型或规则在抽取表格数值时，列映射出现错位——可能将「环比」列读成了「上期值」列，或把商户维度的数据归到了品类维度。需要人工核对原文表格列头与抽取结果是否一致。',
  report_internal_inconsistency: '同一条记录里，本期值、上期值与环比三个数字自相矛盾——例如本期值减上期值不等于报告所写的环比变化量。可能是原文排版导致数字错行，或编制时手动计算有误。需要回查原文确认正确数值。',
  prior_value_mismatch: '本周报中引用的「上期值」与上周入库的真实值不一致——可能是上周数据后续被修正了、或本周报在编制时引用了尚未更新的中间数据。需要确认以哪一版为准。',
  definition_change_suspected: '环比变化幅度超过了指标展示精度对应的容差范围，疑似统计口径在本期发生了变更（如品类范围调整、统计方法变更）。需要确认是否确实发生了口径变更，以及从哪一周起生效。',
  data_error_suspected: '数值落在了该指标的异常区间（如损耗率突然翻倍、GMV 暴跌），且没有对应的事件或决策记录可以解释这一变化。可能是录入错误或单位混淆。',
}

const LOW_CONFIDENCE_REASONS: string[] = [
  '抽取置信度不足：模型对该数值的抽取结果不确定（低于 0.7），可能是原文表格排版复杂或单元格内容模糊。',
  '口径匹配不确定：该数值无法与本体中已登记的指标定义完全匹配，可能存在指标名称歧义。',
  '单位识别不确定：数值的单位标注不明确，可能是「万元」与「元」、或「%」与「pp」之间的混淆。',
  '环比无法复算：缺少上期值或上期值本身也在待核中，无法完成闭环校验。',
]

const num = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(2).replace(/\.00$/, ''))

export default function ReviewPanel({ ctx, canApprove, onChanged, notify }: Props) {
  const [issues, setIssues] = useState<QualityIssue[]>([])
  const [busy, setBusy] = useState(true)
  const candidates: Candidate[] = ctx?.candidates ?? []

  const refresh = useCallback(async () => {
    const r = await api.qualityIssues('open')
    setIssues(r.rows)
  }, [])

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    refresh().catch(() => { if (!cancelled) setIssues([]) }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [refresh])

  async function decide(c: Candidate, action: 'accept' | 'reject') {
    try {
      await api.adjudicate(c.candidate_id, action)
      notify('ok', action === 'accept' ? '已采纳为正式事实' : '已驳回，保留在待核记录中')
      onChanged()
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e))
    }
  }

  async function resolve(issue: QualityIssue, resolution: string) {
    let effective_from = ''
    if (resolution === 'definition_change_confirmed') {
      const got = window.prompt('口径从哪一周开始生效？（历史不会被重写，只从该周起分段）', issue.week_label)
      if (!got) return
      effective_from = got
    }
    try {
      const r = await api.resolveIssue(issue.issue_id, { resolution, effective_from })
      if (resolution === 'definition_change_confirmed') {
        notify('ok', `已确认口径变更，${r.facts_tagged} 条事实打上口径标签，趋势图在此断开`)
      } else {
        notify('ok', resolution === 'false_positive' ? '已标记为假阳性，数据未改动' : '已确认并记录处理结果')
      }
      await refresh()
      onChanged()
    } catch (e) {
      notify('err', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="panel-body">
      <section className="rv-block">
        <div className="rv-head">
          <div className="rv-count">
            <span className="big mono">{candidates.length}</span>
            <span className="muted">条待核数值</span>
          </div>
          {!canApprove && <Badge tone="amber">当前身份只读</Badge>}
        </div>

        {candidates.length === 0 ? (
          <Empty>本周所有入库数值都通过了闭世界校验（口径、单位、品类白名单、环比复算、GMV 闭合）。校验不过或置信度不足的会停在这里等人裁决，不会污染事实表。</Empty>
        ) : candidates.map((c) => {
          const p = parseJson<Payload>(c.payload_json, {})
          const wow = p.wow
          return (
            <div className="rv-card" key={c.candidate_id}>
              <div className="rv-card-head">
                <span className="rv-title">
                  {p.category ?? '—'} · {p.metric ?? '—'}
                  {p.merchant_type ? ` · ${p.merchant_type}` : ''}
                </span>
                <span className="mono num">{num(p.value)}{p.unit ?? ''}</span>
              </div>
              <p className="rv-reason">
                {ISSUE_LABEL[p.reason ?? ''] ?? p.reason ?? '置信度不足'}
                <InfoMark
                  title="执行度低的具体原因"
                  lines={
                    p.reason && REASON_DETAIL[p.reason]
                      ? [REASON_DETAIL[p.reason]]
                      : c.confidence < 0.7
                        ? [`置信度 ${c.confidence.toFixed(2)}，低于 0.7 的采纳阈值。`, ...LOW_CONFIDENCE_REASONS]
                        : ['该数值未能通过闭世界校验的某一项检查，但具体原因未被归类为已知的五种异常类型。']
                  }
                />
              </p>
              {wow && Object.keys(wow).length > 0 && (
                <div className="wow-grid mono">
                  <span>报告环比</span><b>{num(wow.reported)}</b>
                  <span>重算环比</span><b>{num(wow.computed_stored)}</b>
                  <span>差异</span><b>{num(wow.diff)}</b>
                  <span>容差</span><b>{num(wow.tolerance)}</b>
                </div>
              )}
              {p.source_quote && <blockquote>{stripMd(p.source_quote)}</blockquote>}
              <div className="rv-confidence">
                <span className="eyebrow">置信度</span>
                <Meter value={c.confidence} tone={c.confidence >= 0.7 ? 'cyan' : 'amber'} />
              </div>
              <div className="rv-actions">
                <button type="button" className="btn small primary" disabled={!canApprove} onClick={() => decide(c, 'accept')}>采纳</button>
                <button type="button" className="btn small" disabled={!canApprove} onClick={() => decide(c, 'reject')}>驳回</button>
              </div>
            </div>
          )
        })}
      </section>

      <section className="rv-block">
        <div className="rv-head">
          <div className="rv-count">
            <span className="big mono">{issues.length}</span>
            <span className="muted">条口径与环比异常</span>
          </div>
        </div>

        {busy && <Loading label="载入检测结果" />}

        {!busy && issues.length === 0 && (
          <Empty>
            三角校验没有发现异常：每条带环比的事实都同时用「本期值 vs 报告上期值」和「本期值 vs 库内上周值」验算过，
            容差按指标的展示精度分档，四舍五入噪声不会进这里。
          </Empty>
        )}

        {issues.map((iss) => (
          <div className={`dq-card dq-${iss.severity}`} key={iss.issue_id}>
            <div className="rv-card-head">
              <span className="rv-title">
                {iss.category ?? '—'} · {iss.metric_name}
                <span className="muted"> · {iss.week_label}</span>
              </span>
              <Badge tone={iss.severity === 'high' ? 'red' : 'amber'}>
                {ISSUE_LABEL[iss.issue_type] ?? iss.issue_type}
              </Badge>
            </div>

            <div className="wow-grid mono">
              <span>本期值</span><b>{num(iss.current_value)}</b>
              <span>上期值(报告)</span><b>{num(iss.prev_reported)}</b>
              <span>上期值(库)</span><b>{num(iss.prev_stored)}</b>
              <span>报告环比</span><b>{num(iss.reported_wow)}</b>
              <span>重算(报告)</span><b>{num(iss.computed_wow_reported)}</b>
              <span>重算(库)</span><b>{num(iss.computed_wow_stored)}</b>
              <span>差异</span><b>{num(iss.diff_stored ?? iss.diff_reported)}</b>
              <span>容差</span><b>{num(iss.tolerance)}</b>
            </div>

            <div className="dq-signals">
              <span className="mono muted">口径类型 {iss.delta_kind === 'pp' ? '率类(pp)' : '量类(%)'}</span>
              {iss.text_signal && <Badge tone="violet">文本信号：{iss.text_signal}</Badge>}
            </div>

            {(() => {
              const ev = parseJson<{ source_row?: { raw?: string } }>(iss.evidence_json, {})
              return ev.source_row?.raw ? <blockquote>{ev.source_row.raw}</blockquote> : null
            })()}

            <div className="rv-actions">
              <button
                type="button"
                className="btn small primary"
                disabled={!canApprove}
                onClick={() => resolve(iss, 'definition_change_confirmed')}
              >确认口径变更</button>
              <button
                type="button"
                className="btn small"
                disabled={!canApprove}
                onClick={() => resolve(iss, 'data_error_confirmed')}
              >确认数据错误</button>
              <button
                type="button"
                className="btn small"
                disabled={!canApprove}
                onClick={() => resolve(iss, 'false_positive')}
              >判为假阳性</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
