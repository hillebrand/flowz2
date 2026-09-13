CREATE TABLE `calendar_watch_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_token` text NOT NULL,
	`resource_id` text NOT NULL,
	`sync_token` text,
	`expires_at` text NOT NULL,
	`last_change_notified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_watch_channels_user_unique` ON `calendar_watch_channels` (`user_id`);--> statement-breakpoint
CREATE INDEX `calendar_watch_channels_channel_id_idx` ON `calendar_watch_channels` (`channel_id`);--> statement-breakpoint
ALTER TABLE `homework_calendar_blocks` ADD `last_known_updated` text;