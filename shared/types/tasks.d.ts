// Gedeeld tussen `app/` en `server/` via Nuxt's `#shared`-alias, zelfde patroon als
// shared/types/availability.d.ts/settings.d.ts (Story 2.1/2.3). Eerste keer gebruikt
// voor het `tasks`-domein (Story 3.1).

export type TaskType = 'proefwerk' | 'so' | 'opdracht' | 'po'
export type Difficulty = 'laag' | 'gemiddeld' | 'hoog'
export type Priority = 'laag' | 'gemiddeld' | 'hoog'

// Story 3.2 — een rij zonder (getrimde) naam wordt server-side genegeerd, dus deze vorm
// is alleen de "kandidaat"-invoer, niet noodzakelijk wat uiteindelijk als Subtask-rij
// gepersisteerd wordt.
export interface SubtaskInput {
  name: string
  minutes: number | null
}

export interface CreateTaskInput {
  subject: string
  title: string
  type: TaskType
  // ISO-datum YYYY-MM-DD, geen tijdcomponent — zelfde vorm als AvailableTimeException.date.
  deadline: string
  difficulty: Difficulty
  priority: Priority
  defaultSessionDuration: number
  // Story 5.3 — niet langer optioneel: elke aanroeper (create-task.ts/update-task.ts) zet
  // 'm altijd expliciet op `string | null`, nooit `undefined` — voorkomt een bekende TS-
  // eigenaardigheid rond het spreaden van optionele velden (object-spread maakt een
  // optioneel veld "aanwezig maar mogelijk `undefined`", incompatibel met `string | null`).
  description: string | null
  // Story 3.2 — lege array als er geen deeltaken zijn ingevuld.
  subtasks: SubtaskInput[]
  // Story 3.2 — alleen niet-`null` als Evelien de totale-tijd-velden handmatig heeft
  // aangepast (client stuurt anders bewust `null`, zodat de server zelf de
  // deeltaken-som-of-terugval-logica toepast).
  totalMinutesOverride: number | null
  // Story 3.3 — lege array als er geen benodigdheden zijn ingevuld.
  needs: string[]
}

export interface CreateTaskResponse {
  id: string
  subject: string
  title: string
  type: TaskType
  deadline: string
  difficulty: Difficulty
  priority: Priority
  defaultSessionDuration: number
  totalMinutes: number
  description: string | null
}

export interface TaskSubjectsResponse {
  subjects: string[]
}

// Story 3.3 — databron voor `taak-needs-input`'s auto-suggestie, afgeleid server-side van
// eerdere taken voor hetzelfde vak.
export interface NeedsSuggestionsResponse {
  suggestions: string[]
}

// Story 4.1 — databron voor 1.1-Home. `nextTask` is `null` bij de Leeg-state (AC #2).
// `plannedMinutes` is de sessieduur voor déze zitting (`Session.plannedMinutes`), niet
// `totalMinutes` (de bufferformule's eigen invoer). `needs` wordt meegegeven ook al toont
// déze story ze nergens — al beschikbaar uit de toch al opgehaalde taak, en dient FR2's
// "geen nieuwe fetch bij navigatie naar 1.2" zodra Story 4.3 dat scherm bouwt.
// Story 4.2 — `session_time_check`'s drie states (UX-spec's `home-warning-banner`).
// `null` betekent "geen banner tonen": geen `nextTask` om te checken, of de Calendar-
// aanroep zelf faalde (fail-safe, AC #1).
export type SessionTimeCheck = 'ok' | 'tight' | 'unavailable'

export interface HomePlanResponse {
  nextTask: {
    id: string
    subject: string
    title: string
    plannedMinutes: number
    needs: string[]
  } | null
  remainingMinutesToday: number
  // Story 4.2 — alle overige taken van vandaag (home-later-list), geen `needs`: pas
  // relevant zodra Evelien er daadwerkelijk op klikt (1.2 haalt dat dan zelf op via
  // dezelfde useState-doorgifte als de primaire taak).
  laterTasks: {
    id: string
    subject: string
    title: string
    plannedMinutes: number
  }[]
  // Story 4.2 — `null` = Calendar-aanroep mislukt (home-calendar-dayview toont dan
  // "Kan agenda niet laden", fail-safe: geen banner).
  calendarDayEvents: {
    title: string
    startsAt: string
    endsAt: string
  }[] | null
  sessionTimeCheck: SessionTimeCheck | null
}

