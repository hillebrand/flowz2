ALTER TABLE `users` ADD `homework_calendar_color_id` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `has_calendar_write_scope` integer DEFAULT 0 NOT NULL;