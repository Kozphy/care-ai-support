CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL
);
