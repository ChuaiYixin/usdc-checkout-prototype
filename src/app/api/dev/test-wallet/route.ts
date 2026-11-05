// DEV-ONLY test wallet backend. Lets the payment page's wallet flow (connect → switch chain → sign → send) be
// exercised end to end without a browser extension, using TEST_BUYER_PRIVATE_KEY from .env.
// Disabled unless NEXT_PUBLIC_DEV_TEST_WALLET=1 and not a production build. Only signs USDC transfer() calls
// and ownership messages; everything else is a read proxied to the RPC.
import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { LIVE_CHAIN } from "@/config/chains";
import { publicClient, walletClient } from "@/lib/chain";

const enabled = () => process.env.NEXT_PUBLIC_DEV_TEST_WALLET === "1" && process.env.NODE_ENV !== "production" && !!process.env.TEST_BUYER_PRIVATE_KEY;
const account = () => privateKeyToAccount(process.env.TEST_BUYER_PRIVATE_KEY as `0x${string}`);
const TRANSFER_SELECTOR = "0xa9059cbb";
const READS = new Set(["eth_blockNumber", "eth_call", "eth_estimateGas", "eth_getBalance", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getBlockByNumber", "eth_getTransactionCount", "eth_getCode"]);

export async function GET() {
  if (!enabled()) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, address: account().address });
}

export async function POST(req: Request) {
  if (!enabled()) return NextResponse.json({ error: "Test wallet disabled" }, { status: 404 });
  const { method, params } = (await req.json()) as { method: string; params?: unknown[] };
  try {
    if (method === "eth_sendTransaction") {
      const tx = (params?.[0] ?? {}) as { to?: string; data?: `0x${string}`; value?: string };
      if (tx.to?.toLowerCase() !== LIVE_CHAIN.usdcAddress!.toLowerCase() || !tx.data?.startsWith(TRANSFER_SELECTOR) || (tx.value && BigInt(tx.value) !== 0n)) {
        return NextResponse.json({ error: { code: 4100, message: "Test wallet only signs USDC transfer() calls" } });
      }
      const hash = await walletClient(account()).sendTransaction({ to: tx.to as `0x${string}`, data: tx.data });
      return NextResponse.json({ result: hash });
    }
    if (method === "eth_signTypedData_v4") {
      // only USDC EIP-3009 authorisations (gasless checkout)
      const typed = JSON.parse((params as [string, string])[1]);
      if (typed.primaryType !== "TransferWithAuthorization" || typed.domain?.verifyingContract?.toLowerCase() !== LIVE_CHAIN.usdcAddress!.toLowerCase()) {
        return NextResponse.json({ error: { code: 4100, message: "Test wallet only signs USDC transfer authorisations" } });
      }
      const { EIP712Domain: _ignored, ...types } = typed.types;
      return NextResponse.json({ result: await account().signTypedData({ domain: typed.domain, types, primaryType: typed.primaryType, message: typed.message }) });
    }
    if (method === "personal_sign") {
      const [message] = params as [`0x${string}`];
      return NextResponse.json({ result: await account().signMessage({ message: { raw: message } }) });
    }
    if (READS.has(method)) {
      return NextResponse.json({ result: await publicClient().request({ method: method as "eth_blockNumber", params: params as never }) });
    }
    return NextResponse.json({ error: { code: 4200, message: `Unsupported method ${method}` } });
  } catch (e) {
    return NextResponse.json({ error: { code: -32000, message: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message } });
  }
}
