import { getUserById } from '../../data/users'
import { refreshCalendarAccessToken } from '../auth/calendar-token'

// Eerste echte inhoud van deze map — de Structural Seed reserveerde 'm al sinds Story 1.1
// (`server/domain/calendar-sync/.gitkeep`).
//
// Story 2.5 (Correct Course, 2026-08-26): vereenvoudigd van een per-sessie-vorm
// (`HomeworkSession`, met `sessionId`/`subject`/`title`) naar een generieke, neutrale
// Calendar-CRUD-laag — een blok dekt sinds deze story mogelijk meerdere taken tegelijk,
// dus een taak-gebonden titel/identifier hoort hier niet meer thuis op dít niveau. De
// aanroeper (`server/domain/calendar-sync/homework-blocks.ts`) bepaalt de titel — sinds
// 2026-09-04 vak+titel van de taak/taken in het blok, niet meer de vaste tekst "Huiswerk".
export interface CalendarBlockEvent {
  title: string
  // ISO 8601 UTC datetime (bv. "2026-08-01T14:00:00Z") — Google's Events-resource
  // accepteert een RFC3339-tijdstip rechtstreeks in `dateTime`, geen aparte `timeZone`
  // nodig zolang de string zelf een offset/Z draagt.
  startsAt: string
  endsAt: string
}

// Geëxporteerd (Story 8.1) — de kanaal-registratieroute en de Cron-handler gebruiken
// dezelfde basis-URL voor `/watch` resp. `/list` ("Belangrijk" punt 7: zelfde Calendar
// als waar huiswerk-events al op geschreven worden, niet de beschikbare-tijd-agenda).
export const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

function toEventResource(event: CalendarBlockEvent, colorId: number) {
  return {
    summary: event.title,
    start: { dateTime: event.startsAt },
    end: { dateTime: event.endsAt },
    // Google's Events-resource verwacht colorId als string ("7"), ook al is de
    // opgeslagen `homeworkCalendarColorId` in dit project een integer 1-11.
    colorId: String(colorId),
    // AC #3 ("Flowz overschrijft/hermaakt het event gewoon") — live geverifieerd
    // (code review 2026-08-01): een handmatig verwijderd event geeft GEEN 404 op een
    // volgende PATCH, zoals eerst aangenomen. Google bewaart het als een onzichtbare
    // `status:"cancelled"`-tombstone en accepteert de PATCH gewoon met 200, ongewijzigd
    // onzichtbaar. Expliciet `status:'confirmed'` meesturen "herleeft" zo'n tombstone met
    // hetzelfde `googleEventId` — bevestigd met een losse live-testaanroep. Op een
    // gewoon bestaand event is dit veld een no-op (het staat al op `confirmed`).
    status: 'confirmed'
  }
}

async function calendarRequest(accessToken: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${CALENDAR_EVENTS_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })
}

async function foutBericht(response: Response): Promise<string> {
  return response.text().catch(() => '(kon foutrespons niet lezen)')
}

// Probeer-dan-ververs-bij-401 (Task 5) — het access-token verloopt na ~1 uur, los van de
// 7 dagen-Flowz-sessie. Geen vervaltijd-kolom, geen proactieve refresh: gewoon de call
// proberen, en bij precies één 401 het opgeslagen refresh-token inwisselen en exact
// éénmaal opnieuw proberen (geen retry-met-vertraging, geen lus).
//
// Story 8.1 — geëxporteerd: de nieuwe kanaal-registratieroute en de Cron-handler
// (`server/cron/calendar-watch-tick.ts`) hebben hetzelfde token-refresh-patroon nodig voor
// hun eigen Calendar-aanroepen (`events.watch`/`events.list`), niet alleen create/update/delete.
export async function calendarRequestMetVerversing(
  userId: string,
  accessToken: string,
  path: string,
  init: RequestInit
): Promise<Response> {
  const eersteRespons = await calendarRequest(accessToken, path, init)
  if (eersteRespons.status !== 401) {
    return eersteRespons
  }

  const ververstToken = await refreshCalendarAccessToken(userId)
  return calendarRequest(ververstToken, path, init)
}

