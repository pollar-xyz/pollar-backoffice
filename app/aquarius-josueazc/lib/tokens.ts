import { assetContractId, nativeXlmContractId } from "./aquarius";

export interface TokenDef {
  symbol: string;
  /** Soroban contract id (SAC) used by Aquarius. */
  contractId: string;
  /** True for native XLM (no trustline needed to receive). */
  native?: boolean;
  /** Classic asset code/issuer — needed to establish a trustline to receive it. */
  code?: string;
  issuer?: string;
}

/**
 * Default testnet tokens for the demo: native XLM and Circle's testnet USDC.
 * Both are derived to their Stellar Asset Contract (SAC) ids. Override the USDC
 * issuer with NEXT_PUBLIC_USDC_ISSUER if the assigned pool uses a different one.
 */
const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ??
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const XLM: TokenDef = {
  symbol: "XLM",
  contractId: nativeXlmContractId(),
  native: true,
};
export const USDC: TokenDef = {
  symbol: "USDC",
  contractId: assetContractId("USDC", USDC_ISSUER),
  code: "USDC",
  issuer: USDC_ISSUER,
};

export const TOKENS: TokenDef[] = [USDC, XLM];
