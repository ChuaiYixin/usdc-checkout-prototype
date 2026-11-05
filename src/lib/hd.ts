// HD wallet derivation (server only). One seed in .env; BIP-44 path m/44'/60'/0'/0/i.
//   i = 0      -> platform gas sponsor ("treasury") — pays gas for refunds, never holds customer funds
//   i = 1, 2.. -> one deposit address per payment request (PRD R7), so every transfer maps to exactly one order
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

export const GAS_SPONSOR_INDEX = 0;

function mnemonic() {
  const m = process.env.PLATFORM_MNEMONIC?.trim();
  if (!m) throw new Error("PLATFORM_MNEMONIC is missing — run `npm run setup` to generate a local testnet seed.");
  return m;
}

export function deriveAccount(index: number): HDAccount {
  return mnemonicToAccount(mnemonic(), { addressIndex: index });
}

export function deriveAddress(index: number) {
  return deriveAccount(index).address;
}

export function gasSponsor() {
  return deriveAccount(GAS_SPONSOR_INDEX);
}
