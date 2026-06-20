/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useState, useMemo } from "react";
import { usePollar } from "@pollar/react";

const DEFAULT_VAULT = "CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6";

type Status =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "signing" }
  | { kind: "success"; hash: string }
  | { kind: "error"; message: string };

function shortenAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function DefindexPage() {
  const {
    walletAddress,
    isAuthenticated,
    openLoginModal,
    logout,
    signAndSubmitTx,
    walletBalance,
    refreshWalletBalance,
  } = usePollar();

  const [vaultAddress, setVaultAddress] = useState(DEFAULT_VAULT);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [txStatus, setTxStatus] = useState<Status>({ kind: "idle" });

  const [vaultInfo, setVaultInfo] = useState<{
    name: string;
    symbol: string;
    apyPercent: number;
    userShares: number;
    underlyingBalance: number[];
    assets: { address: string; name: string; symbol: string }[];
  } | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (isAuthenticated && walletBalance.step === "idle") {
      void refreshWalletBalance();
    }
  }, [isAuthenticated, walletBalance.step, refreshWalletBalance]);

  const nativeBalance = useMemo(() => {
    if (walletBalance.step === "loaded") {
      const native = walletBalance.data.balances.find((b) => b.type === "native");
      return native ? Number(native.available) : 0;
    }
    return 0;
  }, [walletBalance]);

  const fetchVaultData = async (showLoading = false) => {
    if (!vaultAddress) return;
    if (showLoading) {
      await Promise.resolve();
      setIsLoadingInfo(true);
    }
    try {
      const url = `/api/defindex-lajenny4?vault=${vaultAddress}${
        walletAddress ? `&caller=${walletAddress}` : ""
      }`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setVaultInfo(data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch vault data:", err);
    } finally {
      if (showLoading) setIsLoadingInfo(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchVaultData(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [vaultAddress, walletAddress]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchVaultData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [vaultAddress, walletAddress]);

  async function handleCopy() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress || !amount || Number(amount) <= 0) return;

    setTxStatus({ kind: "building" });
    try {
      const buildRes = await fetch("/api/defindex-lajenny4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: activeTab,
          vault: vaultAddress,
          caller: walletAddress,
          amount: amount,
        }),
      });

      if (!buildRes.ok) {
        const errorData = await buildRes.json();
        throw new Error(errorData.error || "Failed to build transaction");
      }

      const { xdr } = await buildRes.json();

      setTxStatus({ kind: "signing" });
      const outcome = await signAndSubmitTx(xdr);

      if (outcome.status === "success" || outcome.status === "pending") {
        setTxStatus({ kind: "success", hash: outcome.hash });
        setAmount("");
        fetchVaultData(false);
        void refreshWalletBalance();
      } else {
        setTxStatus({
          kind: "error",
          message: outcome.details || outcome.resultCode || "Transaction failed",
        });
      }
    } catch (err: any) {
      setTxStatus({
        kind: "error",
        message: err.message || "An unexpected error occurred",
      });
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-900 font-sans">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur-md">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand shadow-inner">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h1 className="bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            DeFindex Integration
          </h1>
          <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
            Deposit into decentralized yield-generating vaults on Stellar Testnet and sign transactions seamlessly with Pollar.
          </p>
          <button
            onClick={openLoginModal}
            className="mt-8 w-full rounded-2xl bg-gradient-to-r from-brand to-brand-dark px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:brightness-110 active:translate-y-0"
          >
            Connect with Pollar Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-zinc-50 text-zinc-900 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-200/80 bg-white/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm font-bold text-lg">
            P
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight">Pollar</span>
            <span className="text-zinc-400">×</span>
            <span className="text-base font-medium text-zinc-600">DeFindex</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="rounded-xl bg-brand-tint/60 px-4 py-2 font-mono text-xs font-semibold text-brand transition-all hover:bg-brand-tint"
          >
            {copied ? "Copied!" : shortenAddress(walletAddress)}
          </button>
          <button
            onClick={logout}
            className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main container */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1.5">
          <h1 className="bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
            DeFindex Vaults
          </h1>
          <p className="text-sm text-zinc-500">
            Deposit assets to earn automated yield, and withdraw back to your wallet at any time.
          </p>
        </div>

        {/* Vault Configuration Card */}
        <div className="rounded-3xl border border-zinc-200/60 bg-white p-6 shadow-sm">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Vault Contract Address
            </span>
            <div className="flex gap-2">
              <input
                value={vaultAddress}
                onChange={(e) => setVaultAddress(e.target.value)}
                placeholder="Enter Soroban vault address..."
                className="flex-1 rounded-2xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 font-mono text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand-tint"
              />
              <button
                onClick={() => fetchVaultData(true)}
                className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200"
              >
                Load
              </button>
            </div>
          </label>
        </div>

        {/* Vault Info Dashboard */}
        {vaultInfo && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Position Card */}
            <div className="relative overflow-hidden rounded-3xl border border-zinc-200/60 bg-white p-6 shadow-sm">
              <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Your Vault Position
              </span>
              <div className="mt-3 flex flex-col gap-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight">
                   {Number(vaultInfo.userShares).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs font-medium text-zinc-500 uppercase">
                    Shares
                  </span>
                </div>
                {vaultInfo.underlyingBalance && vaultInfo.underlyingBalance.length > 0 && (
                  <div className="mt-1 text-sm text-zinc-500">
                    ≈ {(Number(vaultInfo.underlyingBalance[0]) / 10000000).toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}{" "}
                    XLM
                  </div>
                )}
              </div>
            </div>

            {/* APY / Vault Details Card */}
            <div className="rounded-3xl border border-zinc-200/60 bg-white p-6 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Vault APY
              </span>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold tracking-tight text-brand">
                  {(vaultInfo.apyPercent).toFixed(2)}%
                </span>
                <span className="text-xs font-medium text-zinc-400 uppercase">
                  APY
                </span>
              </div>
              <div className="mt-2 text-xs text-zinc-400">
                {vaultInfo.name || "DeFindex Vault"} ({vaultInfo.symbol || "DFX"})
              </div>
            </div>
          </div>
        )}

        {/* Transaction Panel */}
        <div className="overflow-hidden rounded-3xl border border-zinc-200/60 bg-white shadow-md">
          {/* Tab Selection */}
          <div className="flex border-b border-zinc-100 bg-zinc-50/50 p-1">
            <button
              onClick={() => {
                setActiveTab("deposit");
                setTxStatus({ kind: "idle" });
              }}
              className={`flex-1 rounded-2xl py-3 text-sm font-semibold transition-all ${
                activeTab === "deposit"
                  ? "bg-white text-brand shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              Deposit
            </button>
            <button
              onClick={() => {
                setActiveTab("withdraw");
                setTxStatus({ kind: "idle" });
              }}
              className={`flex-1 rounded-2xl py-3 text-sm font-semibold transition-all ${
                activeTab === "withdraw"
                  ? "bg-white text-brand shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              Withdraw
            </button>
          </div>

          {/* Action Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-700">
                {activeTab === "deposit" ? "Amount" : "Shares to withdraw"}
                </span>
                {activeTab === "deposit" ? (
                  <span className="text-xs text-zinc-400">
                   Wallet Balance: {nativeBalance.toLocaleString()} XLM
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAmount(String(vaultInfo?.userShares ?? 0))}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Max: {Number(vaultInfo?.userShares ?? 0).toLocaleString()} SHARES
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  step={activeTab === "deposit" ? "any" : "1"}
                  inputMode={activeTab === "deposit" ? "decimal" : "numeric"}
                  placeholder={activeTab === "deposit" ? "0.00" : "0"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 px-4 py-4 pr-16 text-lg font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                />
                <span className="absolute right-4 font-semibold text-zinc-400">
                  {activeTab === "deposit" ? "XLM" : "SHARES"}
                </span>
              </div>
            </div>

            {/* Status alerts */}
            {txStatus.kind === "building" && (
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 border border-zinc-200/50 p-4 text-sm text-zinc-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                Building Soroban auth and transaction XDR...
              </div>
            )}
            {txStatus.kind === "signing" && (
              <div className="flex items-center gap-3 rounded-2xl bg-brand-tint/30 border border-brand/10 p-4 text-sm text-brand">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
                Awaiting Pollar signature and submission...
              </div>
            )}
            {txStatus.kind === "success" && (
              <div className="flex flex-col gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-bold">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-xs">
                    ✓
                  </span>
                  Transaction Successful!
                </div>
                <div className="break-all font-mono text-xs text-emerald-600/80">
                  Hash: {txStatus.hash}
                </div>
              </div>
            )}
            {txStatus.kind === "error" && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-800">
                <div className="font-bold">Transaction Failed</div>
                <div className="mt-1 text-xs">{txStatus.message}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={
                !amount ||
                Number(amount) <= 0 ||
                txStatus.kind === "building" ||
                txStatus.kind === "signing"
              }
              className="w-full rounded-2xl bg-gradient-to-r from-brand to-brand-dark py-4 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 active:translate-y-0 disabled:pointer-events-none disabled:opacity-40"
            >
              {txStatus.kind === "building" || txStatus.kind === "signing"
                ? "Processing..."
                : activeTab === "deposit"
                ? "Deposit & Earn"
                : "Withdraw"}
            </button>
          </form>
        </div>

        {/* Polling timer details */}
        {lastUpdated && (
          <div className="text-center text-[10px] font-medium text-zinc-400">
            Last updated at: {lastUpdated.toLocaleTimeString()} (Polling every 5s)
          </div>
        )}
      </main>
    </div>
  );
}
