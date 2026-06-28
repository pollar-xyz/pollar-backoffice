/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePollar } from "@pollar/react";
import {
  buildAquariusSwapXdr,
  fromStroops,
  hasTrustline,
  quoteBestSwap,
  toStroops,
  type Quote,
} from "./lib/aquarius";
import { TOKENS, USDC, XLM, type TokenDef } from "./lib/tokens";

type TxStatus =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "signing" }
  | { kind: "success"; hash: string }
  | { kind: "error"; message: string };

const SLIPPAGES = [0.1, 0.5, 1, 2];
const POLL_MS = 8000;

function shorten(a: string) {
  return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function AquariusSwapPage() {
  const {
    walletAddress,
    isAuthenticated,
    openLoginModal,
    logout,
    signAndSubmitTx,
    setTrustline,
  } = usePollar();

  const [tokenIn, setTokenIn] = useState<TokenDef>(USDC);
  const [tokenOut, setTokenOut] = useState<TokenDef>(XLM);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(0.5);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [tx, setTx] = useState<TxStatus>({ kind: "idle" });
  const [needsTrustline, setNeedsTrustline] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);

  const reqId = useRef(0);
  const amountStroops = useMemo(() => {
    try {
      return amount && Number(amount) > 0 ? toStroops(amount) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [amount]);

  const fetchQuote = useCallback(async () => {
    if (!walletAddress || amountStroops <= BigInt(0)) {
      setQuote(null);
      return;
    }
    const id = ++reqId.current;
    setQuoting(true);
    setQuoteErr(null);
    try {
      const q = await quoteBestSwap({
        from: walletAddress,
        tokenIn: tokenIn.contractId,
        tokenOut: tokenOut.contractId,
        amountIn: amountStroops,
      });
      if (id === reqId.current) setQuote(q);
    } catch (e: any) {
      if (id === reqId.current) {
        setQuote(null);
        setQuoteErr(e?.message ?? "Could not fetch quote");
      }
    } finally {
      if (id === reqId.current) setQuoting(false);
    }
  }, [walletAddress, amountStroops, tokenIn, tokenOut]);

  // Live quote: refetch on input change and poll while inputs are valid.
  useEffect(() => {
    void fetchQuote();
    if (amountStroops <= BigInt(0)) return;
    const t = setInterval(() => void fetchQuote(), POLL_MS);
    return () => clearInterval(t);
  }, [fetchQuote, amountStroops]);

  // To receive a classic asset (e.g. USDC) the wallet needs a trustline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walletAddress || tokenOut.native || !tokenOut.code || !tokenOut.issuer) {
        setNeedsTrustline(false);
        return;
      }
      const ok = await hasTrustline(walletAddress, tokenOut.code, tokenOut.issuer);
      if (!cancelled) setNeedsTrustline(!ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, tokenOut]);

  async function enableTrustline() {
    if (!tokenOut.code || !tokenOut.issuer || !walletAddress) return;
    setTrustBusy(true);
    try {
      await setTrustline(
        { code: tokenOut.code, issuer: tokenOut.issuer },
        { sponsored: false }, // the user's own XLM covers the 0.5 reserve
      );
      const ok = await hasTrustline(walletAddress, tokenOut.code, tokenOut.issuer);
      setNeedsTrustline(!ok);
    } catch (e: any) {
      setTx({ kind: "error", message: e?.message ?? "Could not enable trustline" });
    } finally {
      setTrustBusy(false);
    }
  }

  const minReceived = useMemo(() => {
    if (!quote) return BigInt(0);
    return (quote.outAmount * BigInt(Math.round((1 - slippage / 100) * 1e6))) / BigInt(1000000);
  }, [quote, slippage]);

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setQuote(null);
    setTx({ kind: "idle" });
  }

  function pickIn(sym: string) {
    const t = TOKENS.find((x) => x.symbol === sym)!;
    if (t.symbol === tokenOut.symbol) flip();
    else setTokenIn(t);
  }
  function pickOut(sym: string) {
    const t = TOKENS.find((x) => x.symbol === sym)!;
    if (t.symbol === tokenIn.symbol) flip();
    else setTokenOut(t);
  }

  async function handleSwap() {
    if (!walletAddress || !quote || amountStroops <= BigInt(0)) return;
    setTx({ kind: "building" });
    try {
      const xdr = await buildAquariusSwapXdr({
        from: walletAddress,
        tokenIn: tokenIn.contractId,
        tokenOut: tokenOut.contractId,
        amountIn: amountStroops,
        minAmountOut: minReceived,
        pool: quote.pool,
      });
      setTx({ kind: "signing" });
      const outcome = await signAndSubmitTx(xdr);
      if (outcome.status === "success" || outcome.status === "pending") {
        setTx({ kind: "success", hash: outcome.hash });
        void fetchQuote();
      } else {
        setTx({
          kind: "error",
          message: outcome.details || outcome.resultCode || "Swap failed",
        });
      }
    } catch (e: any) {
      setTx({ kind: "error", message: e?.message ?? "Unexpected error" });
    }
  }

  const rate =
    quote && amountStroops > BigInt(0)
      ? fromStroops(quote.outAmount) / fromStroops(amountStroops)
      : 0;
  const busy = tx.kind === "building" || tx.kind === "signing";

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-900">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/60 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white text-2xl font-bold">
            ⇄
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Aquarius Swap</h1>
          <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
            Swap tokens through the Aquarius AMM on Stellar testnet, signed with
            your Pollar wallet. 100% client-side.
          </p>
          <button
            onClick={openLoginModal}
            className="mt-8 w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
          >
            Connect with Pollar Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200/80 bg-white/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white font-bold">
            P
          </div>
          <span className="font-bold">Pollar</span>
          <span className="text-zinc-400">×</span>
          <span className="font-medium text-zinc-600">Aquarius</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-brand-tint/60 px-3 py-2 font-mono text-xs font-semibold text-brand">
            {walletAddress ? shorten(walletAddress) : ""}
          </span>
          <button
            onClick={logout}
            className="rounded-xl px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Swap</h1>
        <p className="mb-5 text-sm text-zinc-500">
          Aquarius AMM · best-pool routing · live quote
        </p>

        <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
          {/* From */}
          <div className="rounded-2xl bg-zinc-50 p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <span>From</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-2xl font-bold outline-none"
              />
              <select
                value={tokenIn.symbol}
                onChange={(e) => pickIn(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
              >
                {TOKENS.map((t) => (
                  <option key={t.symbol} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Flip */}
          <div className="my-2 flex justify-center">
            <button
              onClick={flip}
              className="rounded-full border border-zinc-200 bg-white p-2 text-brand shadow-sm transition hover:rotate-180"
              title="Flip direction"
            >
              ↑↓
            </button>
          </div>

          {/* To */}
          <div className="rounded-2xl bg-zinc-50 p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <span>To (estimated)</span>
              {quoting && <span className="text-brand">updating…</span>}
            </div>
            <div className="flex items-center gap-3">
              <div className="w-full text-2xl font-bold text-zinc-800">
                {quote ? fromStroops(quote.outAmount).toLocaleString(undefined, { maximumFractionDigits: 7 }) : "0.0"}
              </div>
              <select
                value={tokenOut.symbol}
                onChange={(e) => pickOut(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
              >
                {TOKENS.map((t) => (
                  <option key={t.symbol} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quote details */}
          {quote && (
            <div className="mt-4 space-y-1.5 rounded-2xl border border-zinc-100 bg-white p-4 text-sm">
              <Row label="Rate">
                1 {tokenIn.symbol} ≈ {rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {tokenOut.symbol}
              </Row>
              <Row label="Price impact">
                <span className={quote.priceImpact > 0.05 ? "text-red-600" : "text-emerald-600"}>
                  {(quote.priceImpact * 100).toFixed(2)}%
                </span>
              </Row>
              <Row label={`Min received (${slippage}% slippage)`}>
                {fromStroops(minReceived).toLocaleString(undefined, { maximumFractionDigits: 7 })} {tokenOut.symbol}
              </Row>
              <Row label="Pool">
                <span className="font-mono text-xs">{shorten(quote.pool.address)}</span>
              </Row>
            </div>
          )}

          {/* Slippage */}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-400">Slippage</span>
            {SLIPPAGES.map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  slippage === s ? "bg-brand text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {s}%
              </button>
            ))}
          </div>

          {quoteErr && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">{quoteErr}</p>
          )}

          {/* Status */}
          {tx.kind === "building" && <Note>Building &amp; simulating the swap XDR…</Note>}
          {tx.kind === "signing" && <Note>Awaiting Pollar signature &amp; submission…</Note>}
          {tx.kind === "success" && (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="font-bold">✓ Swap submitted</div>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
                target="_blank"
                rel="noopener"
                className="mt-1 block break-all font-mono text-xs text-emerald-700 underline"
              >
                {tx.hash}
              </a>
            </div>
          )}
          {tx.kind === "error" && (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
              <div className="font-bold">Swap failed</div>
              <div className="mt-1 break-all text-xs">{tx.message}</div>
            </div>
          )}

          {/* Trustline: needed before the wallet can receive a classic asset. */}
          {needsTrustline ? (
            <div className="mt-5">
              <p className="mb-2 text-xs text-zinc-500">
                Your wallet needs a {tokenOut.symbol} trustline to receive it.
              </p>
              <button
                onClick={enableTrustline}
                disabled={trustBusy}
                className="w-full rounded-2xl border border-brand bg-brand-tint/40 py-4 text-sm font-semibold text-brand transition hover:bg-brand-tint disabled:opacity-40"
              >
                {trustBusy ? "Enabling…" : `Enable ${tokenOut.symbol} trustline`}
              </button>
            </div>
          ) : (
            <button
              onClick={handleSwap}
              disabled={!quote || busy || amountStroops <= BigInt(0)}
              className="mt-5 w-full rounded-2xl bg-brand py-4 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-40"
            >
              {busy
                ? "Processing…"
                : !amount
                ? "Enter an amount"
                : !quote
                ? "No quote"
                : `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`}
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-zinc-400">
          Contract-direct · no backend · signed with Pollar
        </p>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-800">{children}</span>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand/10 bg-brand-tint/30 p-4 text-sm text-brand">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
      {children}
    </div>
  );
}
