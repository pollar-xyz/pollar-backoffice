/**
 * Morapay merchant API request signing — HMAC-SHA256 over a canonical payload.
 * Pure Node `crypto`, zero framework dependencies. Copy this whole
 * `lib/morapay/` folder into any other Node/TypeScript backend that needs to
 * call Morapay's merchant API server-side — nothing here is Next.js-specific.
 *
 * Scheme (must match Morapay's own server-side verifier exactly):
 *   payload    = `${timestamp}.${METHOD}.${pathWithQuery}.${sha256hex(rawBody)}`
 *   signingKey = sha256(rawSecretKey)
 *   signature  = "v1=" + hmacSha256Hex(signingKey, payload)
 *
 * Never import this (or anything in lib/morapay/) from browser code — the
 * secret key must stay server-side.
 */
import { createHash, createHmac } from "node:crypto";

export const MORAPAY_KEY_HEADER = "morapay-key";
export const MORAPAY_TIMESTAMP_HEADER = "morapay-timestamp";
export const MORAPAY_SIGNATURE_HEADER = "morapay-signature";

export function signMorapayRequest(params: {
  secretKey: string;
  method: string;
  pathWithQuery: string;
  rawBody: string;
}): { timestamp: string; signature: string } {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = createHash("sha256").update(params.rawBody, "utf8").digest("hex");
  const payload = `${timestamp}.${params.method.toUpperCase()}.${params.pathWithQuery}.${bodyHash}`;
  const signingKey = createHash("sha256").update(params.secretKey.trim(), "utf8").digest();
  const signature = createHmac("sha256", signingKey).update(payload, "utf8").digest("hex");
  return { timestamp, signature: `v1=${signature}` };
}
