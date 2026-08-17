import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Weekday } from '../../shared/types/availability'
import type { Difficulty, Priority, SubtaskStatus, TaskType } from '../../shared/types/tasks'

export type { Weekday }
export type { Difficulty, Priority, SubtaskStatus, TaskType }

// Geen wachtwoordveld (AD-2) — User is 1:1 aan een Google-account gekoppeld
// via de OAuth-subject-id, dat is de enige identiteit.
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  googleSubjectId: text('google_subject_id').notNull().unique(),
  calendarAccessToken: text('calendar_access_token').notNull(),
  calendarRefreshToken: text('calendar_refresh_token').notNull(),
  // Google's `colorId` (1-11), nullable — "leeg laten" betekent geen sync, Flowz blijft
  // alleen-lezend (Story 2.3 AC #4). Bewust op `users`, niet op `availableTimePatterns`:
  // de write-sync-service heeft dit samen met de tokens en de scope-vlag hieronder in één
  // aanroep nodig, en die tokens staan al hier — één lookup i.p.v. een join over twee
  // tabellen. UI-co-locatie op dezelfde instellingenpagina hoeft de DB-co-locatie niet te
  // dicteren (Story 2.3 Dev Notes).
  homeworkCalendarColorId: integer('homework_calendar_color_id'),
  // SQLite kent geen echt boolean-type; integer 0/1 is dit projects eerste zo'n geval.
  // Afgeleid uit de daadwerkelijk door Google toegekende `tokens.scope` bij login/
  // her-consent (Story 2.3) — nooit uit wat er slechts is aangevraagd.
  hasCalendarWriteScope: integer('has_calendar_write_scope').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// `Weekday` komt uit shared/types/availability.d.ts (code review Story 2.1 — voorheen
