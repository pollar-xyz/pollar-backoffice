# pollar-backoffice

A [Pollar](https://docs.pollar.xyz) wallet built with Next.js. Users log in with their Pollar wallet (Google, GitHub, email OTP, external wallets and passkey) and, once inside, can view their balance, send and receive money on Stellar.

Repo: https://github.com/pollar-xyz/pollar-backoffice

## Requirements

- Node.js 18+
- A Pollar **publishable key** — generate it at [dashboard.pollar.xyz](https://dashboard.pollar.xyz) → Configuration → API Keys → Generate.

## Environment variables

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | Yes | Pollar publishable key (`pub_testnet_...` or `pub_mainnet_...`). Safe to expose on the client. |
| `NEXT_PUBLIC_POLLAR_NETWORK` | No | Stellar network: `testnet` (default) or `mainnet`. |

> The **secret** key (`sec_...`) is NOT used: this app is fully client-side. Never put it in a `NEXT_PUBLIC_` variable.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [`@pollar/react`](https://www.npmjs.com/package/@pollar/react) / [`@pollar/core`](https://www.npmjs.com/package/@pollar/core) — Pollar SDK
- `qrcode.react` — QR code for receiving payments

## React Native Package

The mobile counterpart lives in a separate repo:
[**d3vobed/pollar-react-native-d3vobed**](https://github.com/d3vobed/pollar-react-native-d3vobed)

It provides `PollarProvider`, `usePollar()`, and `EmailLogin` for React Native (Expo and bare RN), built on `@pollar/core`'s NobleKeyManager and storage adapters. See the repo for usage and an Expo demo app.

## Structure

```
app/
  providers.tsx              # PollarProvider + config (key, network, login options)
  page.tsx                   # login or dashboard depending on the session
  components/
    LoginScreen.tsx          # login screen
    WalletDashboard.tsx      # header + tabs
    BalanceTab.tsx           # balance
    SendTab.tsx              # send
    ReceiveTab.tsx           # receive (address + QR)
```
