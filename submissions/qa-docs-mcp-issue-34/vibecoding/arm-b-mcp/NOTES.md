# Arm B — MCP + docs agent session notes

Constraint: MCP Gateway connected + llms-full.txt.

## What MCP unblocked vs Arm A

1. `list_applications` / `whoami` / `check_application_readiness` — agent orients without dashboard clicking.
2. `update_application_domains` — can add `http://localhost:3000` (raw HTTP executes immediately; Cursor should confirm via annotations).
3. `enable_asset` — USDC enabled without dashboard UI.
4. `ensure_wallet_funded` with role `FUNDING` — works once agent discovers GLOBAL was split (docs default GLOBAL is misleading for split apps).
5. `create_application` — spawned `qa-ab-arm-b-*` app for isolation.

## Stalls / hallucinations on MCP path

1. **`create_api_key` docs say `type?` like `publishable`; schema requires `PUBLISHABLE`/`SECRET`.** Lowercase → VALIDATION_ERROR.
2. **`create_api_key` returns `key: null` and `plaintext` equal to `key_prefix` only** — agent cannot obtain a usable publishable/secret string from MCP. Must fall back to dashboard copy-once UI. **Blocker for unaided build.**
3. **`fund_testnet_wallet` → FUND_XLM_FAILED (502)** even when `ensure_wallet_funded` reports funded — docs claim harmless idempotent friendbot top-up; actual error confuses agents.
4. **Undocumented tools** (`whoami`, `list_api_keys`, …) appear in tools/list — agents that only read docs miss them; agents that introspect discover them.
5. **Docs Server API base `api.pollar.xyz` is entirely 404**; hub-api health lives at `hub.api.pollar.xyz`. Deferred activate path broken as documented.
6. **Invalid PAT still lists tools** — false “connected” confidence.

## Outcome

- Provisioning mostly works via MCP except retrieving new API key plaintext.
- App code still depends on a human-copied publishable key from dashboard.
- Interactive login/payment not completed in this automated run (requires browser Google OAuth).
