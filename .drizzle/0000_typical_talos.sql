CREATE TABLE `organization` (
	`organization_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_name` text(128) NOT NULL,
	`organization_schema_version` text DEFAULT '0.0.0' NOT NULL,
	`organization_db_id` text(512),
	`organization_db_url` text(512),
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `organization_user_id_idx` ON `organization` (`user_id`);--> statement-breakpoint
CREATE INDEX `organization_name_idx` ON `organization` (`organization_name`);--> statement-breakpoint
CREATE INDEX `organization_deleted_at_idx` ON `organization` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `organization_user` (
	`organization_user_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `organization_user_organization_id_idx` ON `organization_user` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_user_user_id_idx` ON `organization_user` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_user_organization_id_user_id_idx` ON `organization_user` (`organization_id`,`user_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `organization_user_deleted_at_idx` ON `organization_user` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `product` (
	`product_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_barcode` text(64) NOT NULL,
	`product_type` text(32) DEFAULT 'food' NOT NULL,
	`product_name` text(255),
	`product_company_name` text(255),
	`product_images` text,
	`product_metadata` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_barcode_idx` ON `product` (`product_barcode`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_name_idx` ON `product` (`product_name`);--> statement-breakpoint
CREATE INDEX `product_type_idx` ON `product` (`product_type`);--> statement-breakpoint
CREATE INDEX `product_deleted_at_idx` ON `product` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `user` (
	`user_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_phone` text(24) NOT NULL,
	`user_first_name` text(32) NOT NULL,
	`user_last_name` text(32) NOT NULL,
	`user_image` text(64),
	`user_schema_version` text DEFAULT '0.0.0' NOT NULL,
	`user_db_id` text(512),
	`user_db_url` text(512),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_idx` ON `user` (`user_phone`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `user_first_name_idx` ON `user` (`user_first_name`);--> statement-breakpoint
CREATE INDEX `user_last_name_idx` ON `user` (`user_last_name`);--> statement-breakpoint
CREATE INDEX `user_deleted_at_idx` ON `user` (`deleted_at`);