// `channels.stop` staat op een ander pad dan `CALENDAR_EVENTS_URL` (geen `/calendars/primary/
// events`-voorvoegsel) — vandaar een eigen kleine aanroepfunctie i.p.v. `calendarRequestMetVerversing`
// hergebruiken. Code review 2026-09-13: zonder dit blijft een vervangen kanaal (bij hernieuwing
// of herregistratie) tot zijn eigen vervaltermijn (max. 7 dagen) notificaties naar de webhook
// sturen, die daar als onbekend kanaal worden afgewezen.
const CALENDAR_CHANNELS_STOP_URL = 'https://www.googleapis.com/calendar/v3/channels/stop'

export async function stopWatchChannel(userId: string, accessToken: string, channelId: string, resourceId: string): Promise<void> {
  const body = JSON.stringify({ id: channelId, resourceId })
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }

  let response = await fetch(CALENDAR_CHANNELS_STOP_URL, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } })
  if (response.status === 401) {
    const ververstToken = await refreshCalendarAccessToken(userId)
    response = await fetch(CALENDAR_CHANNELS_STOP_URL, { ...init, headers: { ...init.headers, Authorization: `Bearer ${ververstToken}` } })
  }

  // Geen 404-uitzondering nodig zoals bij `deleteHomeworkEvent`: Google accepteert `channels.stop`
  // voor een kanaal dat al verlopen/gestopt is gewoon met 404/410, en de aanroeper hier belt dit
  // altijd best-effort (in een try/catch) — zie de aanroepplekken.
  if (!response.ok) {
    throw new Error(`Kon watch-kanaal niet stoppen (${response.status}): ${await foutBericht(response)}`)
  }
}

export interface CreateHomeworkEventResult {
  googleEventId: string
  // Story 8.1 — Google's `updated`-veld op het zojuist aangemaakte event, voor de
  // alleen-lezen detectie-spike se echo-detectie (`homeworkCalendarBlocks.lastKnownUpdated`).
  // Ongebruikt door de bestaande write-sync-flow zelf.
  updated: string
}

// Story 8.1 — analoog aan `CreateHomeworkEventResult`, voor `updateHomeworkEvent` hieronder
// (die vóór deze story `void` teruggaf).
export interface UpdateHomeworkEventResult {
  updated: string
}

// Zelf-bewakend op de kleurinstelling én de write-scope (AC #4 + code review 2026-08-01):
// geen kleur ingesteld (nieuwe gebruiker die de instellingenpagina nog nooit bezocht) of
// een kleur zonder afgeronde her-consent betekent Flowz blijft volledig alleen-lezend,
// dus geen Calendar-call. Dit is geen foutpad — `null` is het bedoelde resultaat, de
// aanroeper hoeft dit niet zelf te controleren. Zonder de write-scope-check zou een
// gebruiker die de her-consent-redirect afbreekt een rauwe Google-403 krijgen i.p.v. dit
// bedoelde no-op-gedrag.
//
// Synchroon binnen het request-pad (AD-7) — geen achtergrondtaak, geen wachtrij, geen
// retry-met-vertraging. Een falende Calendar-call laat deze aanroep gewoon falen.
export async function createHomeworkEvent(
  userId: string,
  event: CalendarBlockEvent
): Promise<CreateHomeworkEventResult | null> {
  const user = await getUserById(userId)
  if (user.homeworkCalendarColorId === null || !user.hasCalendarWriteScope) {
    return null
  }

  const response = await calendarRequestMetVerversing(userId, user.calendarAccessToken, '', {
    method: 'POST',
    body: JSON.stringify(toEventResource(event, user.homeworkCalendarColorId))
  })

  if (!response.ok) {
    throw new Error(`Kon huiswerk-event niet aanmaken (${response.status}): ${await foutBericht(response)}`)
  }

  // Code review 2026-09-13: `.json()` kan gooien op een leeg/onparseerbaar lichaam — dat mag
  // hier niet de al-geslaagde Calendar-aanmaak laten uitmonden in een throw die de aanroeper
  // (`homework-blocks.ts`) doet denken dat er niets gebeurd is (het event bestaat dan wél bij
  // Google, maar zonder `homeworkCalendarBlocks`-rij — nooit meer opgeruimd). `.catch(() =>
  // null)` net als `foutBericht` hierboven al doet op het foutpad.
  const created = await response.json().catch(() => null) as { id: string, updated: string } | null
  if (!created?.id) {
    throw new Error('Huiswerk-event aangemaakt bij Google, maar de respons kon niet gelezen worden (leeg/onparseerbaar lichaam).')
  }
  return { googleEventId: created.id, updated: created.updated }
}

