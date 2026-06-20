/**
 * Turn Soroban simulation / submit errors into short, actionable messages.
 */
export function parseBlendError(raw: string): string {
  const text = raw.trim();

  if (
    text.includes("trustline entry is missing") ||
    (text.includes("Error(Contract, #13)") && text.includes("transfer"))
  ) {
    return (
      "Your wallet does not have a trustline for Blend testnet USDC yet. " +
      "Open “Manage USDC” below (or use the faucet at testnet.blend.capital) " +
      "to add the trustline and receive test tokens, then try lending again."
    );
  }

  if (text.includes("Insufficient balance") || text.includes("insufficient")) {
    return (
      "Not enough USDC in your wallet. Get Blend testnet USDC from " +
      "testnet.blend.capital (not Circle faucet — that is a different token)."
    );
  }

  if (text.includes("/auth/refresh") || text.includes("Unauthorized")) {
    return (
      "Your Pollar session expired. Return to the home page, sign in again, " +
      "then come back to this route."
    );
  }

  if (text.startsWith("HostError:") || text.includes("Diagnostic Event")) {
    if (text.includes("trustline")) {
      return parseBlendError("trustline entry is missing");
    }
    return (
      "The Blend transaction could not be simulated. Make sure you have testnet XLM, " +
      "a USDC trustline, and Blend testnet USDC balance."
    );
  }

  if (text.length > 280) {
    return `${text.slice(0, 280)}…`;
  }

  return text;
}
