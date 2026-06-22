DROP INDEX `product_nova_group_idx`;--> statement-breakpoint
DROP INDEX `product_ecoscore_idx`;--> statement-breakpoint
DROP INDEX `product_nutriscore_idx`;--> statement-breakpoint
CREATE INDEX `product_nova_group_idx` ON `product` (`product_nova_group`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_ecoscore_idx` ON `product` (`product_ecoscore`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `product_nutriscore_idx` ON `product` (`product_nutriscore`) WHERE deleted_at IS NULL;