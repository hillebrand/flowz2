import { and, eq } from 'drizzle-orm'
import { getDb } from './db'
import { calendarWatchChannels, type CalendarWatchChannel } from './schema'

// Story 8.1 — datalaag voor de alleen-lezen detectie-spike. Eén rij per user (schema se
// unique index op `userId`): deze spike registreert maximaal één actief kanaal per user.

export async function getWatchChannelForUser(userId: string): Promise<CalendarWatchChannel | undefined> {
  const [channel] = await getDb().select().from(calendarWatchChannels).where(eq(calendarWatchChannels.userId, userId))
  return channel
}

export async function getWatchChannelByChannelId(channelId: string): Promise<CalendarWatchChannel | undefined> {
  const [channel] = await getDb().select().from(calendarWatchChannels).where(eq(calendarWatchChannels.channelId, channelId))
  return channel
}

export async function getAllWatchChannels(): Promise<CalendarWatchChannel[]> {
  return getDb().select().from(calendarWatchChannels)
}

export interface UpsertWatchChannelInput {
  userId: string
  channelId: string
  channelToken: string
  resourceId: string
  expiresAt: string
  // Alleen gezet bij een verse registratie (de initiële volledige `events.list`-doorloop,
  // zie register.post.ts) — bij een herregistratie zonder nieuwe token behoudt de SET-
  // clausule hieronder bewust de bestaande waarde (geen sync-continuïteit weggooien).
  syncToken?: string
}

// `onConflictDoUpdate` op de unique `userId`-index — een hernieuwing/herregistratie
// vervangt het bestaande kanaal van deze user in plaats van een tweede rij toe te voegen.
export async function upsertWatchChannel(input: UpsertWatchChannelInput): Promise<CalendarWatchChannel> {
  const [channel] = await getDb()
    .insert(calendarWatchChannels)
    .values(input)
    .onConflictDoUpdate({
      target: calendarWatchChannels.userId,
      set: {
        channelId: input.channelId,
        channelToken: input.channelToken,
        resourceId: input.resourceId,
        expiresAt: input.expiresAt,
        ...(input.syncToken ? { syncToken: input.syncToken } : {}),
        updatedAt: new Date().toISOString()
      }
    })
    .returning()

  return channel!
}

// Story 8.1, code review 2026-09-13 — teardown-tegenhanger van `upsertWatchChannel`,
// gebruikt door de nieuwe `DELETE /api/calendar/homework-watch/register`-route.
export async function deleteWatchChannel(id: string): Promise<void> {
  await getDb().delete(calendarWatchChannels).where(eq(calendarWatchChannels.id, id))
}

export async function markChannelChangeNotified(channelId: string): Promise<void> {
  await getDb()
    .update(calendarWatchChannels)
    .set({ lastChangeNotifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(calendarWatchChannels.channelId, channelId))
}

export interface RenewWatchChannelInput {
  channelId: string
  channelToken: string
  resourceId: string
  expiresAt: string
}

// Kanaal-hernieuwing (Task 4a) — `syncToken`/`lastChangeNotifiedAt` blijven ongemoeid,
// alleen het Google-kanaal zelf (nieuw `channelId`/`channelToken`/`resourceId`/`expiresAt`)
// verandert. Nieuw `channelId`/`channelToken` per hernieuwing (Google staat geen
// hergebruik van een kanaal-id toe voor een nieuwe `events.watch`-aanroep).
export async function renewWatchChannel(id: string, input: RenewWatchChannelInput): Promise<void> {
  await getDb()
    .update(calendarWatchChannels)
    .set({
      channelId: input.channelId,
      channelToken: input.channelToken,
      resourceId: input.resourceId,
      expiresAt: input.expiresAt,
      updatedAt: new Date().toISOString()
    })
    .where(eq(calendarWatchChannels.id, id))
}

// Na een verwerkte sync-diff (Task 4b): nieuwe `syncToken` vastleggen, debounce-venster
// weer sluiten door `lastChangeNotifiedAt` terug op `null` te zetten.
//
// `expectedLastChangeNotifiedAt` (code review 2026-09-13): compare-and-swap op het veld dat
// deze functie anders onvoorwaardelijk zou wissen. Zonder dit zou een notificatie die
// binnenkomt terwijl de (mogelijk meerdere pagina's tellende) sync-pass nog loopt stilzwijgend
// genegeerd worden — de aanroeper geeft de waarde mee die aan het BEGIN van de pass gold, dus
// de wis-actie gaat alleen door als er sindsdien geen nieuwe notificatie is bijgekomen.
export async function completeSyncPass(id: string, syncToken: string | null, expectedLastChangeNotifiedAt: string): Promise<void> {
  await getDb()
    .update(calendarWatchChannels)
    .set({ syncToken, lastChangeNotifiedAt: null, updatedAt: new Date().toISOString() })
    .where(and(eq(calendarWatchChannels.id, id), eq(calendarWatchChannels.lastChangeNotifiedAt, expectedLastChangeNotifiedAt)))
}
