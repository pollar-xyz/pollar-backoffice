/**
 * Next.js glue for Morapay's merchant Bridge API — the only Next-specific
 * file in this integration. All the actual signing/request logic lives in
 * `lib/morapay/` (framework-agnostic; copy that folder into any other Node
 * backend). This route just holds the key pair server-side (Morapay's own
 * docs are explicit: sk_* must never reach the browser) and forwards
 * /api/morapay/<rest> -> Morapay's /api/v1/merchant/<rest>, signed.
 */
import { NextRequest, NextResponse } from "next/server";
import { createMorapayBridgeClient } from "@/lib/morapay/client";

function getClient() {
  const publicKey = process.env.MORAPAY_PUBLIC_KEY ?? "";
  const secretKey = process.env.MORAPAY_SECRET_KEY ?? "";
  if (!publicKey || !secretKey) return null;
  return createMorapayBridgeClient({
    publicKey,
    secretKey,
    baseUrl: process.env.MORAPAY_BASE_URL,
  });
}

// This route is reachable by anyone who can hit the deployed app — there's
// no session/auth check here, only the shape of the request. So instead of
// forwarding any merchant-v1 path (which would let an anonymous caller hit
// things like bridge/wallets and repoint payouts), only forward the exact
// operations the Send tab actually uses. Extend this list deliberately, not
// by relaxing it to a wildcard.
function isAllowedPath(method: string, path: string[]): boolean {
  if (path[0] !== "bridge") return false;
  if (method === "POST") {
    return path.length === 2 && ["quote", "execute", "confirm"].includes(path[1]);
  }
  if (method === "GET") {
    return path.length === 3 && path[1] === "status" && path[2].length > 0;
  }
  return false;
}

async function proxy(req: NextRequest, path: string[]) {
  if (!isAllowedPath(req.method, path)) {
    return NextResponse.json(
      { success: false, error: "Not found", code: "MORAPAY_PATH_NOT_ALLOWED" },
      { status: 404 },
    );
  }

  const client = getClient();
  if (!client) {
    return NextResponse.json(
      {
        success: false,
        error:
          "MORAPAY_PUBLIC_KEY / MORAPAY_SECRET_KEY are not configured on this server. " +
          "Generate a key pair in the Morapay merchant dashboard (Developers -> API keys) and set them in .env.local.",
        code: "MORAPAY_CREDENTIALS_MISSING",
      },
      { status: 500 },
    );
  }

  const rawBody = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  const pathWithQuery = `/api/v1/merchant/${path.join("/")}${req.nextUrl.search ?? ""}`;
  const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;

  const { status, body } = await client.request(req.method, pathWithQuery, rawBody, idempotencyKey);
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
