// Moves a little Base Sepolia ETH from the test buyer wallet to the gas sponsor (refund gas).
//   npm run fund:sponsor -- [eth amount, default 0.003]
import { loadEnv } from "../src/lib/env";
import { formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

loadEnv();

async function main() {
  const amount = parseEther(process.argv[2] ?? "0.003");
  const { publicClient, walletClient } = await import("../src/lib/chain");
  const { gasSponsor } = await import("../src/lib/hd");
  const buyer = privateKeyToAccount(process.env.TEST_BUYER_PRIVATE_KEY as `0x${string}`);
  const c = publicClient();
  const bal = await c.getBalance({ address: buyer.address });
  if (bal < amount) throw new Error(`Test buyer has only ${formatEther(bal)} ETH`);
  const hash = await walletClient(buyer).sendTransaction({ to: gasSponsor().address, value: amount });
  await c.waitForTransactionReceipt({ hash });
  console.log(`sent ${formatEther(amount)} ETH → gas sponsor ${gasSponsor().address}\nhttps://sepolia.basescan.org/tx/${hash}`);
}

main().catch((e) => {
  console.error(e.shortMessage ?? e.message ?? e);
  process.exit(1);
});
