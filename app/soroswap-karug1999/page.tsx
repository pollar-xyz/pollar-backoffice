"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { usePollar } from "@pollar/react";

type Token = {
  code: string;
  contract: string;
  name?: string;
  decimals: number;
};

type QuoteData = {
  amountIn: string;
  amountOut: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: { protocol: string; path: string[] };
    percent: string;
  }>;
  xdr: string;
  simulated?: boolean;
};

type RowState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: QuoteData }
  | { kind: "error"; message: string };

type RowQuotes = Record<string, RowState>;

type SwapState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "done"; hash: string }
  | { kind: "error"; message: string };

// BigInt string → human-readable decimal (up to 6 fractional digits).
function fmtAmount(raw: string, decimals: number): string {
  const n = BigInt(raw);
  const d = BigInt(10) ** BigInt(decimals);
  const int = n / d;
  const frac = (n % d).toString().padStart(decimals, "0").slice(0, 6);
  return `${int}.${frac}`;
}

// Rate: how many tokenOut per 1 tokenIn (display only — float is fine here).
function fmtRate(amountIn: string, amountOut: string, decimalsIn: number, decimalsOut: number): string {
  const humanIn = Number(amountIn) / 10 ** decimalsIn;
  const humanOut = Number(amountOut) / 10 ** decimalsOut;
  if (humanIn === 0) return "—";
  const rate = humanOut / humanIn;
  if (rate >= 1000) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toFixed(8);
}

// Slippage from threshold: (amountOut - threshold) / amountOut as %.
function slippagePct(amountOut: string, threshold: string): string {
  const out = BigInt(amountOut);
  if (out === BigInt(0)) return "—";
  const thr = BigInt(threshold);
  const slip = ((out - thr) * BigInt(10000)) / out;
  return `${(Number(slip) / 100).toFixed(2)}%`;
}

function pathToSymbols(path: string[], tokens: Token[]): string {
  return path
    .map((addr) => tokens.find((t) => t.contract === addr)?.code ?? `${addr.slice(0, 4)}…`)
    .join(" → ");
}

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint";
const selectClass =
  "rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint flex-shrink-0";

