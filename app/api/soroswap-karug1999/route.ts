import { NextRequest, NextResponse } from "next/server";
import {
  buildSoroswapSwapXdr,
  buildSorobanAuthFallback,
} from "../../soroswap-karug1999/lib/buildSwapXdr";

// Static fallback: verified Soroswap testnet contract addresses.
// Source: github.com/soroswap/core/public/tokens.json (network: testnet)
const TESTNET_TOKENS = [
  {
    code: "XLM",
    contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    name: "Stellar Lumens",
    decimals: 7,
  },
  {
    code: "USDC",
    contract: "CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F",
    name: "USD Coin",
    decimals: 7,
  },
  {
    code: "EURC",
    contract: "CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT",
    name: "EUR Coin",
    decimals: 7,
  },
  {
    code: "AQUA",
    contract: "CDBCM2JWK2ERIE6EAVAZJJW3P25U5S3FLNHJDY72AVSVAVTU4E6NAQ43",
    name: "AQUA Token",
    decimals: 7,
  },
  {
    code: "BTC",
    contract: "CB7ICEHVRIRMF3CF6SIP2C2R3Z4E7WRPATT552QSVLIXZ5RSN6KLUDAE",
    name: "Bitcoin",
    decimals: 7,
  },
];

// Decodes a Stellar G-address (StrKey base32) to its raw 32-byte ed25519 pubkey.
function strKeyDecode(address: string): Buffer {
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const tbl: Record<string, number> = {};
  for (let i = 0; i < 32; i++) tbl[ALPHA[i]] = i;
  let bits = 0, bitsLen = 0;
  const out: number[] = [];
  for (const c of address.toUpperCase()) {
    const v = tbl[c];
    if (v === undefined) continue;
    bits = (bits << 5) | v;
    bitsLen += 5;
    if (bitsLen >= 8) { bitsLen -= 8; out.push((bits >> bitsLen) & 0xff); }
  }
  // out[0] = version byte (0x30), out[1..32] = pubkey, out[33..34] = checksum
  return Buffer.from(out.slice(1, 33));
}

// Builds a valid Stellar BUMP_SEQUENCE TransactionEnvelope using the wallet's
// real account and seqNum from Horizon — avoids txBadSeq on submission.
async function buildMockXdr(from: string): Promise<string> {
  const pubkey = strKeyDecode(from);

  let seqNum = BigInt(1);
  try {
    const res = await fetch(
      `https://horizon-testnet.stellar.org/accounts/${from}`,
    );
    if (res.ok) {
      const acc = (await res.json()) as { sequence: string };
      seqNum = BigInt(acc.sequence) + BigInt(1);
    }
  } catch {
    // fallback: seqNum stays 1 (tx will fail on submit but signing dialog still works)
  }

  const buf = Buffer.alloc(88);
  let o = 0;
  buf.writeUInt32BE(2, o); o += 4;          // ENVELOPE_TYPE_TX
  buf.writeUInt32BE(0, o); o += 4;          // KEY_TYPE_ED25519
  pubkey.copy(buf, o); o += 32;             // ed25519 pubkey (real account)
  buf.writeUInt32BE(100, o); o += 4;        // fee = 100 stroops
  buf.writeBigInt64BE(seqNum, o); o += 8;   // seqNum = current + 1
  buf.writeUInt32BE(0, o); o += 4;          // PRECOND_NONE
  buf.writeUInt32BE(0, o); o += 4;          // MEMO_NONE
  buf.writeUInt32BE(1, o); o += 4;          // 1 operation
  buf.writeUInt32BE(0, o); o += 4;          // op sourceAccount: absent
  buf.writeUInt32BE(11, o); o += 4;         // BUMP_SEQUENCE = 11
  buf.writeBigInt64BE(seqNum, o); o += 8;   // bumpTo = seqNum (no-op)
  buf.writeUInt32BE(0, o); o += 4;          // tx.ext = 0
  buf.writeUInt32BE(0, o);                  // 0 signatures
  return buf.toString("base64");
}

