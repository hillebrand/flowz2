CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_subject_id` text NOT NULL,
	`calendar_access_token` text NOT NULL,
	`calendar_refresh_token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_subject_id_unique` ON `users` (`google_subject_id`);