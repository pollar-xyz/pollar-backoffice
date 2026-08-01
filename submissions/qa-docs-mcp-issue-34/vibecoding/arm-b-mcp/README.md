# Vibecoding Arm B — MCP + docs

Agent connected to Pollar MCP Gateway + llms-full.txt.

Provisioning performed via MCP (see evidence/live): `create_application`,
`update_application_domains`, `check_application_readiness`, `enable_asset`,
`ensure_wallet_funded` (FUNDING role).

## Run

```bash
npm install
npm run dev
```

## Notes

See `NOTES.md` for stalls unique to the MCP path.
