# Issue #34 — Full QA of Pollar docs, MCP Gateway, and AI-building experience

Diagnostic submission for [pollar-xyz/pollar-backoffice#34](https://github.com/pollar-xyz/pollar-backoffice/issues/34).

## A/B design

| Arm | Inputs | Folder |
| --- | --- | --- |
| **A** | `llms-full.txt` only | `vibecoding/arm-a-docs-only/` |
| **B** | MCP Gateway + docs | `vibecoding/arm-b-mcp/` |

Clients tested: **Cursor** (`~/.cursor/mcp.json`) and **VS Code** (`.vscode/mcp.json`, gitignored) per MCP Gateway docs. `clients/mcp-remote-connect.sh` covers stdio clients.

## Start here

1. `summary/findings.md` — headline results + acceptance mapping  
2. `matrix/test-matrix.csv` — full matrix (import to Google Sheets)  
3. `vibecoding/AB-COMPARISON.md` — A/B verdict  
4. `transcripts/live-run.md` — redacted session log  
5. `evidence/live/` — redacted MCP/API responses  

## Reproduce MCP suite (local)

```bash
cp submissions/qa-docs-mcp-issue-34/.secrets.env.example \
   submissions/qa-docs-mcp-issue-34/.secrets.env
# fill secrets, then:
python3 submissions/qa-docs-mcp-issue-34/scripts/run_mcp_suite.py
```

## Remaining for issue comment packaging

- Publish `matrix/test-matrix.csv` to a public Google Sheet  
- Record 3–5 min screen capture of MCP tools + app  
- Export IDE chat transcript if desired beyond `transcripts/live-run.md`  

No PAT/secret keys are committed. Rotate any token that was pasted into chat or `.secrets.env.example`.
