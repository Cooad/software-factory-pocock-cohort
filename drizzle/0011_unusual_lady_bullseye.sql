DROP TABLE `refunds`;--> statement-breakpoint
ALTER TABLE `coupons` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `revocation_reason` text;