export default function SoroswapPage() {
  const { isAuthenticated, walletAddress, verified, signAndSubmitTx, openTxHistoryModal } =
    usePollar();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [baseToken, setBaseToken] = useState<Token | null>(null);
  const [amountRaw, setAmountRaw] = useState("");
  const [rowQuotes, setRowQuotes] = useState<RowQuotes>({});
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [swapState, setSwapState] = useState<SwapState>({ kind: "idle" });

  const abortRef = useRef<AbortController | null>(null);

  // Tokens to show live quotes for — everything except the base.
  const targetTokens = useMemo(
    () => tokens.filter((t) => t.contract !== baseToken?.contract),
    [tokens, baseToken],
  );

  // Fetch token list once on mount.
  useEffect(() => {
    fetch("/api/soroswap-karug1999")
      .then((r) => r.json())
      .then((res: { ok: boolean; data?: { assets?: unknown[] } }) => {
        if (!res.ok || !Array.isArray(res.data?.assets)) return;
        const list: Token[] = (
          res.data!.assets as Array<{
            code?: string;
            contract?: string;
            name?: string;
            decimals?: number;
          }>
        )
          .filter((t) => t.contract && t.code)
          .map((t) => ({
            code: t.code!,
            contract: t.contract!,
            name: t.name,
            decimals: t.decimals ?? 7,
          }));
        setTokens(list);
        setBaseToken(list.find((t) => t.code === "USDC") ?? list[0] ?? null);
      })
      .catch(() => {});
  }, []);

  // Concurrent quote fetch — fires Promise.all for every target token simultaneously.
  useEffect(() => {
    abortRef.current?.abort();

    if (!amountRaw || !baseToken || !walletAddress || targetTokens.length === 0) {
      setRowQuotes({});
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Optimistic loading state while the debounce timer is pending.
    setRowQuotes(
      Object.fromEntries(targetTokens.map((t) => [t.contract, { kind: "loading" as const }])),
    );

    const timer = window.setTimeout(async () => {
      // All target tokens quoted in parallel — no serial waterfall.
      const results = await Promise.all(
        targetTokens.map(async (tokenOut) => {
          try {
            const res = await fetch("/api/soroswap-karug1999", {
              method: "POST",
              signal: ctrl.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assetIn: baseToken.contract,
                assetOut: tokenOut.contract,
                amountRaw,
                decimalsIn: baseToken.decimals,
                from: walletAddress,
              }),
            });
            if (ctrl.signal.aborted) {
              return { contract: tokenOut.contract, state: { kind: "idle" as const } };
            }
            const json = (await res.json()) as {
              ok: boolean;
              data?: QuoteData;
              error?: string;
            };
            if (!res.ok || !json.ok) {
              return {
                contract: tokenOut.contract,
                state: { kind: "error" as const, message: json.error ?? "cotización fallida" },
              };
            }
            return {
              contract: tokenOut.contract,
              state: { kind: "ok" as const, data: json.data! },
            };
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              return { contract: tokenOut.contract, state: { kind: "idle" as const } };
            }
            return {
              contract: tokenOut.contract,
              state: {
                kind: "error" as const,
                message: err instanceof Error ? err.message : "error",
              },
            };
          }
        }),
      );

      if (ctrl.signal.aborted) return;
      setRowQuotes(Object.fromEntries(results.map((r) => [r.contract, r.state])));
    }, 400);

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [amountRaw, baseToken, targetTokens, walletAddress]);

  async function handleSwap() {
    if (!selectedToken) return;
    const row = rowQuotes[selectedToken.contract];
    if (row?.kind !== "ok") return;
    setSwapState({ kind: "signing" });
    try {
      const outcome = await signAndSubmitTx(row.data.xdr);
      if (outcome.status === "success" || outcome.status === "pending") {
        setSwapState({ kind: "done", hash: outcome.hash });
        setAmountRaw("");
        setRowQuotes({});
        setSelectedToken(null);
      } else {
        setSwapState({
          kind: "error",
          message:
            (outcome as { details?: string; resultCode?: string }).details ??
            (outcome as { details?: string; resultCode?: string }).resultCode ??
            "La transacción falló.",
        });
      }
    } catch (err) {
      setSwapState({
        kind: "error",
        message: err instanceof Error ? err.message : "Error al firmar.",
      });
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-white p-8 text-center text-zinc-900">
        <p className="text-sm text-zinc-500">Inicia sesión con Pollar para usar el swap.</p>
        <a
          href="/"
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
        >
          Ir al inicio
        </a>
      </div>
    );
  }

  const selectedRow = selectedToken ? (rowQuotes[selectedToken.contract] ?? null) : null;

  return (
    <div className="min-h-full w-full bg-white text-zinc-900">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            Swap <span className="text-brand">· Soroswap</span>
          </h1>
          <button
            type="button"
            onClick={openTxHistoryModal}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            Historial
          </button>
        </div>

        {/* Base token + amount */}
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Envías</span>
          <div className="flex gap-2">
            <select
              value={baseToken?.contract ?? ""}
              onChange={(e) => {
                setBaseToken(tokens.find((t) => t.contract === e.target.value) ?? null);
                setAmountRaw("");
                setSelectedToken(null);
                setSwapState({ kind: "idle" });
                setRowQuotes({});
              }}
              className={selectClass}
            >
              {tokens.map((t) => (
                <option key={t.contract} value={t.contract}>
                  {t.code}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amountRaw}
              onChange={(e) => {
                setSelectedToken(null);
                setSwapState({ kind: "idle" });
                setAmountRaw(e.target.value.replace(/[^0-9.]/g, ""));
              }}
              className={inputClass}
            />
          </div>
          {!walletAddress && (
            <p className="text-xs text-zinc-400">Conecta tu wallet para ver cotizaciones en vivo.</p>
          )}
        </div>

        {/* Live quote grid — one row per target token */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 px-1">
            Recibes
          </span>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {targetTokens.length === 0 && (
              <p className="px-5 py-4 text-sm text-zinc-400">Cargando tokens…</p>
            )}
            {targetTokens.map((token, i) => {
              const row = rowQuotes[token.contract] ?? { kind: "idle" as const };
              const isSelected = selectedToken?.contract === token.contract;
              return (
                <TokenRow
                  key={token.contract}
                  token={token}
                  baseToken={baseToken!}
                  row={row}
                  isSelected={isSelected}
                  isLast={i === targetTokens.length - 1}
                  onSelect={() => {
                    setSelectedToken(isSelected ? null : token);
                    setSwapState({ kind: "idle" });
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Confirm panel — inline, appears once a token row is selected */}
        {selectedToken && selectedRow && (
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-900">
                {amountRaw} {baseToken?.code} → {selectedToken.code}
              </span>
              {selectedRow.kind === "ok" && selectedRow.data.simulated && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                  Demo
                </span>
              )}
            </div>

            {selectedRow.kind === "loading" && (
              <p className="animate-pulse text-sm text-zinc-400">Calculando cotización…</p>
            )}

            {selectedRow.kind === "error" && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {selectedRow.message}
              </p>
            )}

            {selectedRow.kind === "ok" && (
              <>
                <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-xs">
                  <InfoRow
                    label="Mínimo recibido"
                    value={`${fmtAmount(selectedRow.data.otherAmountThreshold, selectedToken.decimals)} ${selectedToken.code}`}
                  />
                  <InfoRow
                    label="Slippage estimado"
                    value={slippagePct(selectedRow.data.amountOut, selectedRow.data.otherAmountThreshold)}
                  />
                  <InfoRow label="Impacto de precio" value={`${selectedRow.data.priceImpactPct}%`} />
                  <InfoRow
                    label="Ruta"
                    value={selectedRow.data.routePlan
                      .map((r) => pathToSymbols(r.swapInfo.path, tokens))
                      .join(" | ")}
                  />
                </div>

                {swapState.kind === "done" && (
                  <div className="break-all rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                    Swap exitoso — <span className="font-mono">{swapState.hash}</span>
                  </div>
                )}
                {swapState.kind === "error" && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {swapState.message}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={swapState.kind === "signing" || !verified}
                  className="h-12 w-full rounded-xl bg-brand font-medium text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {swapState.kind === "signing" ? "Firmando…" : "Confirmar swap"}
                </button>

                {!verified && (
                  <p className="text-center text-xs text-zinc-400">Verificando sesión…</p>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-center text-xs text-zinc-400">Testnet · Soroswap Aggregator</p>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TokenRow({
  token,
  baseToken,
  row,
  isSelected,
  isLast,
  onSelect,
}: {
  token: Token;
  baseToken: Token;
  row: RowState;
  isSelected: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={[
        "flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors",
        isSelected ? "bg-brand/5" : "hover:bg-zinc-50",
        !isLast ? "border-b border-zinc-100" : "",
      ].join(" ")}
    >
      {/* Token identity */}
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-zinc-900">{token.code}</span>
        {token.name && (
          <span className="truncate text-xs text-zinc-400">{token.name}</span>
        )}
      </div>

      {/* Live quote */}
      <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
        {row.kind === "idle" && <span className="text-sm text-zinc-300">—</span>}
        {row.kind === "loading" && (
          <span className="animate-pulse text-sm text-zinc-400">…</span>
        )}
        {row.kind === "ok" && (
          <>
            <span className="text-sm font-medium text-zinc-900">
              {fmtAmount(row.data.amountOut, token.decimals)}{" "}
              <span className="text-zinc-500">{token.code}</span>
            </span>
            <span className="text-xs text-zinc-400">
              1 {baseToken.code} ={" "}
              {fmtRate(row.data.amountIn, row.data.amountOut, baseToken.decimals, token.decimals)}{" "}
              {token.code}
            </span>
          </>
        )}
        {row.kind === "error" && (
          <span className="max-w-[130px] truncate text-right text-xs text-red-400">
            {row.message}
          </span>
        )}
      </div>

      {/* Selection dot */}
      <div
        className={[
          "h-4 w-4 flex-shrink-0 rounded-full border-2 transition-colors",
          isSelected ? "border-brand bg-brand" : "border-zinc-300 bg-transparent",
        ].join(" ")}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-800">{value}</span>
    </div>
  );
}
