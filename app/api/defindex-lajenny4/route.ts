/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { DefindexSDK, SupportedNetworks } from "@defindex/sdk";

const sdk = new DefindexSDK({
  apiKey: process.env.DEFINDEX_API_KEY || "",
});

/**
 * Isolated function to build the deposit XDR.
 * Can be easily moved to a Pollar adapter later.
 */
export async function buildDefindexDepositXdr({
  vault,
  caller,
  amount,
}: {
  vault: string;
  caller: string;
  amount: number;
}) {
  const scaledAmount = Math.round(amount * 10000000);
  const response = await sdk.depositToVault(
    vault,
    {
      caller,
      amounts: [scaledAmount],
      invest: true,
      slippageBps: 100,
    },
    SupportedNetworks.TESTNET
  );

  if (!response.xdr) {
    throw new Error("Deposit transaction build returned empty XDR");
  }
  return response.xdr;
}

/**
 * Isolated function to build the withdraw XDR.
 * Can be easily moved to a Pollar adapter later.
 */
export async function buildDefindexWithdrawXdr({
  vault,
  caller,
  amount,
}: {
  vault: string;
  caller: string;
  amount: number;
}) {
  const response = await sdk.withdrawShares(vault, {
    caller,
    shares: Math.round(amount),
    slippageBps: 100,
  }, SupportedNetworks.TESTNET);
/*  const response = await sdk.withdrawFromVault(
    vault,
    {
      caller,
      amounts: [scaledAmount],
      slippageBps: 100, // 1% slippage tolerance
    },
    SupportedNetworks.TESTNET
  );*/

  if (!response.xdr) {
    throw new Error("Withdraw transaction build returned empty XDR");
  }
  return response.xdr;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const vault = searchParams.get("vault");
    const caller = searchParams.get("caller");

    if (!vault) {
      return NextResponse.json(
        { error: "Vault address is required" },
        { status: 400 }
      );
    }

    const vaultInfo = await sdk.getVaultInfo(vault, SupportedNetworks.TESTNET);
    let apyPercent = 0;
    try {
      const apyRes = await sdk.getVaultAPY(vault, SupportedNetworks.TESTNET);
      apyPercent = apyRes.apy;
    } catch (e) {
      console.warn("Failed to fetch APY:", e);
    }

    let userShares = 0;
    let underlyingBalance: number[] = [];
    if (caller) {
      try {
        const balanceRes = await sdk.getVaultBalance(
          vault,
          caller,
          SupportedNetworks.TESTNET
        );
        userShares = balanceRes.dfTokens;
        underlyingBalance = balanceRes.underlyingBalance;
      } catch (e) {
        console.warn("Failed to fetch user vault balance:", e);
      }
    }

    return NextResponse.json({
      name: vaultInfo.name,
      symbol: vaultInfo.symbol,
      assets: vaultInfo.assets,
      apyPercent,
      userShares,
      underlyingBalance,
    });
  } catch (error: any) {
    console.error("GET defindex info error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch vault details" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, vault, caller, amount } = body;

    if (!action || !vault || !caller || amount === undefined) {
      return NextResponse.json(
        { error: "Missing required parameters: action, vault, caller, amount" },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    let xdr = "";
    if (action === "deposit") {
      xdr = await buildDefindexDepositXdr({ vault, caller, amount: numAmount });
    } else if (action === "withdraw") {
      xdr = await buildDefindexWithdrawXdr({ vault, caller, amount: numAmount });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Supported: deposit, withdraw" },
        { status: 400 }
      );
    }

    return NextResponse.json({ xdr });
  } catch (error: any) {
    console.error("POST defindex action error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to build transaction XDR" },
      { status: 500 }
    );
  }
}