// hier gedefinieerd en losstaand in `app/` gedupliceerd; nu één bron voor beide kanten).
// Engelse sleutels, ook al is de UI Nederlands — consistent met hoe dit project Google's
// technische begrippen al Engels/technisch houdt terwijl de UI Nederlands blijft.
export const WEEKDAYS: readonly Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// Eén rij per user (User 1:1, letterlijk), zeven kolommen — geen aparte rij per weekdag.
// Zie Story 2.1 Dev Notes voor de argumentatie tegen een User-1:N-tabel.
export const availableTimePatterns = sqliteTable('available_time_patterns', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Verwijst naar users.id (code review Story 2.1 — ontbrak eerst, liet wees-rijen
  // achter bij het verwijderen van een User).
  userId: text('user_id').notNull().unique().references(() => users.id),
  monday: integer('monday').notNull().default(0),
  tuesday: integer('tuesday').notNull().default(0),
  wednesday: integer('wednesday').notNull().default(0),
  thursday: integer('thursday').notNull().default(0),
  friday: integer('friday').notNull().default(0),
  saturday: integer('saturday').notNull().default(0),
  sunday: integer('sunday').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type AvailableTimePattern = typeof availableTimePatterns.$inferSelect
export type NewAvailableTimePattern = typeof availableTimePatterns.$inferInsert

// User 1:N — dit staat letterlijk zo in de architectuur (epics.md: "User 1:1
// AvailableTimePattern, User 1:N AvailableTimeException"), geen eigen interpretatie
// nodig zoals bij AvailableTimePattern in Story 2.1. Eén rij per (user, datum).
// FK vanaf het begin (Story 2.1-les: dit ontbrak daar aanvankelijk en was een
// reviewbevinding — hier meteen goed).
export const availableTimeExceptions = sqliteTable('available_time_exceptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  // ISO-datum (YYYY-MM-DD), UTC — Consistency Conventions. Geen tijdcomponent nodig,
  // een exceptie geldt voor een hele kalenderdag.
  date: text('date').notNull(),
  minutes: integer('minutes').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
}, table => [
  uniqueIndex('available_time_exceptions_user_date_unique').on(table.userId, table.date)
])

export type AvailableTimeException = typeof availableTimeExceptions.$inferSelect
export type NewAvailableTimeException = typeof availableTimeExceptions.$inferInsert

// `TaskType`/`Difficulty`/`Priority` komen uit shared/types/tasks.d.ts (zelfde patroon
// als `Weekday` hierboven) — Nederlandse waarden, rechtstreeks traceerbaar naar de
// PRD/UX-spec se eigen terminologie (Consistency Conventions: "PRD-termen blijven
// ongewijzigd als code-namen").
export const TASK_TYPES: readonly TaskType[] = ['proefwerk', 'so', 'opdracht', 'po']
export const DIFFICULTY_LEVELS: readonly Difficulty[] = ['laag', 'gemiddeld', 'hoog']
export const PRIORITY_LEVELS: readonly Priority[] = ['laag', 'gemiddeld', 'hoog']

// Eerste echte inhoud van server/domain/tasks/ + scheduling/ (Story 3.1) — de Structural
// Seed reserveerde beide mappen al sinds Story 1.1.
//
// `totalMinutes` bestaat al vanaf déze story (niet pas bij Story 3.2, die de deeltaken-UI
// bouwt): de doelmoment-bufferformule (FR24) heeft nu al een waarde nodig om mee te
// rekenen. Bij het aanmaken = `defaultSessionDuration` (één impliciete sessie, er zijn nog
// geen deeltaken); Story 3.2 herberekent dit veld later via de deeltaken-som/handmatige
// override. Voorkomt een tweede migratie op dezelfde tabel voor hetzelfde concept
// (Story 3.1 Dev Notes, Open Question — Hillebrand kan dit nog terugdraaien vóór 3.2).
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  // Geen aparte "Vak"-tabel — de architectuur se datamodel-lijst kent geen Subject-entiteit.
  // De combo-select's suggestielijst komt uit een DISTINCT-query over deze user's eigen
  // taken (server/api/tasks/subjects.get.ts), niet uit een foreign key.
  subject: text('subject').notNull(),
  title: text('title').notNull(),
  type: text('type').$type<TaskType>().notNull(),
  // ISO-datum (YYYY-MM-DD), UTC — zelfde vorm als `availableTimeExceptions.date`, geen
  // tijdcomponent (een deadline is een hele kalenderdag, geen tijdstip).
  deadline: text('deadline').notNull(),
  difficulty: text('difficulty').$type<Difficulty>().notNull().default('gemiddeld'),
  priority: text('priority').$type<Priority>().notNull().default('gemiddeld'),
  defaultSessionDuration: integer('default_session_duration').notNull(),
  totalMinutes: integer('total_minutes').notNull(),
  description: text('description'),
  // Story 3.3 — JSON-array van strings, geen aparte "Need"-tabel (de architectuur se
  // datamodel-lijst kent geen eigen entiteit hiervoor, zelfde redenering als `subject`
  // hierboven). Eerste JSON-getypeerde kolom in dit project; Drizzle's `{ mode: 'json' }`
  // serialiseert/deserialiseert automatisch. `.default([])` is hier — in tegenstelling tot
  // `totalMinutes`/`defaultSessionDuration` hierboven — wél nodig: die kolommen hoorden bij
  // de oorspronkelijke `CREATE TABLE`, deze komt via een latere `ALTER TABLE ADD COLUMN`
  // op een tabel die al rijen kan bevatten, en SQLite staat `NOT NULL` zonder non-null
  // `DEFAULT` daar niet voor toe (zelfde reden als `hasCalendarWriteScope`.default(0)
  // hierboven).
  needs: text('needs', { mode: 'json' }).$type<string[]>().notNull().default([]),
  // Story 4.7 — nullable ISO-timestamp, `null` = nog openstaand, gezet = definitief klaar
  // (resterende tijd 0 op 1.4-sessie-afronden). Taak/sessie/deeltaken blijven daarna gewoon
  // bestaan als historisch record (gepland-vs-besteed, met het oog op een toekomstige
  // adaptieve-tijdschatting-functie, architectuur se Deferred-sectie) — dit veld is puur een
  // filter, geen verwijdering. Zelfde vorm/precedent als `sessions.stoppedAt`.
  completedAt: text('completed_at'),
  // Story 6.2 — nullable ISO-timestamp, `null` = niet vervallen, gezet = bewust laten
  // vervallen via de tekort-escalatieketen (niveau 4, "Belangrijk"-sectie/Dev Notes
  // "Vervallen-model"). Semantisch strikt gescheiden van `completedAt`: "vervallen" is
  // nooit uitgevoerd (geen bestede tijd, geen `sessionLogs`-rij), "afgerond" is succesvol
  // gedaan — een toekomstige adaptieve-tijdschatting-functie mag vervallen taken niet als
  // betrouwbare gepland-vs-besteed-data meetellen. Zelfde "geen verwijdering, puur een
  // filter-veld"-precedent als `completedAt` zelf.
  droppedAt: text('dropped_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

// Task 1:N Session (AD-3) — de planning zelf blijft een berekende weergave, deze tabel is
// alleen de opgeslagen geplande sessie, geen losse "planning"-tabel. Deze rij wordt bij
// elke herberekening hergebruikt/verplaatst (Story 3.5's `updateSessionPlacement`), nooit
// verwijderd-en-opnieuw-aangemaakt — daarom staat de "werkelijk bestede tijd" NIET hier
// (zou bij elke volgende sessie op déze taak overschreven worden), maar in `sessionLogs`
// hieronder (Story 4.7, review-patch: één rij per échte werksessie i.p.v. één overschreven
// kolom).
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text('task_id').notNull().references(() => tasks.id),
  // ISO 8601 UTC datetime (Consistency Conventions) — bewust een tijdstip, niet alleen
  // een datum: de Calendar-sync-aanroep (Story 2.3's createHomeworkEvent) heeft een
  // concreet start-/eindtijdstip nodig. Vast lokaal ankertijdstip 16:00 Europe/Amsterdam,
  // opeenvolgend gestapeld bij meerdere sessies op dezelfde dag (Story 3.1 Dev Notes
  // "Sessie-tijdstip", afgestemd met Hillebrand 2026-08-01).
  startsAt: text('starts_at').notNull(),
  plannedMinutes: integer('planned_minutes').notNull(),
  // Story 3.5 — Google's event-ID, nodig om een bestaand Calendar-event via
  // `updateHomeworkEvent` bij te werken i.p.v. bij elke herberekening een duplicaat aan te
  // maken. Nullable, geen DB-default nodig (een `ALTER TABLE ADD COLUMN` zonder `NOT NULL`
  // stelt geen non-null-default-eis, in tegenstelling tot Story 3.3's `needs`-kolom):
  // bestaande sessies vóór deze migratie, en sessies aangemaakt zonder actieve Calendar-
  // write-scope/kleur, hebben 'm simpelweg niet.
  googleEventId: text('google_event_id'),
  // Story 4.5 — server-side bewijs-van-activiteit voor de wegnavigeer-bescherming. Nullable,
  // zelfde reden als `googleEventId` hierboven: geen DB-default nodig, bestaande sessies
  // hebben 'm simpelweg niet. `lastHeartbeatAt` wordt periodiek bijgewerkt zolang de sessie
  // actief (niet gepauzeerd) is; `stoppedAt` wordt precies één keer gezet bij een expliciet
  // stop-signaal (Stop-knop, leave-confirm-modal, of `beforeunload`/`sendBeacon`).
  lastHeartbeatAt: text('last_heartbeat_at'),
  stoppedAt: text('stopped_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

// Story 4.7 (review-patch) — één rij per échte werksessie, onafhankelijk van `sessions`'
// "precies 1 sessie-rij per taak, hergebruikt bij elke herberekening"-model. Voorkomt dat
// een taak die meer dan één werksessie nodig heeft de `actualMinutes` van eerdere sessies
// stilzwijgend verliest — nodig voor een toekomstige adaptieve-tijdschatting-functie
// (architectuur se Deferred-sectie), precies de reden waarom afgeronde taken niet
// verwijderd worden (zie `tasks.completedAt`). Puur een logtabel, geen mutatie-doel voor
// scheduling zelf (AD-1) — `recalculateTaskPlanning` leest hier nooit uit.
export const sessionLogs = sqliteTable('session_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text('task_id').notNull().references(() => tasks.id),
  actualMinutes: integer('actual_minutes').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type SessionLog = typeof sessionLogs.$inferSelect
export type NewSessionLog = typeof sessionLogs.$inferInsert

// Task 1:N Subtask (AD-3) — telt mee als scheduling-input via `tasks.totalMinutes` (Story
// 3.2). Geen `status`-kolom nu (Niet gestart/Uitgesteld/Afgerond, nodig voor Epic 4/Story
// 5.3) — zelfde redenering als hierboven: niet vooruitbouwen op een nog niet geanalyseerde
// behoefte, een latere migratie is goedkoop. `name` is altijd
// gevuld: een rij zonder (getrimde) naam wordt vóór opslag weggefilterd (server-side, zie
// server/api/tasks.post.ts), nooit als lege `Subtask`-rij gepersisteerd.
export const subtasks = sqliteTable('subtasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text('task_id').notNull().references(() => tasks.id),
  name: text('name').notNull(),
  minutes: integer('minutes'),
  // Story 5.1 — al aangekondigd in dit tabel-commentaar sinds Story 3.2 ("nodig voor Epic
  // 4/Story 5.3"), nu vervroegd nodig voor 5.1's takenoverzicht-voortgangsbalkje (koude
  // paginalaad, geen actieve sessie om uit te lezen). `.default('niet-gestart')` nodig
  // (zelfde reden als `needs`/`hasCalendarWriteScope`): bestaande rijen vóór deze migratie
  // moeten alsnog een geldige waarde krijgen.
  status: text('status').$type<SubtaskStatus>().notNull().default('niet-gestart'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
})

export type Subtask = typeof subtasks.$inferSelect
export type NewSubtask = typeof subtasks.$inferInsert
