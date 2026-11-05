DROP TABLE `address_labels`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
DROP TABLE `payment_links`;--> statement-breakpoint
DROP TABLE `refund_claims`;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `source`;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `merchant_reference`;--> statement-breakpoint
ALTER TABLE `payment_requests` DROP COLUMN `payer_is_exchange`;