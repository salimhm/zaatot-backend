CREATE TABLE `brand` (
	`brand_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand_name` text(255) NOT NULL,
	`brand_is_boycotted` integer DEFAULT false NOT NULL,
	`brand_boycott_reasons` text DEFAULT '[]',
	`brand_boycott_alternatives` text DEFAULT '[]',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brand_name_idx` ON `brand` (`brand_name`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `brand_is_boycotted_idx` ON `brand` (`brand_is_boycotted`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `brand_deleted_at_idx` ON `brand` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `product` ADD `brand_id` integer;--> statement-breakpoint
ALTER TABLE `product` DROP COLUMN `product_brand_name`;