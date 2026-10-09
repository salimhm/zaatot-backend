ALTER TABLE `product_fact` RENAME COLUMN "observed_at" TO "fetched_at";--> statement-breakpoint
CREATE TABLE `product_nutrient` (
	`product_nutrient_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_fact_id` integer NOT NULL,
	`nutrient_code` text(64) NOT NULL,
	`nutrient_value` real NOT NULL,
	`nutrient_unit` text(16) NOT NULL,
	`nutrient_basis` text(32) NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`product_fact_id`) REFERENCES `product_fact`(`product_fact_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_nutrient_fact_code_unit_basis_idx` ON `product_nutrient` (`product_fact_id`,`nutrient_code`,`nutrient_unit`,`nutrient_basis`);--> statement-breakpoint
CREATE INDEX `product_nutrient_fact_id_idx` ON `product_nutrient` (`product_fact_id`);--> statement-breakpoint
CREATE INDEX `product_nutrient_code_unit_basis_value_idx` ON `product_nutrient` (`nutrient_code`,`nutrient_unit`,`nutrient_basis`,`nutrient_value`);--> statement-breakpoint
CREATE INDEX `product_nutrient_deleted_at_idx` ON `product_nutrient` (`deleted_at`);--> statement-breakpoint
DROP INDEX "brand_name_idx";--> statement-breakpoint
DROP INDEX "brand_is_boycotted_idx";--> statement-breakpoint
DROP INDEX "brand_deleted_at_idx";--> statement-breakpoint
DROP INDEX "organization_user_id_idx";--> statement-breakpoint
DROP INDEX "organization_name_idx";--> statement-breakpoint
DROP INDEX "organization_deleted_at_idx";--> statement-breakpoint
DROP INDEX "organization_user_organization_id_idx";--> statement-breakpoint
DROP INDEX "organization_user_user_id_idx";--> statement-breakpoint
DROP INDEX "organization_user_organization_id_user_id_idx";--> statement-breakpoint
DROP INDEX "organization_user_deleted_at_idx";--> statement-breakpoint
DROP INDEX "product_barcode_idx";--> statement-breakpoint
DROP INDEX "product_name_idx";--> statement-breakpoint
DROP INDEX "product_type_idx";--> statement-breakpoint
DROP INDEX "product_brand_id_idx";--> statement-breakpoint
DROP INDEX "product_deleted_at_idx";--> statement-breakpoint
DROP INDEX "product_nova_group_idx";--> statement-breakpoint
DROP INDEX "product_ecoscore_idx";--> statement-breakpoint
DROP INDEX "product_nutriscore_idx";--> statement-breakpoint
DROP INDEX "product_fact_product_id_version_idx";--> statement-breakpoint
DROP INDEX "product_fact_status_idx";--> statement-breakpoint
DROP INDEX "product_fact_source_id_idx";--> statement-breakpoint
DROP INDEX "product_fact_fresh_until_idx";--> statement-breakpoint
DROP INDEX "product_fact_deleted_at_idx";--> statement-breakpoint
DROP INDEX "user_phone_idx";--> statement-breakpoint
DROP INDEX "user_first_name_idx";--> statement-breakpoint
DROP INDEX "user_last_name_idx";--> statement-breakpoint
DROP INDEX "user_deleted_at_idx";--> statement-breakpoint
ALTER TABLE `product_fact` ALTER COLUMN "fetched_at" TO "fetched_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `product_fact` ADD `source_tier` text(32) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_fact` ADD `ingredients_complete` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_fact` ADD `allergens_complete` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_fact` ADD `nutrition_complete` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_fact` ALTER COLUMN "product_id" TO "product_id" integer NOT NULL REFERENCES product(product_id) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_fact` DROP COLUMN `product_nutrients`;--> statement-breakpoint
CREATE UNIQUE INDEX `brand_name_idx` ON `brand` (`brand_name`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `brand_is_boycotted_idx` ON `brand` (`brand_is_boycotted`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `brand_deleted_at_idx` ON `brand` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `organization_user_id_idx` ON `organization` (`user_id`);--> statement-breakpoint
CREATE INDEX `organization_name_idx` ON `organization` (`organization_name`);--> statement-breakpoint
CREATE INDEX `organization_deleted_at_idx` ON `organization` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `organization_user_organization_id_idx` ON `organization_user` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_user_user_id_idx` ON `organization_user` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_user_organization_id_user_id_idx` ON `organization_user` (`organization_id`,`user_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `organization_user_deleted_at_idx` ON `organization_user` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_barcode_idx` ON `product` (`product_barcode`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_name_idx` ON `product` (`product_name`);--> statement-breakpoint
CREATE INDEX `product_type_idx` ON `product` (`product_type`);--> statement-breakpoint
CREATE INDEX `product_brand_id_idx` ON `product` (`brand_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_deleted_at_idx` ON `product` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `product_nova_group_idx` ON `product` (`product_nova_group`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_ecoscore_idx` ON `product` (`product_ecoscore`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_nutriscore_idx` ON `product` (`product_nutriscore`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `product_fact_product_id_version_idx` ON `product_fact` (`product_id`,`product_fact_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_fact_product_id_active_idx` ON `product_fact` (`product_id`) WHERE fact_status = 'active' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_fact_status_idx` ON `product_fact` (`fact_status`);--> statement-breakpoint
CREATE INDEX `product_fact_source_id_idx` ON `product_fact` (`source_id`);--> statement-breakpoint
CREATE INDEX `product_fact_source_tier_idx` ON `product_fact` (`source_tier`);--> statement-breakpoint
CREATE INDEX `product_fact_fresh_until_idx` ON `product_fact` (`fresh_until`);--> statement-breakpoint
CREATE INDEX `product_fact_deleted_at_idx` ON `product_fact` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_idx` ON `user` (`user_phone`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `user_first_name_idx` ON `user` (`user_first_name`);--> statement-breakpoint
CREATE INDEX `user_last_name_idx` ON `user` (`user_last_name`);--> statement-breakpoint
CREATE INDEX `user_deleted_at_idx` ON `user` (`deleted_at`);