// Zelf-bewakend, zelfde redenering als createHomeworkEvent hierboven (kleur + write-scope).
//
// `toEventResource`'s `status:'confirmed'` (zie boven) herstelt hier automatisch een
// handmatig verwijderd event — AC #3 ("Flowz overschrijft/hermaakt het event gewoon") is
// daarmee al gedekt zonder speciale foutafhandeling: Google's PATCH slaagt gewoon (200),
// ongeacht of het event daarvoor `confirmed` of `cancelled` (= handmatig verwijderd) was.
export async function updateHomeworkEvent(
  userId: string,
  googleEventId: string,
  event: CalendarBlockEvent
): Promise<UpdateHomeworkEventResult | null> {
  const user = await getUserById(userId)
  if (user.homeworkCalendarColorId === null || !user.hasCalendarWriteScope) {
    return null
  }

  const response = await calendarRequestMetVerversing(userId, user.calendarAccessToken, `/${googleEventId}`, {
    method: 'PATCH',
    body: JSON.stringify(toEventResource(event, user.homeworkCalendarColorId))
  })

  if (!response.ok) {
    throw new Error(`Kon huiswerk-event niet bijwerken (${response.status}): ${await foutBericht(response)}`)
  }

  // Code review 2026-09-13: in tegenstelling tot `createHomeworkEvent` hierboven is de PATCH
  // hier al onherroepelijk geslaagd zonder dat de respons-body iets essentieels bijdraagt
  // (`updated` is uitsluitend metadata voor de spike se echo-detectie, "Ongebruikt door de
  // bestaande write-sync-flow zelf" — zie `UpdateHomeworkEventResult`). Een leeg/onparseerbaar
  // lichaam mag dus nooit de al-gedane Calendar-wijziging alsnog als mislukt laten overkomen
  // (wat zonder deze vangnet de aanroeper's `updateHomeworkBlockTimes` zou overslaan en
  // Calendar/DB stil uit elkaar zou laten lopen) — `null` teruggeven i.p.v. gooien.
  const updated = await response.json().catch(() => null) as { updated: string } | null
  return updated?.updated ? { updated: updated.updated } : null
}

// Bewust NIET zelf-bewakend op de kleurinstelling (code review 2026-08-01, in
// tegenstelling tot create/update hierboven): verwijderen is opruimen, geen nieuwe
// write-sync-activiteit starten, dus moet altijd kunnen — ook als de kleur inmiddels is
// gewijzigd. Zonder deze aanpassing zou een eerder aangemaakt event nooit meer opgeruimd
// kunnen worden zodra de kleur verandert, en zou het voorgoed op Eveliens echte agenda
// blijven staan.
export async function deleteHomeworkEvent(userId: string, googleEventId: string): Promise<void> {
  const user = await getUserById(userId)

  const response = await calendarRequestMetVerversing(userId, user.calendarAccessToken, `/${googleEventId}`, {
    method: 'DELETE'
  })

  // 404 is geen fout hier: AC #3 (Flowz overschrijft/hermaakt zonder conflict-detectie)
  // impliceert dat een handmatig al-verwijderd event geen reden is om te falen. Wel
  // gelogd (code review 2026-08-01) — dit dekt ook een verkeerd/verlopen `googleEventId`
  // van de aanroeper, dus stil zwijgen zou een echte integratiebug kunnen verbergen.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Kon huiswerk-event niet verwijderen (${response.status}): ${await foutBericht(response)}`)
  }
  if (response.status === 404) {
    console.warn(`[calendar-sync] deleteHomeworkEvent: event ${googleEventId} bestond al niet meer (404) — behandeld als AC #3's "handmatig al verwijderd", geen fout.`)
  }
}
