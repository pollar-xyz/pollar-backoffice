/**
 * Shared request/response shapes for Morapay's merchant Bridge API
 * (pesos <-> GHS via Stellar USDC). Framework-agnostic — safe to import from
 * both server code (lib/morapay/client.ts) and browser code that only talks
 * to your own proxy, never to Morapay directly.
 */

export type BridgeDirection = "PESOS_TO_GHS" | "GHS_TO_PESOS";

export type MorapayEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export type BridgeQuote = {
  quoteId: string;
  expiresAt: string;
  direction: BridgeDirection;
  source: { currency: string; amount: string };
  destination: { currency: string; amount: string };
  bridge: { chain: string; asset: string; amount: string; tokenAddress: string };
};

export type MomoRecipient = {
  phone: string;
  receiverName: string;
  providerHint?: string;
};

export type BridgePayment = {
  destination: string;
  amount: string;
  assetType: string;
  assetCode: string;
  assetIssuer: string;
  memo?: string | null;
};

export type BridgeExecuteResult = {
  bridgeTransferId: string;
  direction: BridgeDirection;
  status: string;
  partnerAction?: string;
  payment?: BridgePayment;
};

export type BridgeResult = {
  id?: string;
  direction?: BridgeDirection;
  status: string;
  source: { currency: string; amount: string };
  destination: { currency: string; amount: string };
  bridge?: { chain: string; asset: string; amount: string; tokenAddress: string };
  stellarTxHash?: string | null;
  momoReference?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const PESOS_CURRENCIES = ["BOB", "MXN", "ARS", "CLP", "COP", "PHP", "UYU", "DOP"] as const;

export const BRIDGE_TERMINAL_STATUSES: readonly string[] = ["COMPLETED", "FAILED", "EXPIRED"];

/** Thrown by callMorapay — carries Morapay's `code` (e.g. "QUOTE_EXPIRED") so callers can branch on it, not just the message. */
export class MorapayApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "MorapayApiError";
    this.code = code;
  }
}

/**
 * Ghanaians write and dial local numbers as 0XXXXXXXXX; Morapay's API wants
 * the international form (233XXXXXXXXX, no leading 0, no +). Accept whatever
 * the user types (0..., +233..., 233...) and normalize before it ever leaves
 * the browser.
 */
export function toGhanaInternationalPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return digits;
}

// Stellar memos are typed (text vs numeric id) — Morapay's docs only show
// `memo: "…"` as a placeholder, so this is a best-effort guess until a real
// value is confirmed: pure digits -> MEMO_ID, anything else -> MEMO_TEXT
// (28-byte cap). Flip this if a live execute response proves it wrong.
export function inferStellarMemo(
  memo: string | null | undefined,
): { type: "id" | "text"; value: string } | undefined {
  if (!memo) return undefined;
  return /^[0-9]+$/.test(memo) ? { type: "id", value: memo } : { type: "text", value: memo.slice(0, 28) };
}
