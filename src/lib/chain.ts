// viem clients for the one live testnet (server/worker side).
import { createPublicClient, createWalletClient, http, parseAbi, type Account } from "viem";
import { baseSepolia } from "viem/chains";

export const viemChain = baseSepolia;

export function rpcUrl() {
  return process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
}

let _public: ReturnType<typeof makePublic> | undefined;
function makePublic() {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl(), { retryCount: 2, timeout: 15_000 }) });
}
export function publicClient() {
  return (_public ??= makePublic());
}

export function walletClient(account: Account) {
  return createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl(), { timeout: 20_000 }) });
}

export const erc20Abi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function version() view returns (string)",
]);

// EIP-3009 (implemented by Circle's FiatToken v2+). Lets a deposit address authorise a USDC transfer with a
// signature while the gas sponsor submits and pays gas — deposit addresses never need ETH.
export const eip3009Abi = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

export const transferEvent = erc20Abi[0];
