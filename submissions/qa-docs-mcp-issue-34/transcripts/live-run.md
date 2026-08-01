# Live QA session transcript (redacted)

Issue: https://github.com/pollar-xyz/pollar-backoffice/issues/34  
Branch: `qa/issue-34-docs-mcp-ab-test`  
Mode: A/B (Arm A docs-only vs Arm B MCP+docs)  
Clients: Cursor HTTP MCP + VS Code `.vscode/mcp.json`

## Setup

1. Loaded credentials from local gitignored `.secrets.env` (PATs were double-pasted in the example file; deduped to 68-char `pat_…` values; example restored to placeholders).
2. Configured Cursor `~/.cursor/mcp.json` with Pollar HTTP gateway.
3. Configured gitignored `.vscode/mcp.json` as second client per docs; added `clients/mcp-remote-connect.sh`.

## MCP tool execution (Arm B / raw HTTP client)

Automated suite: `scripts/run_mcp_suite.py` + follow-up probes.

- `initialize` / `tools/list` → 21 tools.
- Reads: `whoami`, `list_applications`, `get_application`, wallets, balances, txs, users, metrics, api keys, assets, distribution rules, readiness — **pass**.
- Writes: `update_application_domains`, `enable_asset`, `create_application`, `create_distribution_rule` (period `LIFETIME`) — **pass**.
- `create_api_key` with `publishable` — **fail** VALIDATION_ERROR; with `PUBLISHABLE` — creates row but **no usable plaintext**.
- `fund_testnet_wallet` — **fail** `FUND_XLM_FAILED` 502.
- `ensure_wallet_funded` GLOBAL — no-op hint; FUNDING — **pass** idempotent.
- Readonly PAT write attempts — **pass** (scope error as expected).

## Server API / SDK

- `api.pollar.xyz` — all probed routes **404**.
- `hub.api.pollar.xyz/health` — 200; `/v1/applications` with PAT Bearer — 200; with secret `x-pollar-api-key` — 401.
- `POST …/wallets/activate` — **404** on documented and hub paths.
- SDK config with `x-pollar-api-key` + `Origin: http://localhost:3000` — **200**.

## Vibecoding

- Arm A scaffold: `vibecoding/arm-a-docs-only` (Quickstart from docs).
- Arm B scaffold: `vibecoding/arm-b-mcp` (MCP-provisioned app + docs code).
- Interactive Google OAuth + live payment **not** completed in this automated session (requires human in browser).

## Artifacts

- Matrix: `matrix/test-matrix.csv`
- Evidence: `evidence/` and `evidence/live/` (redacted)
- Comparison: `vibecoding/AB-COMPARISON.md`
- Findings: `summary/findings.md`
