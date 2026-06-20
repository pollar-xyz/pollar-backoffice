"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePollar } from "@pollar/react";
import { BlendLoginScreen } from "./BlendLoginScreen";
import {
  blendConfig,
  getBlendNetwork,
  toTokenAmount,
} from "../lib/config";
import {
  buildBlendSupplyXdr,
  buildBlendWithdrawXdr,
} from "../lib/build-transaction";
import { parseBlendError } from "../lib/parse-blend-error";
import {
  fetchBlendPosition,
  type BlendPositionSnapshot,
} from "../lib/pool-data";
import {
  BLEND_TESTNET_USDC_CONTRACT,
  findUsdcBalance,
  findUsdcEnabledAsset,
} from "../lib/usdc-asset";

type TxStatus =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "signing" }
  | { kind: "success"; hash: string; label: string }
  | { kind: "error"; message: string };

const inputClass =
  "rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint";

const BLEND_FAUCET_URL = "https://testnet.blend.capital/";
const BLEND_POOL_EXPLORER = `https://stellar.expert/explorer/testnet/contract/${blendConfig.poolId}`;

export function BlendPanel() {
  const {
    isAuthenticated,
    walletAddress,
    walletBalance,
    refreshWalletBalance,
    enabledAssets,
    refreshAssets,
    setTrustline,
    openEnabledAssetsModal,
    signAndSubmitTx,
    verified,
    openLoginModal,
  } = usePollar();

  const network = useMemo(() => getBlendNetwork(), []);

  const [lendAmount, setLendAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [position, setPosition] = useState<BlendPositionSnapshot | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>({ kind: "idle" });
  const [trustlineBusy, setTrustlineBusy] = useState(false);
  const [trustlineMessage, setTrustlineMessage] = useState<string | null>(null);

  const usdcRecord = useMemo(() => {
    if (walletBalance.step !== "loaded") return null;
    return findUsdcBalance(walletBalance.data.balances);
  }, [walletBalance]);

  const usdcAsset = useMemo(() => {
    if (enabledAssets.step !== "loaded") return null;
    return findUsdcEnabledAsset(enabledAssets.data.assets);
  }, [enabledAssets]);

  const usdcTrustlineReady = usdcAsset?.trustlineEstablished ?? false;
  const usdcBalance = usdcRecord?.available ?? null;

  const refreshPosition = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const snapshot = await fetchBlendPosition(
        network,
        blendConfig.poolId,
        blendConfig.usdcId,
        walletAddress,
      );
      setPosition(snapshot);
      setPositionError(null);
    } catch (err) {
      setPositionError(
        parseBlendError(
          err instanceof Error ? err.message : "Failed to load pool position",
        ),
      );
    }
  }, [network, walletAddress]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (walletBalance.step === "idle") void refreshWalletBalance();
    if (enabledAssets.step === "idle") void refreshAssets();
  }, [
    isAuthenticated,
    walletBalance.step,
    enabledAssets.step,
    refreshWalletBalance,
    refreshAssets,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    void refreshPosition();
    const timer = setInterval(
      () => void refreshPosition(),
      blendConfig.pollIntervalMs,
    );
    return () => clearInterval(timer);
  }, [isAuthenticated, walletAddress, refreshPosition]);

  async function enableUsdcTrustline() {
    if (!usdcAsset?.issuer) {
      openEnabledAssetsModal();
      return;
    }

    setTrustlineBusy(true);
    setTrustlineMessage(null);
    try {
      const outcome = await setTrustline(
        { code: usdcAsset.code, issuer: usdcAsset.issuer },
        { sponsored: usdcAsset.sponsored },
      );
      if (outcome.status === "success" || outcome.status === "pending") {
        setTrustlineMessage("USDC trustline enabled. Refreshing balances…");
        await refreshAssets();
        await refreshWalletBalance();
      } else {
        setTrustlineMessage(
          parseBlendError(outcome.details ?? "Could not enable USDC trustline"),
        );
      }
    } catch (err) {
      setTrustlineMessage(
        parseBlendError(
          err instanceof Error ? err.message : "Could not enable USDC trustline",
        ),
      );
    } finally {
      setTrustlineBusy(false);
    }
  }

  async function submitBlendTx(
    label: string,
    buildXdr: () => Promise<string>,
  ) {
    setTxStatus({ kind: "building" });
    try {
      const unsignedXdr = await buildXdr();
      setTxStatus({ kind: "signing" });
      const outcome = await signAndSubmitTx(unsignedXdr);

      if (outcome.status === "success" || outcome.status === "pending") {
        setTxStatus({ kind: "success", hash: outcome.hash, label });
        void refreshWalletBalance();
        void refreshPosition();
        return;
      }

      setTxStatus({
        kind: "error",
        message: parseBlendError(
          outcome.details ?? outcome.resultCode ?? "Transaction failed",
        ),
      });
    } catch (err) {
      setTxStatus({
        kind: "error",
        message: parseBlendError(
          err instanceof Error ? err.message : "Unexpected error",
        ),
      });
    }
  }

  async function handleLend(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress || !verified) return;

    if (!usdcTrustlineReady) {
      setTxStatus({
        kind: "error",
        message: parseBlendError("trustline entry is missing"),
      });
      return;
    }

    const amount = toTokenAmount(lendAmount);
    if (amount <= BigInt(0)) return;

    await submitBlendTx("Lend", () =>
      buildBlendSupplyXdr({
        pool: blendConfig.poolId,
        asset: blendConfig.usdcId,
        from: walletAddress,
        amount,
        network,
      }),
    );
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress || !verified) return;

    const amount = toTokenAmount(withdrawAmount);
    if (amount <= BigInt(0)) return;

    await submitBlendTx("Withdraw", () =>
      buildBlendWithdrawXdr({
        pool: blendConfig.poolId,
        asset: blendConfig.usdcId,
        from: walletAddress,
        amount,
        network,
      }),
    );
  }

  if (!isAuthenticated) {
    return <BlendLoginScreen />;
  }

  const busy = txStatus.kind === "building" || txStatus.kind === "signing";

  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6 font-sans text-zinc-900"
      style={{ colorScheme: "light" }}
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Blend + Pollar</h1>
          <Link
            href="/"
            className="shrink-0 text-sm font-medium text-brand hover:underline"
          >
            Home
          </Link>
        </div>
        <p className="text-sm text-zinc-600">
          Lend Blend testnet USDC to the pool and withdraw with your Pollar
          wallet.
        </p>
      </header>

      {!verified && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Session is still verifying. If you were logged out,{" "}
          <button
            type="button"
            onClick={() => openLoginModal()}
            className="font-medium text-brand underline"
          >
            sign in again
          </button>
          .
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Wallet
        </p>
        <p className="mt-1 break-all font-mono text-xs text-zinc-800">
          {walletAddress}
        </p>
        <p className="mt-3 text-sm text-zinc-700">
          Available USDC:{" "}
          <span className="font-semibold">
            {walletBalance.step === "loading" ? "…" : (usdcBalance ?? "0")}
          </span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Trustline:{" "}
          {enabledAssets.step === "loading"
            ? "…"
            : usdcTrustlineReady
              ? "enabled"
              : "not set"}
        </p>
      </section>

      {!usdcTrustlineReady && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Set up Blend testnet USDC first</h2>
          <p className="mt-2 leading-relaxed">
            This pool uses{" "}
            <strong>Blend testnet USDC</strong> (Soroban contract), not Circle
            faucet USDC. Your lend failed because the wallet has no trustline
            for that token yet.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            <li>Enable the USDC trustline in Pollar (button below).</li>
            <li>
              Get test tokens from the{" "}
              <a
                href={BLEND_FAUCET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand underline"
              >
                Blend testnet faucet
              </a>{" "}
              (connect the same wallet address).
            </li>
            <li>Return here and lend a small amount (e.g. 0.5 USDC).</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void enableUsdcTrustline()}
              disabled={trustlineBusy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {trustlineBusy ? "Enabling…" : "Enable USDC trustline"}
            </button>
            <button
              type="button"
              onClick={() => openEnabledAssetsModal()}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
            >
              Manage assets
            </button>
          </div>
          {trustlineMessage && (
            <p className="mt-3 text-sm">{trustlineMessage}</p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <h2 className="font-semibold text-zinc-900">Where are my funds?</h2>
        <ul className="mt-2 space-y-2 leading-relaxed">
          <li>
            <strong>Wallet USDC</strong> — in your Pollar account (before
            lending).
          </li>
          <li>
            <strong>Supplied USDC</strong> — locked in the Blend pool contract{" "}
            <a
              href={BLEND_POOL_EXPLORER}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-brand underline"
            >
              {blendConfig.poolId.slice(0, 8)}…
            </a>
            ; shown under “Your position”.
          </li>
          <li>
            <strong>Withdraw</strong> moves USDC from the pool back to your
            wallet.
          </li>
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          Token contract:{" "}
          <span className="font-mono">{BLEND_TESTNET_USDC_CONTRACT}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Your position</h2>
          <span className="text-xs text-zinc-500">live · 10s</span>
        </div>

        {positionError && (
          <p className="mb-3 text-sm text-red-600">{positionError}</p>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Supplied USDC</dt>
            <dd className="font-semibold text-zinc-900">
              {position?.supplied ?? "…"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Supply APY</dt>
            <dd className="font-semibold text-zinc-900">
              {position ? `${(position.supplyApy * 100).toFixed(2)}%` : "…"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Supply APR</dt>
            <dd className="font-semibold text-zinc-900">
              {position ? `${(position.supplyApr * 100).toFixed(2)}%` : "…"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Ledger</dt>
            <dd className="font-mono text-xs text-zinc-800">
              {position?.latestLedger ?? "…"}
            </dd>
          </div>
        </dl>
      </section>

      <form
        onSubmit={handleLend}
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Lend USDC</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Amount</span>
          <input
            value={lendAmount}
            onChange={(e) => setLendAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={inputClass}
            disabled={busy}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !verified || !lendAmount || !usdcTrustlineReady}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-brand px-6 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {txStatus.kind === "signing" ? "Signing…" : "Lend to Blend"}
        </button>
      </form>

      <form
        onSubmit={handleWithdraw}
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">
          Withdraw USDC
        </h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Amount</span>
          <input
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={inputClass}
            disabled={busy}
          />
        </label>
        {position && (
          <button
            type="button"
            onClick={() => setWithdrawAmount(position.supplied)}
            className="mt-2 text-xs font-medium text-brand hover:underline"
          >
            Withdraw max ({position.supplied} USDC)
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !verified || !withdrawAmount}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-xl border border-brand bg-white px-6 text-sm font-medium text-brand transition-colors hover:bg-brand-tint disabled:cursor-not-allowed disabled:opacity-50"
        >
          {txStatus.kind === "signing" ? "Signing…" : "Withdraw from Blend"}
        </button>
      </form>

      {txStatus.kind === "success" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-medium">{txStatus.label} submitted</p>
          <p className="mt-1 break-all font-mono text-xs">{txStatus.hash}</p>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txStatus.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs font-medium underline"
          >
            View on Stellar Expert
          </a>
          <button
            type="button"
            onClick={() => setTxStatus({ kind: "idle" })}
            className="mt-2 block text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {txStatus.kind === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Transaction failed</p>
          <p className="mt-1">{txStatus.message}</p>
          <button
            type="button"
            onClick={() => setTxStatus({ kind: "idle" })}
            className="mt-2 block text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
