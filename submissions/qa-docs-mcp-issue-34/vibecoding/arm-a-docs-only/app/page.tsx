"use client";

import { PollarProvider, usePollar } from "@pollar/react";
import { useEffect } from "react";
import { Providers } from "./providers";

function WalletDemo() {
  const {
    isAuthenticated,
    wallet,
    login,
    runTx,
    openTxHistoryModal,
    verified,
  } = usePollar();

  if (!isAuthenticated) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Arm A — Docs-only Quickstart</h1>
        <p>Built from llms-full.txt Quickstart only (no MCP).</p>
        <button onClick={() => login({ provider: "google" })}>
          Continue with Google
        </button>
        <button style={{ marginLeft: 8 }} onClick={() => login({ provider: "github" })}>
          Continue with GitHub
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Arm A — Wallet ready</h1>
      <p>
        verified={String(verified)} · address={wallet?.address ?? "—"}
      </p>
      <button
        onClick={() =>
          runTx("payment", {
            destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            amount: "1.00",
            asset: { type: "native" },
          })
        }
      >
        Send 1 XLM (test)
      </button>
      <button style={{ marginLeft: 8 }} onClick={() => openTxHistoryModal()}>
        History
      </button>
    </main>
  );
}

export default function Page() {
  return (
    <Providers>
      <WalletDemo />
    </Providers>
  );
}
