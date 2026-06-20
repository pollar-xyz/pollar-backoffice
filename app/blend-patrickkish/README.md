# Blend + Pollar (patrickkish)

Client-side Blend lending integration for issue [#5](https://github.com/pollar-xyz/pollar-backoffice/issues/5).

## Route

```
/blend-patrickkish
```

## Run

From the repo root:

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY=pub_testnet_...
npm install
npm run dev
```

Open `http://localhost:3000/blend-patrickkish`.

## Environment variables

| Variable | Required | Default (testnet) |
|----------|----------|-------------------|
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | yes | — |
| `NEXT_PUBLIC_POLLAR_NETWORK` | no | `testnet` |
| `NEXT_PUBLIC_BLEND_POOL_ADDRESS` | no | `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` |
| `NEXT_PUBLIC_BLEND_USDC_ADDRESS` | no | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | no | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | no | `Test SDF Network ; September 2015` |

Testnet contract addresses come from [blend-utils/testnet.contracts.json](https://github.com/blend-capital/blend-utils/blob/main/testnet.contracts.json).

## Signing spike

The highest-risk step is Soroban auth on a client-built XDR. Flow:

1. `buildBlendSupplyXdr` / `buildBlendWithdrawXdr` build a `PoolContractV2.submit` operation.
2. The transaction is simulated against Soroban RPC (`simulateTransaction` + `assembleTransaction`).
3. Pollar `signAndSubmitTx(unsignedXdr)` signs Soroban auth entries and submits.

If simulation fails, check that the wallet has testnet XLM (friendbot) and **Blend testnet USDC** (not Circle faucet USDC).

## Testnet USDC (important)

Blend on testnet uses its own USDC SAC token:

| | |
|---|---|
| **Contract** | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` |
| **Pool** | `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` (TestnetV2) |

This is **not** the same as Circle testnet USDC (`GBBD…` issuer). To lend:

1. **Enable a USDC trustline** in Pollar (Blend page → “Enable USDC trustline” or “Manage assets”).
2. **Get test tokens** from [testnet.blend.capital](https://testnet.blend.capital/) (faucet — use the same wallet address).
3. Lend on `/blend-patrickkish`.

If you see `trustline entry is missing`, step 1 was skipped. If balance is 0, complete step 2.

**Where funds live:** wallet USDC → supplied in the pool (position panel) → back to wallet on withdraw.

## Structure

```
app/blend-patrickkish/
  lib/build-transaction.ts   # buildBlendSupplyXdr, buildBlendWithdrawXdr
  lib/pool-data.ts           # position + APY reads (polling)
  lib/config.ts              # env + amount helpers
  components/BlendPanel.tsx  # UI
```

XDR builders are isolated so they can move into a Pollar adapter later.

## Demo checklist

- [ ] Supply USDC on testnet via Pollar `signAndSubmitTx`
- [ ] Withdraw USDC the same way
- [ ] Position + APY update live in the UI
- [ ] Attach a short screen recording to the PR
