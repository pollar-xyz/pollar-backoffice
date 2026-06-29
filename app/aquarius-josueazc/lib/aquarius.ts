/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Aquarius (Stellar AMM) swap helpers — 100% client-side, contract-direct.
 *
 * No backend and no secret keys: we talk to the Aquarius Swap Router on Soroban
 * with @stellar/stellar-sdk, discover pools on-chain, simulate against the
 * Soroban RPC for quotes and to assemble the transaction, and hand the unsigned
 * XDR to Pollar's `signAndSubmitTx`.
 *
 * Everything that builds the swap XDR lives behind {@link buildAquariusSwapXdr}
 * so it can later be lifted into a Pollar adapter/component unchanged.
 *
 * Router ABI (read from the deployed contract spec on testnet):
 *   get_pools(tokens) -> Map<BytesN<32> pool_index, Address pool>
 *   estimate_swap(tokens, token_in, token_out, pool_index, in_amount) -> u128
 *   swap(user, tokens, token_in, token_out, pool_index, in_amount, out_min) -> u128
 *
 * `tokens` is the pool's token set sorted canonically (ascending contract id);
 * Aquarius rejects an unsorted set.
 */

import {
  Account,
  Address,
  Asset,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// --- Config (all public; overridable via NEXT_PUBLIC_* envs) ----------------

export const ROUTER_ADDRESS =
  process.env.NEXT_PUBLIC_AQUARIUS_ROUTER ??
  "CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD";

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
  "https://soroban-testnet.stellar.org";

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET;

/** Horizon endpoint, used to read classic balances / trustlines. */
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

/**
 * Whether `account` already trusts the classic asset `code:issuer` (so it can
 * receive it). Native XLM never needs a trustline.
 */
export async function hasTrustline(
  account: string,
  code: string,
  issuer: string,
): Promise<boolean> {
  const res = await fetch(`${HORIZON_URL}/accounts/${account}`);
  if (!res.ok) return false;
  const data = await res.json();
  return (data.balances ?? []).some(
    (b: any) => b.asset_code === code && b.asset_issuer === issuer,
  );
}

/** Stellar uses 7 decimals for native XLM and classic assets. */
export const DECIMALS = 7;

export function getServer(): rpc.Server {
  return new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") });
}

// --- Token address helpers --------------------------------------------------

export function nativeXlmContractId(): string {
  return Asset.native().contractId(NETWORK_PASSPHRASE);
}

export function assetContractId(code: string, issuer: string): string {
  return new Asset(code, issuer).contractId(NETWORK_PASSPHRASE);
}

/** Canonical token-set order Aquarius expects (ascending contract id). */
export function sortTokens(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function toStroops(amount: string | number): bigint {
  const [int, frac = ""] = String(amount).split(".");
  const fracPadded = (frac + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(int || "0") * BigInt(10) ** BigInt(DECIMALS) + BigInt(fracPadded || "0");
}

export function fromStroops(stroops: bigint | string | number): number {
  return Number(BigInt(stroops)) / 10 ** DECIMALS;
}

// --- ScVal helpers ----------------------------------------------------------

const addrScVal = (id: string) => Address.fromString(id).toScVal();
const u128ScVal = (v: bigint) => nativeToScVal(v, { type: "u128" });
const bytesScVal = (b: Buffer) => xdr.ScVal.scvBytes(b);
const tokensScVal = (tokens: string[]) =>
  xdr.ScVal.scvVec(tokens.map(addrScVal));

// --- Simulation -------------------------------------------------------------

async function getAccountOrDummy(
  server: rpc.Server,
  from: string,
): Promise<Account> {
  return server.getAccount(from).catch(() => new Account(from, "0"));
}

async function simulateRead(
  server: rpc.Server,
  from: string,
  method: string,
  args: xdr.ScVal[],
): Promise<xdr.ScVal> {
  const tx = new TransactionBuilder(await getAccountOrDummy(server, from), {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(ROUTER_ADDRESS).call(method, ...args))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${method}: ${sim.error.split("\n")[0]}`);
  }
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result
    ?.retval;
  if (!retval) throw new Error(`${method} returned no value`);
  return retval;
}

// --- Pool discovery (on-chain) ----------------------------------------------

export interface PoolInfo {
  /** The pool's token set, sorted canonically. */
  tokens: [string, string];
  /** Pool index hash (BytesN<32>). */
  hash: Buffer;
  /** Pool contract address. */
  address: string;
}

/** All Aquarius pools for a pair, via `get_pools(sortedTokens)`. */
export async function getPoolsForPair(
  server: rpc.Server,
  from: string,
  tokenA: string,
  tokenB: string,
): Promise<PoolInfo[]> {
  const tokens = sortTokens(tokenA, tokenB);
  const retval = await simulateRead(server, from, "get_pools", [
    tokensScVal(tokens),
  ]);
  const map = retval.map();
  if (!map || map.length === 0) {
    throw new Error("No Aquarius pool exists for this pair on this network");
  }
  return map.map((entry) => ({
    tokens,
    hash: Buffer.from(entry.key().bytes()),
    address: Address.fromScVal(entry.val()).toString(),
  }));
}

// --- Quote (read-only) ------------------------------------------------------

/** `estimate_swap` for one pool. Returns the expected output in stroops. */
export async function estimateSwapForPool(
  server: rpc.Server,
  from: string,
  pool: PoolInfo,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<bigint> {
  const retval = await simulateRead(server, from, "estimate_swap", [
    tokensScVal(pool.tokens),
    addrScVal(tokenIn),
    addrScVal(tokenOut),
    bytesScVal(pool.hash),
    u128ScVal(amountIn),
  ]);
  return BigInt(scValToNative(retval));
}

export interface Quote {
  /** Best expected output, in stroops. */
  outAmount: bigint;
  /** The pool that gives the best output (best-pool routing). */
  pool: PoolInfo;
  /** Price impact as a fraction (0.01 = 1%), vs. the small-amount spot price. */
  priceImpact: number;
}

/**
 * Best-pool quote: estimates across every pool for the pair and returns the one
 * with the highest output, plus an estimated price impact (the swap rate vs. a
 * tiny-amount spot rate on the same pool).
 */
export async function quoteBestSwap(params: {
  from: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  server?: rpc.Server;
}): Promise<Quote> {
  const server = params.server ?? getServer();
  const pools = await getPoolsForPair(
    server,
    params.from,
    params.tokenIn,
    params.tokenOut,
  );

  const results = await Promise.all(
    pools.map(async (pool) => {
      try {
        const out = await estimateSwapForPool(
          server,
          params.from,
          pool,
          params.tokenIn,
          params.tokenOut,
          params.amountIn,
        );
        return { pool, out };
      } catch {
        return { pool, out: BigInt(-1) };
      }
    }),
  );

  const best = results.reduce((a, b) => (b.out > a.out ? b : a));
  if (best.out <= BigInt(0)) throw new Error("No pool could quote this swap");

  // Price impact: compare the effective rate against a small reference amount.
  const ref = BigInt(10) ** BigInt(DECIMALS); // 1.0 unit
  let priceImpact = 0;
  try {
    const refOut = await estimateSwapForPool(
      server,
      params.from,
      best.pool,
      params.tokenIn,
      params.tokenOut,
      ref,
    );
    const spotRate = Number(refOut) / Number(ref);
    const execRate = Number(best.out) / Number(params.amountIn);
    if (spotRate > 0) priceImpact = Math.max(0, 1 - execRate / spotRate);
  } catch {
    /* leave priceImpact at 0 if the reference quote fails */
  }

  return { outAmount: best.out, pool: best.pool, priceImpact };
}

// --- Build the swap XDR (the isolated, reusable entry point) -----------------

export interface BuildSwapArgs {
  tokenIn: string;
  tokenOut: string;
  from: string;
  amountIn: bigint;
  minAmountOut: bigint;
  /** Pool to route through. If omitted, the best pool is auto-selected. */
  pool?: PoolInfo;
  server?: rpc.Server;
}

/**
 * Builds, simulates and assembles an Aquarius swap, returning the **unsigned
 * XDR** ready for `signAndSubmitTx`. Strict-send: spend exactly `amountIn` of
 * `tokenIn`, requiring at least `minAmountOut` of `tokenOut`.
 *
 * Simulation populates the SorobanData, the auth entries (the user must
 * authorize moving `tokenIn`) and the resource fee — Pollar then signs those
 * auth entries and submits.
 *
 * This is the single function a future Pollar adapter/component would re-use.
 */
export async function buildAquariusSwapXdr(args: BuildSwapArgs): Promise<string> {
  const server = args.server ?? getServer();
  let pool = args.pool;
  if (!pool) {
    const quote = await quoteBestSwap({
      from: args.from,
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      amountIn: args.amountIn,
      server,
    });
    pool = quote.pool;
  }

  const account = await server.getAccount(args.from);
  const op = new Contract(ROUTER_ADDRESS).call(
    "swap",
    addrScVal(args.from),
    tokensScVal(pool.tokens),
    addrScVal(args.tokenIn),
    addrScVal(args.tokenOut),
    bytesScVal(pool.hash),
    u128ScVal(args.amountIn),
    u128ScVal(args.minAmountOut),
  );

  const tx = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(180)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`swap simulation failed: ${sim.error.split("\n")[0]}`);
  }

  // assembleTransaction folds in SorobanData, auth and the resource fee.
  return rpc.assembleTransaction(tx, sim).build().toXDR();
}
