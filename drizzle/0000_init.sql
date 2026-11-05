CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`payment_request_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_order_idx` ON `activity` (`order_id`);--> statement-breakpoint
CREATE TABLE `exceptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_request_id` text NOT NULL,
	`order_id` text NOT NULL,
	`transfer_id` integer,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`amount_onchain` text DEFAULT '0' NOT NULL,
	`default_action` text NOT NULL,
	`resolution` text,
	`note` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `mock_merchant_inbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`signature_valid` integer NOT NULL,
	`responded_with` integer NOT NULL,
	`body` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`country` text NOT NULL,
	`shipping_address` text NOT NULL,
	`items_json` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text NOT NULL,
	`travel_rule_tier` text NOT NULL,
	`travel_rule_json` text NOT NULL,
	`simulated` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`chain_key` text NOT NULL,
	`address` text NOT NULL,
	`derivation_index` integer NOT NULL,
	`token_address` text NOT NULL,
	`amount_micros` text NOT NULL,
	`amount_onchain` text NOT NULL,
	`divisor` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`funds_status` text DEFAULT 'none' NOT NULL,
	`received_onchain` text DEFAULT '0' NOT NULL,
	`excess_refunded_onchain` text DEFAULT '0' NOT NULL,
	`payer_address` text,
	`first_tx_hash` text,
	`confirmations` integer DEFAULT 0 NOT NULL,
	`success_threshold` integer NOT NULL,
	`finality_threshold` integer NOT NULL,
	`fee_micros` text DEFAULT '0' NOT NULL,
	`wallet_verified_address` text,
	`screening_cleared` integer DEFAULT 0 NOT NULL,
	`has_non_usdc` integer DEFAULT 0 NOT NULL,
	`succeeded_at` integer,
	`available_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`simulated` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pr_order_idx` ON `payment_requests` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pr_address_idx` ON `payment_requests` (`chain_key`,`address`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_request_id` text NOT NULL,
	`order_id` text NOT NULL,
	`exception_id` integer,
	`reason` text NOT NULL,
	`kind` text NOT NULL,
	`token_address` text NOT NULL,
	`token_symbol` text NOT NULL,
	`to_address` text NOT NULL,
	`amount_onchain` text NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`screening_result` text NOT NULL,
	`tx_hash` text,
	`error` text,
	`buyer_notified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `restricted_regions` (
	`code` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `risk_addresses` (
	`address` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settlement_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`settlement_id` text NOT NULL,
	`payment_request_id` text NOT NULL,
	`order_id` text NOT NULL,
	`gross_micros` text NOT NULL,
	`fee_micros` text NOT NULL,
	`net_micros` text NOT NULL,
	`fx_included` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`preference` text NOT NULL,
	`usdc_micros` text NOT NULL,
	`fx_rate` real NOT NULL,
	`fx_fee_sgd_cents` integer NOT NULL,
	`sgd_net_cents` integer NOT NULL,
	`bank_credit_cents` integer,
	`bank_ref` text,
	`bank_credited_at` integer,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain_key` text NOT NULL,
	`tx_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`block_number` integer NOT NULL,
	`block_hash` text NOT NULL,
	`block_timestamp` integer NOT NULL,
	`token_address` text NOT NULL,
	`token_symbol` text NOT NULL,
	`kind` text NOT NULL,
	`from_address` text NOT NULL,
	`to_address` text NOT NULL,
	`amount_onchain` text NOT NULL,
	`payment_request_id` text NOT NULL,
	`status` text NOT NULL,
	`confirmations` integer DEFAULT 0 NOT NULL,
	`late` integer DEFAULT 0 NOT NULL,
	`accepted_late` integer DEFAULT 0 NOT NULL,
	`screening_hit` integer DEFAULT 0 NOT NULL,
	`screening_label` text,
	`simulated` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_uniq` ON `transfers` (`chain_key`,`tx_hash`,`log_index`);--> statement-breakpoint
CREATE INDEX `transfer_pr_idx` ON `transfers` (`payment_request_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`url` text NOT NULL,
	`status_code` integer,
	`duration_ms` integer NOT NULL,
	`error` text,
	`response_body` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`order_id` text,
	`payment_request_id` text,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_status_code` integer,
	`delivered_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whitelist_wallets` (
	`address` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`verified_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`to_address` text NOT NULL,
	`amount_micros` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
