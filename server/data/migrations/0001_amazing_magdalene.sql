CREATE TABLE `available_time_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`monday` integer DEFAULT 0 NOT NULL,
	`tuesday` integer DEFAULT 0 NOT NULL,
	`wednesday` integer DEFAULT 0 NOT NULL,
	`thursday` integer DEFAULT 0 NOT NULL,
	`friday` integer DEFAULT 0 NOT NULL,
	`saturday` integer DEFAULT 0 NOT NULL,
	`sunday` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `available_time_patterns_user_id_unique` ON `available_time_patterns` (`user_id`);