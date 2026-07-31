import { getWeekPattern } from '../../domain/availability/week-pattern'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const pattern = await getWeekPattern(user.id)
  return { pattern }
})