// Story 4.3 — databron voor 1.2-sessie-tussenscherm's terugvalpad (GET /api/tasks/[id]),
// wanneer de useState-doorgifte vanuit 1.1 ontbreekt (refresh/deep link). Zelfde velden
// als HomePlanResponse['nextTask'], bewust niet hergebruikt als alias: dit is een eigen
// endpoint met een eigen levenscyclus, geen gedeelde brontype-afhankelijkheid nodig.
export interface TaskPrepResponse {
  id: string
  subject: string
  title: string
  plannedMinutes: number
  needs: string[]
  // Story 4.4 — nodig voor 1.3-sessie-actief's subtaak-wachtrij. `minutes` is per subtaak
  // optioneel (Story 3.2), net als op de Subtask-rij zelf.
  subtasks: {
    id: string
    name: string
    minutes: number | null
  }[]
  // Story 4.5 — de Session-rij se eigen id (niet het taak-id), nodig voor
  // POST /api/sessions/{sessionId}/stop|heartbeat.
  sessionId: string
}

// Story 4.4 — de vorm die `sessie/starten.vue`'s "Start"-knop doorgeeft aan 1.3 via
// `useState('sessie-actief-taak', ...)`. Gedeeld i.p.v. lokaal gedefinieerd (Story 4.2's
// DRY-les — voorheen een lokale `SessieActiefTaak`-interface in starten.vue).
export interface SessionActiveTaak extends TaskPrepResponse {
  starttijdstip: string
}

// Story 4.6 review-patch — was inline gedupliceerd in `SessieOverzichtLog.subtasks` en in
// `overzicht.vue`'s `statusLabels`-map; hier één keer gedefinieerd zodat een toekomstige
// vierde status niet op twee plekken tegelijk bijgewerkt hoeft te worden.
export type SubtaskStatus = 'afgerond' | 'uitgesteld' | 'niet-gestart'

// Story 4.4/4.5 — opgebouwd door `sessie/actief.vue`'s `stopSessie()` via
// `useState('sessie-overzicht-log', ...)`, gelezen door 1.4-sessie-afronden (Story 4.6)
// zonder nieuwe fetch. Verplaatst hierheen (was lokaal in actief.vue) zodra een tweede
// bestand 'm nodig heeft — zelfde precedent als `SessionActiveTaak` hierboven.
export interface SessieOverzichtLog {
  // Story 4.6 — nodig om op de `?taak={id}`-route te verifiëren dat déze log daadwerkelijk
  // bij de huidige taak hoort (zelfde "verifieer het id vóór je de state vertrouwt"-patroon
  // als `sessie/starten.vue`'s `heeftDirecteData`/`sessie/actief.vue`'s `taak`-computed).
  taskId: string
  // Story 4.7 — nodig voor de `/replan`-aanroep (`POST /api/sessions/{sessionId}/replan`,
  // zelfde bron als de bestaande `/stop`-aanroep in `stopSessie()`).
  sessionId: string
  subject: string
  title: string
  plannedMinutes: number
  spentSeconds: number
  subtasks: { id: string, name: string, status: SubtaskStatus }[]
}

// Story 4.7 — body van `POST /api/sessions/{sessionId}/replan`. `remainingHours`/
// `remainingMinutes` zijn `null` als Evelien de velden leeg liet ("oorspronkelijke
// schatting blijft gelden", zelfde betekenis als op 1.4 zelf).
export interface ReplanSessionInput {
  actualMinutes: number
  remainingHours: number | null
  remainingMinutes: number | null
}

export interface ReplanSessionResponse {
  ok: true
  completed: boolean
}

// Story 5.1 — databron voor 6.1-takenoverzicht (`GET /api/tasks?status=open`). Al gesorteerd
// op deadline (server-side, `getOpenTasksWithProgress`) — client groepeert alleen nog op
// week ("Deze week"/"Volgende week"/"Later"), geen herordening nodig.
export interface OpenTaskItem {
  id: string
  subject: string
  title: string
  type: TaskType
  deadline: string
  totalSubtasks: number
  doneSubtasks: number
}

