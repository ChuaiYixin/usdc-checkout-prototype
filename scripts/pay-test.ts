// Sends a REAL Base Sepolia USDC payment from TEST_BUYER_PRIVATE_KEY to a payment request's deposit address.
//   npm run pay:test -- <paymentRequestId> [amount in on-chain USDC, e.g. 0.9]
// Useful for testing without a browser wallet. The demo video should still use MetaMask.
import { loadEnv } from "../src/lib/env";
import { parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

loadEnv();

async function main() {
  const [id, amountArg] = process.argv.slice(2);
  if (!id) throw new Error("Usage: npm run pay:test -- <paymentRequestId> [amount]");
  const key = process.env.TEST_BUYER_PRIVATE_KEY as `0x${string}`;
  if (!key) throw new Error("TEST_BUYER_PRIVATE_KEY missing — run `npm run setup`");
  const { getPaymentView } = await import("../src/lib/payments");
  const { erc20Abi, publicClient, walletClient } = await import("../src/lib/chain");
  const view = await getPaymentView(id);
  if (!view) throw new Error("Payment request not found");
  const buyer = privateKeyToAccount(key);
  const amount = amountArg ? parseUnits(amountArg, 6) : BigInt(view.amountOnchain);
  const c = publicClient();
  const [usdc, eth] = await Promise.all([
    c.readContract({ address: view.tokenAddress as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] }),
    c.getBalance({ address: buyer.address }),
  ]);
  console.log(`buyer ${buyer.address}: ${Number(usdc) / 1e6} USDC, ${Number(eth) / 1e18} ETH`);
  if (usdc < amount) throw new Error("Not enough test USDC — get some at https://faucet.circle.com (Base Sepolia)");
  if (eth === 0n) throw new Error("No Base Sepolia ETH for gas");
  const hash = await walletClient(buyer).writeContract({
    address: view.tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: "transfer",
    args: [view.address as `0x${string}`, amount],
  });
  console.log(`sent ${Number(amount) / 1e6} USDC → ${view.address}\ntx https://sepolia.basescan.org/tx/${hash}`);
  const r = await c.waitForTransactionReceipt({ hash });
  console.log(`mined in block ${r.blockNumber} (${r.status})`);
}

main().catch((e) => {
  console.error(e.shortMessage ?? e.message ?? e);
  process.exit(1);
});