async function buildMockQuoteResponse(
  amount: bigint,
  assetIn: string,
  assetOut: string,
  from: string,
) {
  const amountOut = (amount * BigInt(98)) / BigInt(100);
  const threshold = (amountOut * BigInt(995)) / BigInt(1000);
  return {
    amountIn: amount.toString(),
    amountOut: amountOut.toString(),
    otherAmountThreshold: threshold.toString(),
    priceImpactPct: "0.10",
    routePlan: [
      {
        swapInfo: { protocol: "soroswap-simulation", path: [assetIn, assetOut] },
        percent: "100",
      },
    ],
    xdr: await buildMockXdr(from),
    simulated: true,
  };
}

// Fixed-point: "10.5" + decimals=7 → 105000000. String-only — no float math.
function parseAmount(raw: string, decimals: number): bigint {
  const [int, frac = ""] = raw.replace(",", ".").split(".");
  return BigInt(int + frac.padEnd(decimals, "0").slice(0, decimals));
}

// GET /api/soroswap-karug1999 — testnet token list (static, verified contracts)
export async function GET() {
  return NextResponse.json({
    ok: true,
    data: { network: "testnet", assets: TESTNET_TOKENS },
  });
}

type SwapBody = {
  assetIn: string;
  assetOut: string;
  amountRaw: string;
  decimalsIn?: number;
  from: string;
};

// POST /api/soroswap-karug1999 — quote + unsigned XDR
// POST /api/soroswap-karug1999?spike=true — direct Soroban auth XDR, no aggregator
export async function POST(req: NextRequest) {
  // ── Spike validation branch ──────────────────────────────────────────────────
  // Bypasses the Soroswap aggregator entirely. Simulates a USDC SAC `approve`
  // call exactly once, returning authentic SorobanAuthorizationEntry XDR for
  // Pollar to sign without relying on live pool liquidity or routing.
  if (req.nextUrl.searchParams.get("spike") === "true") {
    let from: string;
    try {
      const spikeBody = (await req.json()) as { from?: string };
      from = spikeBody.from ?? "";
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }
    if (!from) {
      return NextResponse.json({ ok: false, error: "missing: from" }, { status: 400 });
    }
    try {
      const SPIKE_AMOUNT = BigInt(1_000_000); // 0.1 USDC (7 decimals) — validation only
      const xdr = await buildSorobanAuthFallback(from, SPIKE_AMOUNT);
      return NextResponse.json({ ok: true, data: { xdr, spike: true } });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "spike simulation failed" },
        { status: 502 },
      );
    }
  }

  // ── Normal aggregator path ───────────────────────────────────────────────────
  let body: SwapBody;
  try {
    body = (await req.json()) as SwapBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { assetIn, assetOut, amountRaw, decimalsIn = 7, from } = body;

  if (!assetIn || !assetOut || !amountRaw || !from) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  let amount: bigint;
  try {
    amount = parseAmount(amountRaw, decimalsIn);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid amount" }, { status: 400 });
  }

  if (amount <= BigInt(0)) {
    return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400 });
  }

  try {
    const { quote, xdr } = await buildSoroswapSwapXdr({ assetIn, assetOut, amount, from });

    // BigInt fields serialized to string — JSON.stringify doesn't handle bigint natively.
    return NextResponse.json({
      ok: true,
      data: {
        amountIn: quote.amountIn.toString(),
        amountOut: quote.amountOut.toString(),
        otherAmountThreshold: quote.otherAmountThreshold.toString(),
        priceImpactPct: quote.priceImpactPct,
        routePlan: quote.routePlan,
        xdr,
        simulated: false,
      },
    });
  } catch (err) {
    if (process.env.NEXT_PUBLIC_USE_SWAP_MOCK === "true") {
      return NextResponse.json({
        ok: true,
        data: await buildMockQuoteResponse(amount, assetIn, assetOut, from),
      });
    }

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "soroswap error" },
      { status: 502 },
    );
  }
}
