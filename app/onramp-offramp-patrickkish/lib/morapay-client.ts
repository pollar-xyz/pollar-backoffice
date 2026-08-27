"use client";

/**
 * Browser-side helper for the Send tab. Talks only to our own Next.js proxy
 * (app/api/morapay/[...path]/route.ts) — never to Morapay directly, since
 * that requires a secret key that must stay server-side. Copy this file
 * alongside the proxy route (and lib/morapay/) into another app to reuse the
 * same pattern there.
 */
import { MorapayApiError } from "@/lib/morapay/types";
export * from "@/lib/morapay/types";

export async function callMorapay<T>(
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const res = await fetch(`/api/morapay/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new MorapayApiError(
      json?.error ?? `Morapay request failed (HTTP ${res.status})`,
      json?.code,
    );
  }
  return json.data as T;
}
