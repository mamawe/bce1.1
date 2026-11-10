/** 离线模式下的当前身份同步入口，由 App 在切换身份时调用。 */
import { USERS } from './mock-data'
import type { User } from './types'

let mockUser: User = USERS.admin

export function setMockUser(id: string): User {
  mockUser = USERS[id] ?? USERS.admin
  return mockUser
}

export function getMockUser(): User {
  return mockUser
}
