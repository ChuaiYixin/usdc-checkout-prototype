// Client-safe: the buyer signs this exact text; the server verifies it.
export function ownershipMessage(paymentRequestId: string, address: string) {
  return [
    "Verify wallet ownership for a USDC payment.",
    "",
    `Payment request: ${paymentRequestId}`,
    `Wallet: ${address}`,
    "",
    "This signature is free and does not move any funds.",
  ].join("\n");
}
