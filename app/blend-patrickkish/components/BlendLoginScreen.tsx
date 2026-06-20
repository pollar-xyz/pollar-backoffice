"use client";

import Link from "next/link";
import { usePollar } from "@pollar/react";

const keyConfigured =
  !!process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY.includes("xxxx");

export function BlendLoginScreen() {
  const { openLoginModal } = usePollar();

  return (
    <main className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Stellar testnet
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
          Blend + Pollar
        </h1>
        <p className="max-w-sm text-base leading-7 text-zinc-600">
          Sign in with the same Pollar wallet you use on the home page to lend
          and withdraw testnet USDC on Blend.
        </p>
      </div>

      <button
        type="button"
        onClick={openLoginModal}
        disabled={!keyConfigured}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-brand px-6 font-medium text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Sign in with Pollar
      </button>

      <Link
        href="/"
        className="text-sm font-medium text-brand hover:underline"
      >
        ← Back to Pollar Wallet home
      </Link>

      {!keyConfigured && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Set{" "}
          <code className="font-mono">NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY</code>{" "}
          in <code className="font-mono">.env.local</code> and restart the dev
          server.
        </p>
      )}
    </main>
  );
}
