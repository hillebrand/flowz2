CREATE TABLE `dismissed_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`google_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_conflicts_user_date_event_unique` ON `dismissed_conflicts` (`user_id`,`date`,`google_event_id`);