export interface OpenTasksResponse {
  tasks: OpenTaskItem[]
}

// Story 5.3 — databron voor 6.3-bewerkformulier (`GET /api/tasks/{id}/edit`). Geen
// bestaande fetch/state (Story 5.1/5.2's `OpenTaskItem`/`useState`) bevat genoeg velden
// voor bewerken (moeilijkheid, prioriteit, sessieduur, omschrijving, benodigdheden,
// deeltaak-tijden/-status) — vandaar een eigen, volledige vorm.
export interface TaskEditSubtask {
  id: string
  name: string
  minutes: number | null
  status: SubtaskStatus
}

export interface TaskEditData {
  id: string
  subject: string
  title: string
  type: TaskType
  deadline: string
  difficulty: Difficulty
  priority: Priority
  defaultSessionDuration: number
  description: string | null
  totalMinutes: number
  subtasks: TaskEditSubtask[]
  needs: string[]
}

// Story 5.3 — body van `PUT /api/tasks/{id}`. Zelfde vorm als `CreateTaskInput`, maar elke
// deeltaak draagt optioneel een bestaand `id` (ontbrekend = nieuwe rij) — nodig voor de
// server-side reconciliatie in `server/domain/tasks/update-task.ts`.
export interface UpdateTaskInput extends Omit<CreateTaskInput, 'subtasks'> {
  // `status` (review-patch) — alleen relevant voor een bestaande rij met `id`; laat de
  // server een expliciete "Heropenen" (client zet 'm terug naar `'niet-gestart'`)
  // onderscheiden van een reconciliatie-aanroep die een `'afgerond'`-rij ongemoeid moet
  // laten. Ontbrekend/`undefined` betekent "geen wijziging bedoeld".
  subtasks: (SubtaskInput & { id?: string, status?: SubtaskStatus })[]
}

// Story 7.1 — databron voor het schoolsessies-verzamelscherm se `school-session-task-select`
// (`GET /api/school-sessions/tasks`). Alleen wat de dropdown nodig heeft, zelfde
// "geen client-behoefte, niet meesturen"-precedent als `HomePlanResponse`.
export interface SchoolSessionTaskOption {
  id: string
  subject: string
  title: string
}

export type SchoolSessionTasksResponse = SchoolSessionTaskOption[]

// Story 7.2 — een taak die pas op school werd opgegeven en nog niet in Flowz bestond.
// Alleen titel + deadline (epics.md: "geen ander veld") — vak/soort taak/moeilijkheid/
// prioriteit/sessieduur krijgen server-side vaste defaults (zie server/api/school-sessions.post.ts).
export interface SchoolSessionNewTask {
  title: string
  deadline: string
}

// Story 7.1 — body van `POST /api/school-sessions`. Elke regel wordt verwerkt als een
// afgeronde sessie (`replanAfterSession`, zelfde mechanisme als UJ-1/Story 4.7) met
// `remainingTotalMinutes: null` ("ongewijzigd") — er is bewust geen resterende-tijd-veld
// op dit scherm, zie de story se Dev Notes. `rowId` is een client-gegenereerde, willekeurige
// waarde (geen taak-id) — nodig om resultaten terug te koppelen aan de juiste rij ook als
// twee rijen toevallig dezelfde taak kiezen (code review 2026-08-23: partial-failure-fix).
// Story 7.2 — precies één van `taskId` (bestaande taak) of `newTask` (nog niet in Flowz
// bekende taak) is aanwezig, nooit beide/geen van beide (server valideert dit).
export interface SchoolSessionEntry {
  rowId: string
  taskId?: string
  newTask?: SchoolSessionNewTask
  actualMinutes: number
}

export interface SchoolSessionsInput {
  entries: SchoolSessionEntry[]
}

// Per-regel resultaat i.p.v. alles-of-niets — nodig zodat de client na een gedeeltelijke
// mislukking alleen de nog-mislukte rijen opnieuw kan versturen, zonder een al geslaagde
// rij (sessielog al geschreven) een tweede keer te posten (code review 2026-08-23).
export interface SchoolSessionResult {
  rowId: string
  ok: boolean
  message?: string
}

export interface SchoolSessionsResponse {
  results: SchoolSessionResult[]
}
