import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Amount columns: *_micros = nominal USDC micros (6dp), *_onchain = on-chain base units. Both stored as
// TEXT so bigint values never lose precision. Timestamps are unix milliseconds.

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(), // e.g. ORD-10421
  createdAt: integer("created_at").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  country: text("country").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  itemsJson: text("items_json").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: text("status").notNull(), // awaiting_payment | paid | refunded | expired | needs_review
  source: text("source").notNull().default("store"), // store | payment_link | api
  merchantReference: text("merchant_reference"), // merchant's own order id (API) or payment link id
  travelRuleTier: text("travel_rule_tier").notNull(), // basic | enhanced
  travelRuleJson: text("travel_rule_json").notNull(),
  simulated: integer("simulated").notNull().default(0),
});

export const paymentRequests = sqliteTable(
  "payment_requests",
  {
    id: text("id").primaryKey(), // pr_xxx
    orderId: text("order_id").notNull(),
    chainKey: text("chain_key").notNull(),
    address: text("address").notNull(),
    derivationIndex: integer("derivation_index").notNull(),
    tokenAddress: text("token_address").notNull(),
    amountMicros: text("amount_micros").notNull(),
    amountOnchain: text("amount_onchain").notNull(),
    divisor: integer("divisor").notNull(),
    expiresAt: integer("expires_at").notNull(),
    // awaiting_payment | confirming | underpaid | succeeded | expired | exception | under_review | refunded
    status: text("status").notNull(),
    // none | pending_finality | available | frozen | settled | refunded
    fundsStatus: text("funds_status").notNull().default("none"),
    receivedOnchain: text("received_onchain").notNull().default("0"),
    excessRefundedOnchain: text("excess_refunded_onchain").notNull().default("0"),
    payerAddress: text("payer_address"),
    firstTxHash: text("first_tx_hash"),
    confirmations: integer("confirmations").notNull().default(0),
    successThreshold: integer("success_threshold").notNull(),
    finalityThreshold: integer("finality_threshold").notNull(),
    feeMicros: text("fee_micros").notNull().default("0"),
    walletVerifiedAddress: text("wallet_verified_address"),
    screeningCleared: integer("screening_cleared").notNull().default(0),
    hasNonUsdc: integer("has_non_usdc").notNull().default(0),
    payerIsExchange: integer("payer_is_exchange").notNull().default(0),
    fundedVia: text("funded_via"), // wallet | gasless | qr | onramp (how the buyer paid; for the funnel)
    succeededAt: integer("succeeded_at"),
    availableAt: integer("available_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    simulated: integer("simulated").notNull().default(0),
  },
  (t) => [index("pr_order_idx").on(t.orderId), uniqueIndex("pr_address_idx").on(t.chainKey, t.address)],
);

export const transfers = sqliteTable(
  "transfers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chainKey: text("chain_key").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockHash: text("block_hash").notNull(),
    blockTimestamp: integer("block_timestamp").notNull(), // ms
    tokenAddress: text("token_address").notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    kind: text("kind").notNull(), // usdc | non_usdc
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    amountOnchain: text("amount_onchain").notNull(),
    paymentRequestId: text("payment_request_id").notNull(),
    status: text("status").notNull(), // seen | confirmed | reorged
    confirmations: integer("confirmations").notNull().default(0),
    late: integer("late").notNull().default(0), // arrived after the request expired
    acceptedLate: integer("accepted_late").notNull().default(0),
    screeningHit: integer("screening_hit").notNull().default(0),
    screeningLabel: text("screening_label"),
    simulated: integer("simulated").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("transfer_uniq").on(t.chainKey, t.txHash, t.logIndex), index("transfer_pr_idx").on(t.paymentRequestId)],
);

export const exceptions = sqliteTable("exceptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paymentRequestId: text("payment_request_id").notNull(),
  orderId: text("order_id").notNull(),
  transferId: integer("transfer_id"),
  // underpaid | underpaid_expired | overpaid | late_payment | non_usdc | screening_hit
  type: text("type").notNull(),
  status: text("status").notNull(), // open | resolved | auto_resolved
  amountOnchain: text("amount_onchain").notNull().default("0"),
  defaultAction: text("default_action").notNull(),
  resolution: text("resolution"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

export const refunds = sqliteTable("refunds", {
  id: text("id").primaryKey(), // rf_xxx
  paymentRequestId: text("payment_request_id").notNull(),
  orderId: text("order_id").notNull(),
  exceptionId: integer("exception_id"),
  reason: text("reason").notNull(), // merchant_full | overpayment_excess | underpaid_expired | late_payment | non_usdc_return
  kind: text("kind").notNull(), // full | partial
  tokenAddress: text("token_address").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  toAddress: text("to_address").notNull(),
  amountOnchain: text("amount_onchain").notNull(),
  method: text("method").notNull(), // eip3009 | gas_topup | simulated
  status: text("status").notNull(), // blocked | queued | submitted | succeeded | failed
  screeningResult: text("screening_result").notNull(),
  txHash: text("tx_hash"),
  error: text("error"),
  buyerNotifiedAt: integer("buyer_notified_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(), // evt_xxx
  type: text("type").notNull(),
  orderId: text("order_id"),
  paymentRequestId: text("payment_request_id"),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull(), // pending | delivered | failed
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull(),
  lastStatusCode: integer("last_status_code"),
  deliveredAt: integer("delivered_at"),
  createdAt: integer("created_at").notNull(),
});

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull(),
  attempt: integer("attempt").notNull(),
  url: text("url").notNull(),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms").notNull(),
  error: text("error"),
  responseBody: text("response_body"),
  createdAt: integer("created_at").notNull(),
});

// What the mock merchant server (/api/mock-merchant/webhook) received.
export const mockMerchantInbox = sqliteTable("mock_merchant_inbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  signatureValid: integer("signature_valid").notNull(),
  respondedWith: integer("responded_with").notNull(),
  body: text("body").notNull(),
  receivedAt: integer("received_at").notNull(),
});

