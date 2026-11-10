import { useState } from 'react'

/** 顶部演示声明条：先说清哪些是真、哪些是演示，再让人往下点。
 *  只在离线演示站使用，真实系统不挂这条。 */
export default function DemoBanner() {
  const [open, setOpen] = useState(false)
  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-tag">离线演示</span>
      <span className="demo-banner-text">
        数据是打包时内嵌的快照，不连后端、不调模型；导入、审批、状态推进等写操作只在内存里生效。
      </span>
      <button type="button" className="demo-banner-btn" onClick={() => setOpen((v) => !v)}>
        {open ? '收起' : '看边界'}
      </button>
      {open && (
        <ul className="demo-banner-list">
          <li>保留：周报阅读、业务上下文、指标趋势、数据证据、待核事实、智能问答的完整交互</li>
          <li>问答：答案来自预置样本，徽章标「离线演示 · 预置答案」；SQL 与结果表是同一组列，但不会真的执行</li>
          <li>mock：导入周报、事实裁决、建议审批、行动状态推进、结果评估只在内存中生效，刷新即还原</li>
          <li>身份与主题切换可用：它们只影响前端展示，不写库</li>
        </ul>
      )}
    </div>
  )
}
