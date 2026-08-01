# QA Findings — Pollar Docs, MCP Gateway, and AI Build Experience

**Issue:** [#34](https://github.com/pollar-xyz/pollar-backoffice/issues/34)  
**Source of truth tested:** [llms-full.txt](https://docs.pollar.xyz/llms-full.txt)  
**Network:** testnet only  
**Method:** A/B comparison — **Arm A** (docs only) vs **Arm B** (docs + MCP Gateway), plus live MCP tool calls, Server API probes, and SDK surface checks.

All secrets and personal data are redacted from evidence. Full row-level results live in `matrix/test-matrix.csv`.

---

## Executive summary

Pollar’s MCP Gateway is already useful for agents: with a valid Personal Access Token it can list apps, check readiness, manage domains, enable assets, and create applications. Scope enforcement on write tools works as documented.

Three problems still stop an agent from building the Quickstart end to end without a human:

1. **`create_api_key` does not return a usable key value**, so the agent cannot finish SDK setup through MCP alone.
2. **The documented Server API host (`https://api.pollar.xyz`) does not serve the published routes** (generic 404s), so deferred wallet activation cannot be followed as written.
3. **Several docs claims disagree with the live SDK and MCP schemas** (version pins, option names, key-type enums, wallet roles), which causes agents to call APIs incorrectly and get stuck.

Docs-only agents (Arm A) fail earlier because they cannot provision an app, keys, domains, or funding without the dashboard. MCP-assisted agents (Arm B) get much further, then stall on key material and Server API docs.

---

## How we tested

| Area | What we did |
| --- | --- |
| Docs matrix | Enumerated testable claims from `llms-full.txt` into a spreadsheet-ready CSV (pass / fail / blocked / not testable). |
| MCP Gateway | Exercised all 21 live tools with a full-access PAT; repeated critical writes with a read-only PAT for 403 checks. |
| Clients | Connected **Cursor** (`~/.cursor/mcp.json`) and **VS Code** (`.vscode/mcp.json`) using only the published MCP docs; also provided an `mcp-remote` stdio bridge script. |
| Server API / SDK | Probed documented bases and headers on testnet; compared `@pollar/core` / `@pollar/react` **0.11.2** against docs that still say **0.10.1**. |
| Vibecoding A/B | Scaffolded Quickstart apps under `vibecoding/arm-a-docs-only` and `vibecoding/arm-b-mcp`, and logged where each arm stalls. |

Interactive Google OAuth and a live end-user payment still need a human in the browser; that limit is noted in the matrix rather than omitted.

---

## Blockers

These are the issues that prevent an unaided agent build today.

### 1. MCP `create_api_key` does not return the key

The tool description says the plaintext key is returned once. In practice the response has `key: null`, and `plaintext` matches `key_prefix` only (about 21 characters), not a full `pub_testnet_…` / `sec_testnet_…` credential.

**Impact:** An agent can create a key record but cannot put a working publishable key into `.env`. Quickstart setup still requires copying a key from the dashboard.

**Evidence:** `evidence/live/create_api_key_full_shape.json`

### 2. Documented Server API base URL is unreachable

Docs instruct backends to call `https://api.pollar.xyz/v1/...` with `x-pollar-api-key`. Every probed path on that host returned a generic **404 page not found**, including `POST /v1/wallets/activate`. The same activate path also 404’d on `hub.api.pollar.xyz`.

**Impact:** Deferred-flow guides that depend on wallet activation cannot be followed as written. Agents treat the 404 as “wrong URL” or invent alternatives.

**Evidence:** `evidence/live/activate-x-pollar-api-key.json`, `evidence/live/hub-activate-probes.json`

### 3. Hub authentication does not match Server API docs

`hub.api.pollar.xyz` is alive (`/health` returns 200). Listing applications succeeds with **`Authorization: Bearer <PAT>`**. The same routes reject a secret key sent as `x-pollar-api-key` (`HUB_AUTH_INVALID_TOKEN`).

**Impact:** Docs tell developers to use the secret key header for Server API work; the reachable hub surface expects a PAT instead. Agents following the docs authenticate the wrong way.

**Evidence:** live hub probes recorded under `evidence/live/`

---

## Major findings

### MCP surface vs documentation

- The docs table lists **15** tools. Live `tools/list` returns **21**. Extra tools include `whoami`, `list_api_keys`, `list_application_assets`, `list_distribution_rules`, `get_application_metrics`, and `revoke_api_key`. Agents that only read the docs miss useful tools; agents that introspect the gateway see a different product.
- **`create_api_key` type values must be `PUBLISHABLE` or `SECRET`.** Passing `publishable` (as an agent would guess from prose) returns `VALIDATION_ERROR`.
- **`fund_testnet_wallet` returns `FUND_XLM_FAILED` (hub-api 502)** even when the wallet is already funded. Docs describe this as a harmless idempotent friendbot top-up. Prefer **`ensure_wallet_funded`**, which correctly reports `already_funded` when called with role `FUNDING`.
- Role default **`GLOBAL` is wrong for split apps.** The gateway responds that GLOBAL was promoted to FUNDING and asks the client to retry with `FUNDING` / `GAS` / `DISTRIBUTION`. Docs still present GLOBAL as the default.
- An **invalid PAT still completes `initialize` and `tools/list`**. Authentication is enforced on `tools/call`. Clients can look “connected” while every real action will fail.

### SDK and React docs drift

- Docs pin `@pollar/core` and `@pollar/react` at **0.10.1**; npm latest is **0.11.2**.
- Docs describe `setTrustline(..., { sponsored? })`. The installed SDK uses `{ skipSponsorship? }`.
- Passkeys are marked **coming soon**, and `usePollarPasskey` is **not exported**, while `createSmartWallet` / `loginSmartWallet` exist on the client. That mixed status confuses agents about whether smart-wallet login is available.
- The AI feed (`llms-full.txt`) has broken headings and placeholders in places (empty `PollarProvider` title; whitespace provider id), which lowers trust and invites hallucination.

### What worked well

- With a full-access PAT, core read/write tools behaved correctly: applications, wallets, balances, transactions, users, readiness, domains, assets, distribution rules (`period: LIFETIME`), and application creation.
- A read-only PAT correctly blocked writes with a clear missing-scope message (`applications:write`).
- `ensure_wallet_funded` with role `FUNDING` is idempotent.
- SDK `GET /v1/applications/config` succeeds when the client sends `x-pollar-api-key` plus an allowlisted `Origin` (matching what `@pollar/core` does).

---

## A/B vibecoding verdict

| Step | Arm A — docs only | Arm B — docs + MCP |
| --- | --- | --- |
| Create application | Dashboard only | Works via `create_application` |
| Allow `localhost` | Dashboard only | Works via `update_application_domains` |
| Enable USDC | Dashboard only | Works via `enable_asset` |
| Fund app wallet | Dashboard / friendbot UI | `ensure_wallet_funded` (FUNDING) works; `fund_testnet_wallet` errors |
| Obtain publishable key | Dashboard copy-once | MCP creates a key record but returns no usable secret |
| Generate Quickstart UI | Possible from docs | Possible from docs |
| Send a real payment | Needs interactive OAuth | Needs interactive OAuth |

**Bottom line:** MCP removes most dashboard toil, but neither arm can finish fully unaided today. Arm A cannot provision. Arm B provisions until it needs a publishable key string or the documented Server activate endpoint.

Generated apps and stall notes:

- `vibecoding/arm-a-docs-only/`
- `vibecoding/arm-b-mcp/`
- `vibecoding/AB-COMPARISON.md`

---

## Highest-leverage fixes (for Pollar)

1. Return the full API key plaintext **once** from MCP `create_api_key` (or document a secure retrieval path agents can use).
2. Restore or correct the Server API base URL and `POST /v1/wallets/activate` so deferred-flow docs match a live endpoint; align auth docs with hub reality (PAT vs secret key).
3. Document MCP tool enums exactly (`PUBLISHABLE` / `SECRET`, distribution `period` values) and the **FUNDING** role for split apps.
4. Make `fund_testnet_wallet` truly idempotent (no 502 when already funded), or point agents exclusively at `ensure_wallet_funded`.
5. Publish the full MCP tool list (all 21) and reject invalid PATs at `initialize` / `tools/list`, not only at `tools/call`.
6. Sync SDK docs to **0.11.2** (or current), fix `setTrustline` option names, and clarify passkey / smart-wallet availability.

---

## Deliverable checklist

| Deliverable | Status |
| --- | --- |
| Test matrix covering `llms-full.txt` | Done — `matrix/test-matrix.csv` |
| Not-testable rows include a reason | Done |
| MCP connected in two clients from docs only | Done — Cursor + VS Code (`mcp-remote` script included) |
| Every documented MCP tool tested, including negatives | Done |
| Vibecoding stalls documented | Done |
| Failures include severity and evidence | Done in matrix |
| Generated apps + session transcript | Done — `vibecoding/`, `transcripts/live-run.md` |
| Secrets absent from public artifacts | Done |
| Public Google Sheet link | Pending (import the CSV) |
| 3–5 minute screen recording | Pending (manual capture) |

---

## Where to look next

- Matrix: `matrix/test-matrix.csv`
- Redacted evidence: `evidence/` and `evidence/live/`
- Session log: `transcripts/live-run.md`
- A/B notes: `vibecoding/AB-COMPARISON.md`
