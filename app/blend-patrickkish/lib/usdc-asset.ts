import type { EnabledAssetRecord, WalletBalanceRecord } from "@pollar/core";
import { blendConfig } from "./config";

/** Blend testnet USDC SAC — not Circle mainnet/testnet classic USDC. */
export const BLEND_TESTNET_USDC_CONTRACT = blendConfig.usdcId;

export function findUsdcBalance(
  balances: WalletBalanceRecord[],
): WalletBalanceRecord | undefined {
  return (
    balances.find(
      (b) =>
        b.code === "USDC" &&
        (b.issuer === BLEND_TESTNET_USDC_CONTRACT ||
          b.issuer?.includes(BLEND_TESTNET_USDC_CONTRACT.slice(0, 8))),
    ) ?? balances.find((b) => b.code === "USDC")
  );
}

export function findUsdcEnabledAsset(
  assets: EnabledAssetRecord[],
): EnabledAssetRecord | undefined {
  return (
    assets.find(
      (a) =>
        a.code === "USDC" &&
        (a.issuer === BLEND_TESTNET_USDC_CONTRACT ||
          a.issuer?.includes(BLEND_TESTNET_USDC_CONTRACT.slice(0, 8))),
    ) ?? assets.find((a) => a.code === "USDC")
  );
}
