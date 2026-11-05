CREATE TABLE `address_labels` (
	`address` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `funnel_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`step` text NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `funnel_subject_idx` ON `funnel_events` (`subject`,`step`);--> statement-breakpoint
CREATE TABLE `payment_links` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refund_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_request_id` text NOT NULL,
	`order_id` text NOT NULL,
	`amount_onchain` text NOT NULL,
	`email` text NOT NULL,
	`otp` text NOT NULL,
	`status` text NOT NULL,
	`new_address` text,
	`screening_result` text,
	`refund_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `source` text DEFAULT 'store' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `merchant_reference` text;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `payer_is_exchange` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_requests` ADD `funded_via` text;