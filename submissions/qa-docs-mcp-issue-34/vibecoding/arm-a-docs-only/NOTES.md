# Arm A — docs-only agent session notes

Constraint: feed only llms-full.txt; no MCP tools.

## Stalls / hallucinations

1. **SDK version pin** — docs say 0.10.1; npm installs 0.11.2. Agent may pin an outdated version or assume APIs from 0.10.1.
2. **USDC issuer truncated** — Quickstart shows `issuer: 'GA5Z...'`. Agent cannot complete a real USDC payment without looking up the full issuer (dashboard assets / elsewhere). Used native XLM in generated sample to avoid inventing an issuer.
3. **Server activate URL** — Deferred-flow docs point at `https://api.pollar.xyz/v1/wallets/activate`, which 404s. An agent adding deferred activate will get stuck.
4. **Broken PollarProvider heading** in llms-full (`\` \``) — cosmetic but reduces trust in the AI feed.
5. **setTrustline sponsored vs skipSponsorship** — if agent enables assets programmatically from docs tables, wrong option name.
6. **No MCP** — agent cannot create app, keys, domains, or fund wallets from chat; human must pre-provision dashboard. This is the main unaided-build gap vs Arm B.

## Outcome

- App compiles against `@pollar/react@^0.11.2` Quickstart shape (`PollarProvider`, `usePollar`, `login`, `runTx`, `openTxHistoryModal`).
- End-to-end payment still requires interactive OAuth login in the browser (not automatable here without user).
