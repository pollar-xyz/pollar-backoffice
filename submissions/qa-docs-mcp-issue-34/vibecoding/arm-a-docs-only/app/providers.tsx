"use client";

import { PollarProvider } from "@pollar/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PollarProvider
      client={{
        apiKey: process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY!,
        stellarNetwork: "testnet",
      }}
    >
      {children}
    </PollarProvider>
  );
}
