## Summary

Closes #34.

Full QA of Pollar’s AI-facing docs (`llms-full.txt`), MCP Gateway, and vibecoding path — run on testnet with an A/B design:

- **Arm A:** docs only (`llms-full.txt`, no MCP)
- **Arm B:** docs + MCP Gateway (Cursor + VS Code clients configured from the published docs)

### Deliverables in this PR

| Artifact | Path |
| --- | --- |
| Findings report | `submissions/qa-docs-mcp-issue-34/summary/findings.md` |
| Test matrix (Sheet-ready CSV) | `submissions/qa-docs-mcp-issue-34/matrix/test-matrix.csv` |
| Redacted evidence | `submissions/qa-docs-mcp-issue-34/evidence/` |
| Vibecoding Arm A / Arm B apps + comparison | `submissions/qa-docs-mcp-issue-34/vibecoding/` |
| Session transcript | `submissions/qa-docs-mcp-issue-34/transcripts/live-run.md` |
| Reproduce scripts / client examples | `submissions/qa-docs-mcp-issue-34/scripts/`, `clients/` |

### Headline findings

1. **Blocker:** MCP `create_api_key` does not return a usable plaintext key (`key: null`; `plaintext` ≈ prefix only) — agents cannot finish Quickstart via MCP alone.
2. **Blocker:** Documented Server API host `https://api.pollar.xyz` returns generic 404s (including `POST /v1/wallets/activate`); deferred-flow docs are not followable as written.
3. **Blocker / major:** Hub auth reality differs from Server API docs (reachable hub accepts PAT Bearer; rejects `x-pollar-api-key` secret).
4. Docs list **15** MCP tools; live gateway exposes **21** (e.g. `whoami`, `list_api_keys`, `revoke_api_key`).
5. `create_api_key` requires `PUBLISHABLE`/`SECRET` (lowercase `publishable` → `VALIDATION_ERROR`).
6. `fund_testnet_wallet` returns `FUND_XLM_FAILED` (502) even when already funded; `ensure_wallet_funded` with role `FUNDING` is the working idempotent path.
7. SDK docs pin **0.10.1**; npm is **0.11.2**. `setTrustline` docs say `sponsored?`; SDK uses `skipSponsorship?`.

Scope negatives (readonly PAT → missing `applications:write`) behave as documented. Secrets are gitignored/redacted.

### Still pending outside this PR (issue comment packaging)

- Public Google Sheet link (import the CSV)
- 3–5 minute screen recording of MCP + app

## Test plan

- [ ] Open `summary/findings.md` and skim blockers + A/B verdict
- [ ] Import `matrix/test-matrix.csv` and confirm columns/results look complete
- [ ] Spot-check redacted evidence under `evidence/live/` (no PAT/secret plaintext)
- [ ] Confirm `.secrets.env` / `.vscode/mcp.json` are not in the commit
- [ ] Optional: copy `.secrets.env.example` → `.secrets.env` and run `python3 submissions/qa-docs-mcp-issue-34/scripts/run_mcp_suite.py`
- [ ] Optional: `cd vibecoding/arm-a-docs-only && npm install && npx tsc --noEmit`
