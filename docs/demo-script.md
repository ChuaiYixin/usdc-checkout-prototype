# 60-second demo script

Goal: show one USDC payment end to end, then prove that the "dirty work" (exceptions, compliance, reconciliation) is built in. The script is for the top of the portfolio page; interviewers will rarely connect a wallet themselves.

## Before recording

- [ ] `npm run dev` is running; the sidebar shows **Chain watcher online**.
- [ ] MetaMask holds Base Sepolia ETH and at least 2 test USDC; the gas sponsor has ETH (`npm run wallets`).
- [ ] Run `npm run db:reset` for a clean list (stop `dev` first), then start `dev` again.
- [ ] Prepare a second order and use **Simulator → Underpay** so the exception queue isn't empty.
- [ ] Browser at 1440×900, zoom 110%, MetaMask pinned. Hide bookmarks.
- [ ] Keep the second tab on `/merchant` open.

## Shot list

| Time | Screen | Action | Voice-over (EN) |
| --- | --- | --- | --- |
| 0–5 s | `/store` | Show the $120 order and the "Pay with USDC" option | "A US shopper buys from a Singapore designer store and pays 120 dollars in USDC." |
| 5–8 s | `/store` | Switch country to Indonesia, then back | "Buyers in restricted markets, like Indonesia, never see the option." |
| 8–15 s | `/pay/:id` | Point at the timer, the chain picker and the blue BASE SEPOLIA banner | "Every order gets its own deposit address, a 15-minute quote, and one network in big letters — wrong-chain transfers are the #1 failure." |
| 15–25 s | MetaMask | Connect (auto-switches chain) → **Pay — no gas needed** → Sign | "Connect, and the wallet switches network for you. The buyer doesn't even need ETH: they sign once and we pay the network fee." |
| 25–32 s | `/pay/:id` | Confirming progress bar → **Payment successful** with Basescan link | "The watcher sees it on-chain, waits for confirmations, and matches it to the order automatically." |
| 32–40 s | `/merchant/orders/:id` | Tx hash, confirmations, fee, timeline; funds show **Pending finality** (cut to a pre-recorded order already **Available**) | "The buyer gets 'success' in about two seconds, but the merchant's funds only become available once the block is posted to Ethereum — about a minute and a half." |
| 40–45 s | `/merchant/webhooks` | Delivered events, then a red retry | "Every change is pushed by signed webhook with automatic retries." |
| 45–52 s | `/ops/exceptions` | Underpaid / screening hit cards with one-click defaults | "Underpaid, overpaid, late, wrong token or a flagged wallet — each has a default rule, because on-chain payments can't be reversed." |
| 52–58 s | `/merchant/reconciliation` | Red mismatch row, then Export CSV | "Finance reconciles chain, FX and bank daily; breaks are flagged in red." |
| 58–60 s | `/` | Disclaimer visible | "Testnet only — built in two weeks with AI coding tools." |

## Optional cut-ins (if there's time, or for a longer version)

- Refund in full: confirm → Basescan shows a `transferWithAuthorization` sent by the gas sponsor ("gasless refund via EIP-3009").
- No USDC? The **Use a card** tab shows a simulated on-ramp partner delivering USDC straight to the order ("the merchant still gets final, chargeback-free USDC").
- Exchange payer: Simulator → *Pay from an exchange* → **Refund via claim link** → the buyer's claim page ("answers the PRD's open question on exchange refunds").
- Merchant onboarding: create a payment link at `/merchant/links` and open it on a phone.
- Webhook outage: toggle **Simulate endpoint outage**, place an order, then show the retries recovering.
- Enhanced travel rule: set quantity to 25 and show the extra fields plus the wallet-ownership signature.

## Backup plan

If the testnet is slow while recording, use **Simulator → Exact payment** on the same order. The flow is identical, and the transfer shows a *Simulated* tag, so the shot stays honest.
