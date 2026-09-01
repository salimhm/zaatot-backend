CREATE TABLE `product_fact` (
	`product_fact_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`product_fact_version` integer NOT NULL,
	`fact_status` text(32) NOT NULL,
	`source_id` text(128),
	`source_name` text(255) NOT NULL,
	`source_url` text(1024),
	`product_ingredients` text DEFAULT '[]' NOT NULL,
	`product_allergens` text DEFAULT '[]' NOT NULL,
	`product_nutrients` text DEFAULT '{}' NOT NULL,
	`serving_size` real,
	`serving_unit` text(16),
	`observed_at` text NOT NULL,
	`fresh_until` text,
	`product_fact_hash` text(128) NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_fact_product_id_version_idx` ON `product_fact` (`product_id`,`product_fact_version`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_fact_status_idx` ON `product_fact` (`fact_status`);--> statement-breakpoint
CREATE INDEX `product_fact_source_id_idx` ON `product_fact` (`source_id`);--> statement-breakpoint
CREATE INDEX `product_fact_fresh_until_idx` ON `product_fact` (`fresh_until`);--> statement-breakpoint
CREATE INDEX `product_fact_deleted_at_idx` ON `product_fact` (`deleted_at`);