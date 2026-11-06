# One USDC payment, end to end: a cross-border stablecoin checkout for a Singapore merchant

> Numbers marked *measured* come from real Base Sepolia runs of the prototype (24 Oct 2026). Numbers marked *assumption* are portfolio targets, not data. Third-party figures name their source.

## 1. The one-line result

A US shopper pays a Singapore store 120 USD in USDC. On testnet the buyer saw **"Payment successful" a median of 3.4 seconds after the transaction was mined**, every normal payment was **matched to its order automatically with zero manual steps**, and the merchant's funds became **available a median of 92 seconds after mining**, once the block was posted to Ethereum L1. (*Measured* on Base Sepolia, n = 5 real payments at the time of writing; see `/ops/metrics`.) Refunds, under/over/late payments, wrong tokens and flagged wallets each have a pre-agreed default and a one-click path. The buyer doesn't even need ETH: a **gasless checkout** lets them sign once while the platform pays the network fee.

[Prototype screenshots](screenshots/) · [PRD](PRD.md) · [Code](../README.md)

## 2. The problem

Small cross-border e-commerce merchants have three complaints about card acquiring: it's **expensive**, it's **slow**, and it **can be charged back**.

- *Expensive.* Card fees, cross-border fees and FX spread add up. As one reference point, [Stripe's Shadeform customer story](https://stripe.com/customers/shadeform) cites 1.5% to accept stablecoins against 4.5% for international credit cards. That is one customer's rate, not a price list.
- *Slow.* Card settlement takes days, which ties up a small merchant's cash.
- *Chargebacks.* A buyer can dispute long after delivery, and the merchant can lose both the goods and the money.

Stablecoins fix the first two and remove chargebacks. But they introduce **two new problems that are the actual product work**:

1. **Buyer friction and irreversible mistakes.** The buyer needs a wallet and USDC on the right chain, and must send exactly the right amount. Wrong chain or wrong amount is the most common failure, and on-chain transfers can't be reversed.
2. **Compliance.** That means AML screening, travel-rule data, and buyer-location restrictions (for example, Bank Indonesia prohibits crypto as a means of payment).

## 3. Users and scenario

| Role | Wants | Fears most |
| --- | --- | --- |
| Merchant: Singapore designer-accessories shop, ~$100 AOV | A cheaper rail and faster cash | Receiving tainted money; funds stuck on-chain |
| Buyer: US consumer holding USDC | To pay as easily as with a card | Wrong chain, wrong amount, merchant not recognising the payment |
| Finance/ops: part-time bookkeeper or PSP ops | Daily match of chain ↔ orders ↔ bank | A chain transfer that maps to no order |

Why a US buyer: buyer location is itself a product requirement. Some Southeast Asian markets restrict crypto payments, so a "restricted region" list is built into checkout.

## 4. The solution

**Design principle: the buyer does two things, pick USDC and sign. Everything else is ours.**

```
Pick USDC → payment request (amount · unique address · chain · 15-min quote) → wallet signs
→ on-chain confirmation → screening + automatic order match → merchant webhook
→ daily SGD conversion → bank credit → three-way reconciliation
```

What the prototype does (Base Sepolia testnet; FX and banking simulated and labelled):

- **Checkout.** A "Pay with USDC" option appears only for allowed regions. The payment page has a 15-minute countdown and shows **the network name in large type** (the cheapest fix for the #1 failure). The wallet switches chains automatically, and amount and address are pre-filled, either from a connected wallet or from an EIP-681 QR code.
- **One deposit address per payment request**, derived from an HD key. Every incoming transfer maps to exactly one order, so matching needs no amount tricks or memo fields.
- **Chain watcher.** It reads all ERC-20 `Transfer` events sent to our addresses, so a wrong token is caught too. It counts confirmations, re-checks receipts for reorgs, screens the payer, then moves a state machine forward: awaiting → confirming → succeeded / underpaid / under review / expired / exception.
- **Merchant dashboard.** Every order shows its tx hash with an explorer link, confirmations, fee, travel-rule record and a timeline. Signed webhooks retry automatically. Refunds go back **only to the original address**, re-screened first.
- **Gasless refunds.** The deposit address signs a USDC **EIP-3009** authorisation and the platform's gas wallet submits it, so deposit addresses never need ETH.
- **Exception queue.** Each exception type has a default: underpaid (top up within the window, otherwise refund), overpaid (complete the order and auto-refund the excess), late (merchant accepts or refunds), non-USDC (never credited, returned), screening hit (frozen; the buyer only sees "processing").
- **Settlement and reconciliation.** Daily SGD conversion by default, with the rate and fee shown first, or the merchant can hold USDC. A three-column chain ↔ FX ↔ bank match turns mismatches red and exports to CSV.

Verified on the real testnet: a full payment, a full refund, underpay then top-up, overpay with automatic excess refund, and a gasless payment. Transaction links are in the README.

### Beyond the PRD: what building it taught me to add

Running the prototype surfaced two gaps. Each is now a numbered requirement (R18–R19, in [PRD-additions.md](PRD-additions.md)):

- **Gasless checkout (R18).** The card-vs-stablecoin comparison lists "no token for gas" as a top failure reason. With USDC's EIP-3009, the buyer *signs* an authorisation for exactly the amount due, and the platform submits it and pays the gas. The platform only sponsors exact-amount, exact-address authorisations (rate-limited), so gas sponsorship can't be abused. Verified on testnet from a brand-new wallet holding exactly 0 ETH: it signed, the order succeeded, and it still held 0 ETH afterwards.
- **Checkout funnel (R19).** Completion rate alone isn't actionable. The funnel splits it into view → request → connect → sign → detected → success and records *why* buyers drop (rejected in wallet, no gas, insufficient USDC, wrong network).

The dashboard walks through these decisions in a three-flow [guided tour](../README.md#guided-tour), with steps that complete themselves as the app sees them happen.

## 5. Key trade-offs

**Split "buyer sees success" from "merchant can use the money," rather than one finality threshold.**
Waiting for full finality before telling the buyer anything would mean minutes of spinner at checkout. Showing success at the first block would let a reorg release money the merchant never really got. So the prototype uses two states. The buyer sees success after 10 blocks (3.4 s median, *measured*). Merchant funds become available only once the block is in the chain's **L1-safe head** (92 s median, *measured*), with a fresh reorg check right before release. I first set this as "15 confirmations", assuming 2-second blocks. Measuring the real chain (0.2 s per block) showed that meant about 3 seconds, which is why the rule is now tied to L1 posting rather than a block count.

**Refund only to the original paying address, not to an address the buyer provides.**
"Send it to this other address" is the classic fraud and laundering path. The cost is real: a buyer who paid from an exchange's hot wallet may not receive the refund. The checkout tells buyers to pay from their own wallet, and how to serve exchange payers remains an open question in the PRD.

**Default settlement: convert to SGD daily, rather than holding USDC.**
Target merchants pay rent and salaries in SGD, and for a crypto-unfamiliar merchant "money back in my bank" is the strongest reassurance. Holding USDC (with whitelisted withdrawals and second-factor verification) is one switch away.

**Three chains in the picker, one live, rather than every chain that has USDC.**
Each chain adds a watcher, confirmation rules, an off-ramp and another way to send on the wrong network.

**Sponsor the buyer's gas rather than require ETH.**
A buyer holding only USDC is exactly our customer, and "go buy some ETH first" ends the checkout. Sponsoring gas costs the platform a fraction of a cent per payment on Base, which is cheaper than the conversion it saves. The risk is abuse, so sponsorship is limited to exact-amount, exact-address authorisations for a live request, at most once per 30 s.

**A unique address per payment rather than one address plus a reference or amount tag.**
Matching becomes 100% automatic. The cost is key management and gas, which EIP-3009 refunds sidestep.

## 6. Metrics

North star: **weekly value of stablecoin orders successfully credited.** It requires both "buyer could pay" and "merchant got paid".

| Metric | Definition | Target (*assumption*) | Prototype signal |
| --- | --- | --- | --- |
| Payment completion rate | Paid within the window ÷ requests created | ≥ the merchant's card completion rate | Computed live on `/ops/metrics` (test traffic, so not meaningful yet) |
| Exception rate | Arrivals entering the exception queue ÷ all arrivals | < 2% | Computed live; inflated on purpose by edge-case tests |
| Payment → buyer success | Median time from block to "Payment successful" | Seconds | 3.4 s median, n = 5 (*measured*) |
| Payment → available | Median time from buyer payment to merchant funds available | < 15 min | 92 s median, n = 5 (*measured*, L1-safe) |
| Payment → SGD in bank | — | Next business day | Simulated |
| All-in merchant cost | Platform fee + FX spread | Below current card acquiring | 1.0% + 0.3% (*illustrative*, not real pricing) |
| Auto-reconciliation rate | Matched to order and bank with no human | > 98% | Breaks flagged in red; CSV export |

Guardrails (must not get worse): refund failure rate, screening false-positive rate.

## 7. Risks and boundaries

- **Regulatory.** The travel-rule tiers follow [MAS Notice PSN02](https://www.mas.gov.sg/-/media/amld-amendments---30-june-2025/mas-notice-psn02.pdf) (last revised 30 June 2025): paragraph 13.4 up to S$1,500 and paragraph 13.6 above it. Above the threshold, the notice also requires verifying the originator's identity. The prototype collects the fields but doesn't perform that verification. The threshold is a config value, not hard-coded. Self-hosted wallets get a free signature proof of control for enhanced-tier orders. This isn't legal advice, and the fictional PSP is assumed to be licensed.
- **Screening is a demo list.** Production would use a sanctions and blockchain-analytics provider. Screening runs on payers before funds are credited, and on refund destinations before money moves.
- **Out of scope:** other stablecoins, buyer fiat on-ramp, disputes and arbitration, partial refunds, multi-language checkout, subscriptions.
- **Prototype limits:** testnet only; on-chain amounts scaled to 1/100 because the faucet gives 20 USDC every 2 hours; no treasury sweep; no auth on dashboards. Refunds of orders already converted to SGD are blocked, because they would need a payout debit that isn't modelled.

## 8. Retrospective

- **What I'd keep.** Writing the exception table *before* the UI. Every row became a state and a default action, and the hardest bugs were all in those rows.
- **What surprised me.** "It works on testnet" was not the same as "the risk model is right". The finality rule was wrong by 10× until I measured block times. An adversarial review found double-refund and stranded-funds paths that no happy-path demo would show.
- **What I'd do next.** Interview 5–10 merchants about "USD ledger, periodic SGD conversion". Decide the refund policy for buyers who paid from an exchange. Replace the demo screening list with a real analytics provider. Add a second live chain to test whether the chain picker really prevents wrong-chain sends.
- **How AI changed the work.** I built the prototype with AI coding tools, then ran a separate AI review given only the code. It found 11 issues that happy-path testing missed, and each became a regression test. AI also made wrong assumptions, including the block time behind the finality rule, so I checked the numbers against the real chain.
