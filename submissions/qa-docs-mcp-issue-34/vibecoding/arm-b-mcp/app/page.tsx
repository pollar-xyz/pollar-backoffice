"use client";

import { usePollar } from "@pollar/react";
import { Providers } from "./providers";

function WalletDemo() {
  const {
    isAuthenticated,
    wallet,
    login,
    runTx,
    openTxHistoryModal,
    openEnabledAssetsModal,
    verified,
    enabledAssets,
  } = usePollar();

  if (!isAuthenticated) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Arm B — MCP + docs Quickstart</h1>
        <p>
          App provisioned via MCP Gateway (create_application / domains /
          readiness / enable_asset), then coded from docs.
        </p>
        <button onClick={() => login({ provider: "google" })}>
          Continue with Google
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Arm B — Wallet ready</h1>
      <p>
        verified={String(verified)} · address={wallet?.address ?? "—"}
      </p>
      <p>enabledAssets step: {enabledAssets?.step ?? "—"}</p>
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
      <button style={{ marginLeft: 8 }} onClick={() => openEnabledAssetsModal()}>
        Assets
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
