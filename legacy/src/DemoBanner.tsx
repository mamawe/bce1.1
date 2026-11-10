import { useState } from 'react'

/** 顶部的一根演示声明条：告诉看见这个站的人哪些功能是假的 */
export default function DemoBanner() {
  const [open, setOpen] = useState(false)
  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-tag">静态演示</span>
      <span className="demo-banner-text">数据是打包时抓的快照；导入、审批、状态推进等写操作已改为 mock 或关闭。</span>
      <button type="button" className="demo-banner-btn" onClick={() => setOpen((v) => !v)}>
        {open ? '收起' : '看边界'}
      </button>
      {open && (
        <ul className="demo-banner-list">
          <li>保留：周报阅读、业务上下文面板、指标趋势图、智能问答（预置问法）、数据证据、待核事实展示</li>
          <li>mock：智能问答对未预置的问题只回一条"演示边界"说明，不编造数字</li>
          <li>关闭：导入周报、事实裁决、建议审批、行动状态推进、结果评估、数据质量处理</li>
          <li>身份切换与主题切换仍然可用：它们只影响前端展示，不写库</li>
        </ul>
      )}
    </div>
  )
}