// Order / payment timeline shown on the order detail page.
export const activity = sqliteTable(
  "activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id").notNull(),
    paymentRequestId: text("payment_request_id"),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("activity_order_idx").on(t.orderId)],
);

// Simulated high-risk / sanctioned address list (R15). Never a real sanctions list.
export const riskAddresses = sqliteTable("risk_addresses", {
  address: text("address").primaryKey(), // lowercase
  label: text("label").notNull(),
  addedAt: integer("added_at").notNull(),
});

export const restrictedRegions = sqliteTable("restricted_regions", {
  code: text("code").primaryKey(),
  reason: text("reason").notNull(),
  addedAt: integer("added_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Simulated daily settlement (R10): USDC -> SGD conversion and bank credit.
export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(), // stl_YYYYMMDD
  date: text("date").notNull(), // YYYY-MM-DD (SGT)
  preference: text("preference").notNull(), // auto_sgd | hold_usdc
  usdcMicros: text("usdc_micros").notNull(),
  fxRate: real("fx_rate").notNull(),
  fxFeeSgdCents: integer("fx_fee_sgd_cents").notNull(),
  sgdNetCents: integer("sgd_net_cents").notNull(),
  bankCreditCents: integer("bank_credit_cents"), // what the (simulated) bank statement shows
  bankRef: text("bank_ref"),
  bankCreditedAt: integer("bank_credited_at"),
  status: text("status").notNull(), // converted | credited
  createdAt: integer("created_at").notNull(),
});

export const settlementItems = sqliteTable("settlement_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  settlementId: text("settlement_id").notNull(),
  paymentRequestId: text("payment_request_id").notNull(),
  orderId: text("order_id").notNull(),
  grossMicros: text("gross_micros").notNull(),
  feeMicros: text("fee_micros").notNull(),
  netMicros: text("net_micros").notNull(),
  fxIncluded: integer("fx_included").notNull().default(1),
});

// Checkout conversion funnel. subject = payment request id, or an anonymous browser session id before an
// order exists. Steps are counted once per subject; "error" rows record why buyers dropped off.
export const funnelEvents = sqliteTable(
  "funnel_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subject: text("subject").notNull(),
    step: text("step").notNull(),
    meta: text("meta"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("funnel_subject_idx").on(t.subject, t.step)],
);

// Payer-address labels (simulated): known exchange hot wallets. A payment from one of these can't be refunded
// reliably to the buyer, so refunds go through a verified refund-address claim instead (PRD 开放问题 #1).
export const addressLabels = sqliteTable("address_labels", {
  address: text("address").primaryKey(), // lowercase
  kind: text("kind").notNull(), // exchange
  label: text("label").notNull(),
});

// Refund-address claims for buyers who paid from an exchange.
export const refundClaims = sqliteTable("refund_claims", {
  id: text("id").primaryKey(), // rc_xxx (also the secret part of the buyer's claim link)
  paymentRequestId: text("payment_request_id").notNull(),
  orderId: text("order_id").notNull(),
  amountOnchain: text("amount_onchain").notNull(),
  email: text("email").notNull(),
  otp: text("otp").notNull(), // simulated email code
  status: text("status").notNull(), // sent | submitted | approved | rejected
  newAddress: text("new_address"),
  screeningResult: text("screening_result"),
  refundId: text("refund_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Merchant API keys and no-code payment links.
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(), // shown in UI, e.g. sk_test_ab12…
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
});

export const paymentLinks = sqliteTable("payment_links", {
  id: text("id").primaryKey(), // pl_xxx
  title: text("title").notNull(),
  amountCents: integer("amount_cents").notNull(),
  active: integer("active").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// R11: whitelisted withdrawal wallets for merchants who hold USDC.
export const whitelistWallets = sqliteTable("whitelist_wallets", {
  address: text("address").primaryKey(),
  label: text("label").notNull(),
  verifiedAt: integer("verified_at").notNull(),
});

export const withdrawals = sqliteTable("withdrawals", {
  id: text("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  amountMicros: text("amount_micros").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});
