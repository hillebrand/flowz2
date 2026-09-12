CREATE TABLE `replan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `replan_runs_user_created_idx` ON `replan_runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `replan_change_log_user_created_idx` ON `replan_change_log` (`user_id`,`created_at`);