# Submission: @pollar/angular — Angular Client for Pollar

**Issue:** [#15](https://github.com/pollar-xyz/pollar-backoffice/issues/15)
**Nickname:** josueazc
**Repo:** https://github.com/josueazc/pollar-angular-josueazc
**Demo video:** https://github.com/user-attachments/assets/ef3b26f6-694f-4a2a-81b9-d99c38cd35d8
**App ID (testnet):** `cmqpvje1v00010hryv3uzflf4`

## What it is

A small, standalone-first Angular wrapper around `@pollar/core` (browser/web
path). Angular 19, standalone APIs and signals, **no NgModules**. Built as an
Angular library with **ng-packagr (Angular Package Format)**, types included.
Pins `@pollar/core@^0.9.0` and pulls in no extra dependencies — everything the
core already solves (auth, key management, storage, signing) is just wired into
Angular, not reimplemented.

## API

### `providePollar({ apiKey, network?, deviceLabel? })`

Provider function for standalone bootstrap — used in `bootstrapApplication`
providers the same way as `provideHttpClient()`. It reads the API key and
constructs a single `PollarClient`, wiring the core's **browser key manager**
(`WebCryptoKeyManager`, non-extractable DPoP keys) and **storage**
(`defaultStorage()`, localStorage with in-memory fallback). The initial keypair
+ session restore (`client.ready()`) is kicked off during bootstrap via
`APP_INITIALIZER`. This is the canonical API.

### `PollarService` (provided in root)

Injectable façade exposing the core's callback stores as **signals**:

- `walletAddress: Signal<string | null>` — resolved from the persisted session
- `isAuthenticated`, `authState`, `loginStep`, `authError`
- `txState: Signal<TransactionState | null>`, `networkState`
- transactions: `buildTx(...)`, `signTx(...)`, `submitTx(...)`,
  `signAndSubmitTx(...)`, `runTx(...)` (mirror the core client)
- email login: `beginEmailLogin()`, `sendEmailCode(email)`,
  `verifyEmailCode(code)`, `cancelLogin()`, `logout()`

### `<pollar-email-login />`

Minimal standalone component that drives the email-OTP flow end to end.

## Install & use

```bash
npm install @pollar/angular @pollar/core@^0.9.0
```

```ts
// main.ts
bootstrapApplication(AppComponent, {
  providers: [providePollar({ apiKey: 'pub_testnet_...', network: 'testnet' })],
});
```

```ts
const pollar = inject(PollarService);
pollar.walletAddress(); // signal

const built = await pollar.buildTx('payment', {
  destination: 'G...',
  amount: '1.5',
  asset: { type: 'native' },
});
if (built.status === 'built') {
  await pollar.signAndSubmitTx(built.buildData.unsignedXdr);
}
```

```html
<pollar-email-login />
```

## Deliverables

- [x] `providePollar()` provider function for standalone bootstrap
- [x] `PollarService` (root) — `walletAddress`, `buildTx`, `signAndSubmitTx` and session/tx state as signals
- [x] Standalone email-login component
- [x] Library built with ng-packagr (APF), types included
- [x] Demo app consuming the library from an `npm pack` tarball (not a relative path / workspace link)
- [x] End-to-end testnet flow: email login → wallet address → fund (friendbot) → build → sign → submit → `SUCCESS`
- [x] README with install, peers, usage and polyfill notes (no polyfills needed on the browser/custodial path)
- [x] Unit tests passing; `npm pack` installs cleanly into a fresh app

## Verified transactions (testnet)

Custodial wallet: `GCKAJ4SY2SA7WFY3Q5WJUWPPWUDDRBLEV6PUQNUHSZKVKONQRSMCHXWJ`

| Amount | Hash | Explorer |
| ------ | ---- | -------- |
| 2 XLM | `e0ea61c51cc496f02750fb2fd8ab5a784ef650ac9230c964d3094ee4f0819293` | [stellar.expert](https://stellar.expert/explorer/testnet/tx/e0ea61c51cc496f02750fb2fd8ab5a784ef650ac9230c964d3094ee4f0819293) |
| 3 XLM | `2a849bec1ed04d224f48bfad199577d83c1f6500a0e2cff5498bd509ee23e71b` | [stellar.expert](https://stellar.expert/explorer/testnet/tx/2a849bec1ed04d224f48bfad199577d83c1f6500a0e2cff5498bd509ee23e71b) |
| 3 XLM | `3070f23d8cb67b9cc5aa2670b6984993d078a4bb76be32803e09d6247ceca5c1` | [stellar.expert](https://stellar.expert/explorer/testnet/tx/3070f23d8cb67b9cc5aa2670b6984993d078a4bb76be32803e09d6247ceca5c1) |
