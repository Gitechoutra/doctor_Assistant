-- Records how an OP was paid for (cash/UPI/card), captured by reception on
-- the ADD OP flow. NULL means unpaid/not recorded — there is no separate
-- boolean column, `payment_type IS NOT NULL` is the paid/unpaid signal.
ALTER TABLE `appointments`
  ADD COLUMN `payment_type` enum('cash','upi','card') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `reason`;
