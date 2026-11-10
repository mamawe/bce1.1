import { MOCK_QUESTIONS } from './mock-data'
import type { AskResponse } from './types'

/** 离线问数预置回答索引。保留完整答案、结果行、SQL、证据、思考路径与追问。 */
export const MOCK_QUESTION_ANSWERS: AskResponse[] = MOCK_QUESTIONS

export const MOCK_QUESTION_INDEX = Object.fromEntries(
  MOCK_QUESTIONS.map((answer, index) => [String(index), answer.question_type]),
)

export function getMockQuestionAnswers() {
  return MOCK_QUESTIONS.map((answer) => ({
    question_type: answer.question_type,
    answer: answer.answer,
    rows: answer.rows.length,
    sql: !!answer.sql,
    evidence: answer.evidence.length,
    confidence: answer.confidence,
    follow_ups: answer.follow_ups ?? [],
  }))
}
