# Aquarius × Pollar — token swap (AMM) signed with Pollar

A 100% client-side route that swaps tokens (default **USDC ⇄ XLM**) through the
**Aquarius AMM** on Stellar testnet, signing and submitting with the user's
**Pollar** wallet via `signAndSubmitTx`. No backend, no secret keys.

- Route: **`/aquarius-josueazc`**
- Reusable XDR builder: [`lib/aquarius.ts`](./lib/aquarius.ts) → `buildAquariusSwapXdr()`
- Token config: [`lib/tokens.ts`](./lib/tokens.ts)
- UI: [`page.tsx`](./page.tsx)

## What it does

- Connects with Pollar (`usePollar()`), using `walletAddress` as the swap `from`.
- Discovers pools on-chain (`get_pools`) and routes through the **best pool**.
- Shows a **live quote** (polled), **price impact**, and a slippage-derived
  **minimum received** — all read-only via Soroban **simulation**, no signing.
- Builds the swap XDR client-side, simulates it to populate SorobanData + auth +
  fee, and hands the unsigned XDR to **Pollar `signAndSubmitTx`**.
- Establishes a trustline (Pollar `setTrustline`) when the wallet needs one to
  receive a classic asset like USDC.

## Run it

Pollar is already wired in the app (`app/providers.tsx`); this route only
consumes `usePollar()`. From the repo root:

```bash
npm install
npm run dev        # http://localhost:3000/aquarius-josueazc
```

Authorize `http://localhost:3000` in the Pollar dashboard
(**Configuration → Domains**) so the publishable key works from localhost.

### Environment

All public; only `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` is required (the rest have
testnet defaults baked in):

| Variable | Purpose | Default |
| -------- | ------- | ------- |
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | Pollar key (`pub_testnet_…`) — consumed by the app provider | — (required) |
| `NEXT_PUBLIC_POLLAR_NETWORK` | `testnet` / `mainnet` | `testnet` |
| `NEXT_PUBLIC_AQUARIUS_ROUTER` | Aquarius Swap Router contract | `CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Soroban RPC | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | Horizon (trustline checks) | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Network passphrase | Test SDF Network ; September 2015 |
| `NEXT_PUBLIC_USDC_ISSUER` | Classic USDC issuer for the demo pair | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (Circle testnet) |

To get test funds: friendbot for XLM, then swap XLM → USDC in the app.

## The signing spike (blocking criterion) — PASSED ✅

The highest-risk question was whether Pollar's `signAndSubmitTx` correctly signs
the **Soroban auth entries** of a swap XDR built client-side. It does — verified
end-to-end on testnet, both directions:

| Direction | Tx hash | Explorer |
| --------- | ------- | -------- |
| XLM → USDC | `515283e3fe415681c41df9edd45c9676523a2ffc4e171018872a04f148bdfc24` | [stellar.expert](https://stellar.expert/explorer/testnet/tx/515283e3fe415681c41df9edd45c9676523a2ffc4e171018872a04f148bdfc24) |
| USDC → XLM | `ae57263c533b1cf3c7c1aa5981da63e5a60b15dc8aa99c32048edfca7d8935fb` | [stellar.expert](https://stellar.expert/explorer/testnet/tx/ae57263c533b1cf3c7c1aa5981da63e5a60b15dc8aa99c32048edfca7d8935fb) |

### What I learned wiring it up

- **No Aquarius JS SDK** — the router is called contract-direct with
  `@stellar/stellar-sdk`. The exact ABI was read from the deployed contract spec:
  - `get_pools(tokens) -> Map<BytesN<32> pool_index, Address pool>`
  - `estimate_swap(tokens, token_in, token_out, pool_index, in_amount) -> u128`
  - `swap(user, tokens, token_in, token_out, pool_index, in_amount, out_min) -> u128`
- **Tokens must be sorted** by contract id. An unsorted set makes `get_pools`
  fail with `Error(Contract, #2002) TokensNotSorted`. `lib/aquarius.ts` sorts the
  pair canonically before every call.
- **Quotes are simulation-only.** `estimate_swap` is read via
  `simulateTransaction` against the Soroban RPC — no account, no signature.
- **Best-pool routing**: a pair can have several pools (the testnet USDC/XLM pair
  has 3). The quote estimates each and picks the highest output.
- **Trustlines**: a swap that delivers a classic asset fails with
  `Error(Contract, #13) "trustline entry is missing for account"` if the wallet
  doesn't trust it yet. The UI detects this (Horizon) and offers a one-click
  trustline via Pollar `setTrustline` before the swap.
- **Pollar signs the auth entries**: after simulation populates the auth, a plain
  `await signAndSubmitTx(unsignedXdr)` signs and submits — no special handling.

## Reusing the builder

Everything that constructs the swap is behind one function, so it can move into a
Pollar adapter/component unchanged:

```ts
import { buildAquariusSwapXdr } from "./lib/aquarius";

const xdr = await buildAquariusSwapXdr({
  from: walletAddress,
  tokenIn, tokenOut,      // SAC contract ids
  amountIn, minAmountOut, // bigint stroops
});
const outcome = await signAndSubmitTx(xdr);
```

## Acceptance criteria

- [x] Signing spike passes — swap on testnet signed with `signAndSubmitTx`
- [x] Works both directions (USDC→XLM and XLM→USDC)
- [x] XDR building isolated in a reusable function (`buildAquariusSwapXdr`)
- [x] 100% client-side — no backend, no secret keys
- [x] Uses the user's address from `usePollar()` as `from`
- [x] Live quote + price impact (polling) + slippage-derived minimum received
- [x] All work inside this folder; `package.json` untouched (`@stellar/stellar-sdk` already present)
- [x] No unnecessary dependencies
- [x] Pins `@pollar/core@^0.9.0`, `@pollar/react@^0.9.0` (app-level)
- [x] README with run steps and envs
- [ ] Demo video (attached in the PR)
