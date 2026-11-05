// Simple generic marks (not official logos).
export function UsdcIcon({ className = "h-6 w-6", mono = false }: { className?: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="16" fill={mono ? "currentColor" : "#2775CA"} opacity={mono ? 0.25 : 1} />
      <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
        $
      </text>
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.9" />
    </svg>
  );
}

export function ChainDot({ chainKey, className = "h-5 w-5" }: { chainKey: string; className?: string }) {
  const color = chainKey === "base-sepolia" ? "#0052FF" : chainKey === "ethereum-sepolia" ? "#627EEA" : "#14F195";
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <circle cx="10" cy="10" r="10" fill={color} />
      {chainKey === "base-sepolia" && <rect x="5" y="8.6" width="10" height="2.8" rx="1" fill="#fff" />}
      {chainKey === "ethereum-sepolia" && <path d="M10 3.5 6 10.2l4 2.4 4-2.4zM10 13.4 6 11l4 5.6 4-5.6z" fill="#fff" />}
      {chainKey === "solana-devnet" && <path d="M6 6.5h8l-1.5 1.6h-8zM6 11.2h8l-1.5-1.6h-8zM6 13.4h8l-1.5 1.6h-8z" fill="#111" />}
    </svg>
  );
}
