import {
  SoroswapSDK,
  SupportedNetworks,
  SupportedProtocols,
  TradeType,
} from "@soroswap/sdk";

export const NETWORK = SupportedNetworks.TESTNET;

const PROTOCOLS: SupportedProtocols[] = [
  SupportedProtocols.SOROSWAP,
  SupportedProtocols.PHOENIX,
];

function getClient(): SoroswapSDK {
  const key = process.env.SOROSWAP_API_KEY;
  if (!key) throw new Error("SOROSWAP_API_KEY not configured");
  return new SoroswapSDK({ apiKey: key, defaultNetwork: NETWORK });
}

// Returns the Soroswap quote and the unsigned XDR ready for Pollar signing.
// Move only this file to wire a different adapter or network.
export async function buildSoroswapSwapXdr(params: {
  assetIn: string;
  assetOut: string;
  amount: bigint;
  from: string;
}) {
  const sdk = getClient();
  const quote = await sdk.quote(
    {
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amount: params.amount,
      tradeType: TradeType.EXACT_IN,
      protocols: PROTOCOLS,
    },
    NETWORK,
  );
  const { xdr } = await sdk.build({ quote, from: params.from }, NETWORK);
  return { quote, xdr };
}
