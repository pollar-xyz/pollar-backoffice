# create-pollar-app-patrickkish

CLI scaffold for a ready-to-run **Next.js 16** app with [**Pollar**](https://docs.pollar.xyz) wallet pre-wired — login, balance, assets, send, receive, and transaction history via the official SDK.

Closes [pollar-backoffice#2](https://github.com/pollar-xyz/pollar-backoffice/issues/2).

## Links

| Resource | URL |
|----------|-----|
| **npm package** | https://www.npmjs.com/package/create-pollar-app-patrickkish |
| **Source repo** | https://github.com/PatrickKish1/create-pollar-app-patrickkish |
| **Pollar docs** | https://docs.pollar.xyz |
| **API key (testnet)** | https://dashboard.pollar.xyz |

## Quick start

```bash
npx create-pollar-app-patrickkish@latest my-pollar-app
cd my-pollar-app
# edit .env.local — set NEXT_PUBLIC_POLLAR_API_KEY=pub_testnet_...
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, and use the home screen actions (balance, assets, send USDC, receive, history).

Non-interactive:

```bash
npx create-pollar-app-patrickkish@latest my-pollar-app --yes --pm npm --network testnet
```

## What the generated app includes

- **Next.js 16** App Router, **React 19**, TypeScript, **Tailwind 4**
- `@pollar/core@^0.9.0` and `@pollar/react@^0.9.0`
- `PollarProvider` reading `NEXT_PUBLIC_POLLAR_API_KEY` and `NEXT_PUBLIC_POLLAR_NETWORK`
- Login via Pollar's hosted modal: **Google**, **email OTP**, passkey, and external wallets (Freighter, Albedo, etc.)
- Home screen wired to SDK modals: balance, assets, send (USDC example), receive, history
- `.env.example`, eslint, prettier, README with Deploy to Vercel button

No backend and no secret keys — client-side only.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_POLLAR_API_KEY` | Yes | Publishable key from [dashboard.pollar.xyz](https://dashboard.pollar.xyz) (`pub_testnet_...`) |
| `NEXT_PUBLIC_POLLAR_NETWORK` | No | `testnet` (default) or `mainnet` |

## Dashboard setup (required for login)

1. Create a publishable API key at **dashboard.pollar.xyz → Configuration → API Keys**.
2. Add **http://localhost:3000** to allowed origins (use `localhost`, not `127.0.0.1`).
3. Enable **Google** and **email** login providers in the dashboard if you want them in the modal.
4. Restart the dev server after changing `.env.local`.

## CLI flags

| Flag | Description |
|------|-------------|
| `--yes` / `-y` | Skip prompts (detected package manager + testnet) |
| `--pm <npm\|pnpm\|yarn\|bun>` | Package manager for the new app |
| `--network <testnet\|mainnet>` | Written to `.env.local` as `NEXT_PUBLIC_POLLAR_NETWORK` |

## Acceptance criteria (issue #2)

- [x] `npx create-pollar-app-patrickkish` scaffolds and installs without errors
- [x] Generated app runs with `npm run dev` after setting only `NEXT_PUBLIC_POLLAR_API_KEY`
- [x] Login works (Google, email OTP, external wallets via Pollar modal)
- [x] SDK native components for send, receive, history, balance, and assets
- [x] Send USDC example on testnet
- [x] Optional `--yes`, `--pm`, `--network` flags
- [x] Pins Next 16, React 19, `@pollar/core@^0.9.0`, `@pollar/react@^0.9.0`
- [x] No unnecessary dependencies beyond the SDK stack
- [x] README with 3-step setup and Deploy to Vercel button
- [ ] Demo video attached to this PR *(add your recording link below)*

## Demo video

<!-- Replace with your screen recording URL before merge -->
_Add a link to your screen recording here (login + testnet USDC send)._

## Develop the CLI locally

```bash
git clone https://github.com/PatrickKish1/create-pollar-app-patrickkish.git
cd create-pollar-app-patrickkish
pnpm install
node bin/index.js my-test-app --yes --pm pnpm
```

## License

MIT — see the [package repo](https://github.com/PatrickKish1/create-pollar-app-patrickkish).
