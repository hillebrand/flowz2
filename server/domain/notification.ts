// Gebruikersgerichte meldingen (tijd-/energiegebrek, UJ-6/7/8) — bewust een ander
// shape dan de technische error-envelope (errors.ts), zodat de schuldvrije toon
// nooit per ongeluk als technische fout wordt weergegeven (architectuur AD-6).

export type NotificationType = 'info' | 'warning'

export interface NotificationAction {
  label: string
}

export interface Notification {
  notification: {
    type: NotificationType
    message: string
    actions: NotificationAction[]
  }
}
