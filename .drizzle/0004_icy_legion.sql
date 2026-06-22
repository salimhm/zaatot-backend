ALTER TABLE `product` ADD `product_nova_group` integer;--> statement-breakpoint
ALTER TABLE `product` ADD `product_ecoscore` text;--> statement-breakpoint
ALTER TABLE `product` ADD `product_nutriscore` text;--> statement-breakpoint
CREATE INDEX `product_nova_group_idx` ON `product` (`product_nova_group`);--> statement-breakpoint
CREATE INDEX `product_ecoscore_idx` ON `product` (`product_ecoscore`);--> statement-breakpoint
CREATE INDEX `product_nutriscore_idx` ON `product` (`product_nutriscore`);