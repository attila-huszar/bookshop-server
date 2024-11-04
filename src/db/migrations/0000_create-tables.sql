CREATE TABLE `authors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`full_name` text,
	`birth_year` text,
	`death_year` text,
	`homeland` text,
	`biography` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author` integer NOT NULL,
	`genre` text,
	`img_url` text,
	`description` text,
	`publish_year` integer,
	`rating` real,
	`price` real NOT NULL,
	`discount` real DEFAULT 0,
	`discount_price` real NOT NULL,
	`top_sellers` integer DEFAULT false,
	`new_release` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`address` text,
	`phone` text,
	`avatar` text,
	`verified` integer DEFAULT false NOT NULL,
	`verification_code` text,
	`verification_expires` text,
	`password_reset_code` text,
	`password_reset_expires` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_uuid_unique` ON `users` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);