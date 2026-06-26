# Submission: @pollar/vue — Vue 3 Client for Pollar

**Issue:** [#14](https://github.com/pollar-xyz/pollar-backoffice/issues/14)
**Nickname:** Shadow-MMN
**Repo:** https://github.com/Shadow-MMN/pollar-vue-Shadow-MMN

## Deliverables

- [x] Vue plugin (`PollarPlugin`) — registers via `app.use()`, provides reactive state
- [x] `usePollar()` composable — exposes `walletAddress`, `signAndSubmitTx`, `buildTx`, session state
- [x] `PollarEmailLogin` component — email OTP flow
- [x] Dual build (ESM + CJS) with TypeScript types
- [x] Vite + Vue demo app consuming the package via `npm pack` tarball
- [x] End-to-end testnet flow verified — email login → wallet address → sign & submit → `SUCCESS`

## Verified Transaction

```json
{
  "status": "success",
  "hash": "99e98196d2c731e7f763a1f3f3ab5d81b9936eb96395ed87058453483e6ee1d8"
}
```
