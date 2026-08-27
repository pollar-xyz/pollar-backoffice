"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  PollarProvider,
  type PollarConfig,
} from "@pollar/react";
import {
  PollarClient,
  type PollarClientConfig,
  type StellarNetwork,
} from "@pollar/core";
// Styles for the Pollar-provided modals (login, send, receive, balance, ...).
import "@pollar/react/styles.css";

const publishableKey = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? "";
const stellarNetwork =
  (process.env.NEXT_PUBLIC_POLLAR_NETWORK as StellarNetwork | undefined) ??
  "testnet";

/**
 * One PollarClient per API key for the lifetime of this JS module.
 * Passing a config object into <PollarProvider> makes it `new PollarClient()`
 * on every mount; React Strict Mode + route navigations then trip
 * "Another PollarClient is already active" and DPoP thumbprint-mismatch.
 */
const clientConfig: PollarClientConfig = {
  apiKey: publishableKey,
  stellarNetwork,
};

let sharedClient: PollarClient | null = null;

/**
 * Exposed for pages that call ramp/quote/etc. endpoints directly on the
 * client (bypassing the built-in modals) — same singleton the provider uses,
 * so it shares auth/session state instead of spinning up a second client.
 */
export function getSharedPollarClient(): PollarClient {
  if (!sharedClient) {
    sharedClient = new PollarClient(clientConfig);
  }
  return sharedClient;
}

export function Providers({ children }: { children: ReactNode }) {
  // PollarClient relies on browser APIs (WebCrypto, localStorage), so only
  // construct it on the client. useSyncExternalStore returns the server
  // snapshot (false) during SSR and the first paint, then the client snapshot
  // (true) — giving a clean client-only mount with no hydration mismatch.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!isClient) {
    return <div className="flex flex-1 items-center justify-center bg-white" />;
  }

  // Providing appConfig skips the remote /applications/config fetch, so the app
  // boots even before a dashboard application is fully provisioned. The SDK
  // fills any omitted UI fields with its own defaults.
  // Pollar ^0.11 requires application.network + application.chains when supplying
  // a local appConfig (replacement for /applications/config, not a patch).
  const appConfig: PollarConfig = {
    application: {
      name: "Pollar Wallet",
      network: stellarNetwork,
      chains: ["STELLAR"],
    },
    styles: {
      accentColor: "#0560a9",
      emailEnabled: true,
      embeddedWallets: true,
      smartWallet: true,
      providers: { google: true, github: true },
    },
  };

  return (
    <PollarProvider client={getSharedPollarClient()} appConfig={appConfig}>
      {children}
    </PollarProvider>
  );
}
