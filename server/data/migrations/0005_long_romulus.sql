CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`planned_minutes` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`deadline` text NOT NULL,
	`difficulty` text DEFAULT 'gemiddeld' NOT NULL,
	`priority` text DEFAULT 'gemiddeld' NOT NULL,
	`default_session_duration` integer NOT NULL,
	`total_minutes` integer NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
