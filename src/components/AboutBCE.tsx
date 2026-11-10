import { useEffect } from 'react'

interface Props {
  onClose: () => void
}

const LETTERS = [
  {
    letter: '周', word: '周报',
    desc: '只收周报正文里的经营信息：指标、事件、归因、决策。排版和寒暄不进系统。',
  },
  {
    letter: '数', word: '数据',
    desc: '数字必须带坐标：哪个品类、哪一周、谁做的决定、原文在哪。',
  },
  {
    letter: '助', word: '助手',
    desc: '可复算的回答：入库有固定步骤，问答有固定路径，事实与推断分开。',
  },
]

const V11 = [
  {
    head: '只认业务语言表里有的东西',
    body: '品类、指标、商户类型、事件类型都写在一份本体定义里。正文出现表里没有的口径，不会自动当成新指标收进来。',
  },
  {
    head: '环比由系统复算，不采信自报',
    body: '周报写「+0.3%」时，系统按上周数值自己算一遍。对不上就转人工，而不是照抄一个可能算错的数。',
  },
  {
    head: '哪一期哪一周，写清楚',
    body: '周报必须能确定 ISO 年份与周次。定不出来就拒绝入库，不会默认猜一个年份，把数据挂到错误的时间点上。',
  },
  {
    head: '建议要有人拍板，结果要回头看',
    body: '系统给建议和依据，采纳与否由人决定；行动完成后用下一周的真实数值判断有没有达成，达不成或证据不足都如实标注。',
  },
]

const LIMITS = [
  '不做全文检索。原文能看，但答案优先走结构化数据。',
  '不替你下结论。校验不过的数据不自动裁决，进待核队列等人确认。',
  '不猜数据。指标缺口就显示缺口，不用模型生成数字。',
]

export default function AboutBCE({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="about" role="dialog" aria-modal="true" aria-label="关于周报数据助手">
      <header className="about-bar">
        <div className="about-bar-left">
          <span className="about-bar-mark">周报数据助手</span>
          <span className="muted">产品说明</span>
        </div>
        <button type="button" className="btn" onClick={onClose}>返回工作台</button>
      </header>

      <div className="about-scroll">
        <p className="about-kicker">Weekly Report Assistant</p>
        <h1 className="about-title">
          一份周报读完就完了。
          <br />
          周报数据助手让它可以被追问。
        </h1>
        <p className="about-lede">
          读周报时，它把指标、事件、归因、决策拆开，各自挂到品类、时间、责任人和来源段落上。
          之后你问「蔬菜客单价为什么连续往下走」，它给出数值、找出对应事件，并指出这句话出自哪一期哪一节。
          没被核验过的数字，它不会拿来当答案。
        </p>

        <div className="about-legend">
          {LETTERS.map((l) => (
            <div className="about-legend-item" key={l.letter}>
              <span className="about-legend-letter">{l.letter}</span>
              <span className="about-legend-word">{l.word}</span>
              <span className="about-legend-desc">{l.desc}</span>
            </div>
          ))}
        </div>

        <section className="about-sec">
          <h2>1.1 比 1.0 硬在哪</h2>
          <p>同一套读周报的动作，四条规则改成不可绕过。</p>
          <div className="about-cards">
            {V11.map((c) => (
              <div className="about-card" key={c.head}>
                <h3>{c.head}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="about-sec">
          <h2>它不做什么</h2>
          <div className="about-limits">
            {LIMITS.map((t) => <p key={t}>{t}</p>)}
          </div>
        </section>

        <footer className="about-foot">
          <span>演示数据：2026 W20–W35 共 16 期周报 · 十大品类 · 五类商户</span>
          <span>口径以周报附录为准</span>
        </footer>
      </div>
    </div>
  )
}
