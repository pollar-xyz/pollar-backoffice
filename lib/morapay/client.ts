/**
 * Server-side client for Morapay's merchant Bridge API (pesos <-> GHS via
 * Stellar USDC). Framework-agnostic: construct with a key pair, call methods,
 * get typed responses. Copy `lib/morapay/` (this file + sign.ts + types.ts)
 * into any other Node backend — nothing here depends on Next.js.
 *
 * Never import this from browser code — it needs the secret key. Expose it
 * through your own server route/handler instead (see
 * app/api/morapay/[...path]/route.ts for the Next.js glue).
 */
import { signMorapayRequest } from "./sign";
import type {
  BridgeDirection,
  BridgeExecuteResult,
  BridgeQuote,
  BridgeResult,
  MomoRecipient,
  MorapayEnvelope,
} from "./types";

export type MorapayBridgeClientConfig = {
  publicKey: string;
  secretKey: string;
  /** Defaults to production. Point at a local/staging Core for testing. */
  baseUrl?: string;
};

export class MorapayBridgeClient {
  constructor(private readonly config: MorapayBridgeClientConfig) {}

  private get baseUrl() {
    return this.config.baseUrl ?? "https://api.morapay.io";
  }

  /**
   * Low-level escape hatch: same signing, any merchant-v1 path/body. This is
   * what a generic pass-through proxy route uses so it doesn't need one
   * hand-written branch per endpoint.
   */
  async request(
    method: string,
    pathWithQuery: string,
    rawBody = "",
    idempotencyKey?: string,
  ): Promise<{ status: number; body: unknown }> {
    const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
    const { timestamp, signature } = signMorapayRequest({
      secretKey: this.config.secretKey,
      method,
      pathWithQuery: path,
      rawBody,
    });
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "morapay-key": this.config.publicKey,
        "morapay-timestamp": timestamp,
        "morapay-signature": signature,
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: rawBody || undefined,
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }
    return { status: res.status, body };
  }

  private async call<T>(
    method: string,
    path: string,
    params?: unknown,
    idempotencyKey?: string,
  ): Promise<MorapayEnvelope<T>> {
    const rawBody = params === undefined ? "" : JSON.stringify(params);
    const { body } = await this.request(method, path, rawBody, idempotencyKey);
    return body as MorapayEnvelope<T>;
  }

  quote(params: {
    direction: BridgeDirection;
    sourceCurrency: string;
    sourceAmount: number;
    destCurrency?: string;
  }) {
    return this.call<BridgeQuote>("POST", "/api/v1/merchant/bridge/quote", params);
  }

  execute(
    params: { quoteId: string; momo?: MomoRecipient; partnerStellarAddress?: string },
    idempotencyKey?: string,
  ) {
    return this.call<BridgeExecuteResult>(
      "POST",
      "/api/v1/merchant/bridge/execute",
      params,
      idempotencyKey,
    );
  }

  confirm(
    params: { bridgeTransferId: string; stellarTxHash: string },
    idempotencyKey?: string,
  ) {
    return this.call<BridgeResult>("POST", "/api/v1/merchant/bridge/confirm", params, idempotencyKey);
  }

  status(bridgeTransferId: string) {
    return this.call<BridgeResult>("GET", `/api/v1/merchant/bridge/status/${bridgeTransferId}`);
  }

  listWallets() {
    return this.call<{ wallets: unknown[] }>("GET", "/api/v1/merchant/bridge/wallets");
  }

  upsertWallet(params: { stellarAddress: string; label?: string; enabled?: boolean }) {
    return this.call<unknown>("POST", "/api/v1/merchant/bridge/wallets", params);
  }
}

export function createMorapayBridgeClient(config: MorapayBridgeClientConfig): MorapayBridgeClient {
  return new MorapayBridgeClient(config);
}
