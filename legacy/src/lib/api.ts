import { askStreamMock, askRerunMock, mockApi } from './mock-api'

/** 只读快照数据源：静态站里所有 GET 都从这里取，返回 Promise，组件无需改动 */
export const api = mockApi

/** 问答流式接口的本地实现：逐片吐字，行为与后端 SSE 一致 */
export const askStream = askStreamMock

/** 槽位重跑的本地实现：根据 slot 变化动态生成对应周数的数据 */
export const askRerun = askRerunMock
