import { getUserById, updateHomeworkCalendarColorId, upsertUserByGoogleSubjectId } from '../../data/users'
import type { User } from '../../data/schema'

// Mutatie-ownership-regel (Consistency Conventions), hier op User toegepast:
// route-handlers roepen nooit rechtstreeks server/data/ aan.
export interface LoginWithGoogleInput {
  googleSubjectId: string
  calendarAccessToken: string
  calendarRefreshToken: string
  hasCalendarWriteScope: boolean
}

export async function loginWithGoogle(input: LoginWithGoogleInput): Promise<User> {
  return upsertUserByGoogleSubjectId(input)
}

export interface SetHomeworkCalendarColorResult {
  colorId: number
  needsReconsent: boolean
}

// Kleur is verplicht (productbeslissing Hillebrand, 2026-08-01 — keert de oorspronkelijke
// "Verplicht: Nee" uit de UX-spec/AC #1 om, zie de story's Change Log). `colorId` is dus
// altijd een geheel getal 1-11, nooit `null` — wissen kan niet meer via dit pad. De kolom
// zelf (`homeworkCalendarColorId`) blijft nullable in het schema: dat vertegenwoordigt nu
// uitsluitend de korte, voorbijgaande toestand vóórdat een gebruiker deze pagina voor het
// eerst bezoekt, niet een actieve keuze om geen kleur te hebben.
//
// Hier ondergebracht (niet in een nieuwe server/domain/settings/) omdat het puur een
// User-veldmutatie is, net als loginWithGoogle hierboven — geen calendar-sync-aanroep,
// dus geen reden om het bij server/domain/calendar-sync/ te zetten (Task 3).
export async function setHomeworkCalendarColorFor(
  userId: string,
  colorId: number
): Promise<SetHomeworkCalendarColorResult> {
  const user = await updateHomeworkCalendarColorId(userId, colorId)

  const needsReconsent = !user.hasCalendarWriteScope

  return { colorId: user.homeworkCalendarColorId!, needsReconsent }
}

export interface HomeworkCalendarColorState {
  colorId: number | null
  hasCalendarWriteScope: boolean
}

// Voor de rehydratie bij het laden van de instellingenpagina (code review 2026-08-01) —
// `colorId` kan hier nog wél `null` zijn: dat is precies de "nog nooit bezocht"-toestand
// die de front-end moet onderscheiden van "heeft al gekozen".
export async function getHomeworkCalendarColorFor(userId: string): Promise<HomeworkCalendarColorState> {
  const user = await getUserById(userId)
  return { colorId: user.homeworkCalendarColorId, hasCalendarWriteScope: Boolean(user.hasCalendarWriteScope) }
}
