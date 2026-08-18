CREATE TABLE `task_edit_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_edit_locks_task_unique` ON `task_edit_locks` (`task_id`);