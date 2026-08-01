# A/B comparison — vibecoding

| Metric | Arm A (docs only) | Arm B (MCP + docs) |
| --- | --- | --- |
| Create app | Human dashboard | MCP `create_application` ✅ |
| Allow localhost | Human dashboard | MCP `update_application_domains` ✅ |
| Enable USDC | Human dashboard | MCP `enable_asset` ✅ |
| Fund app wallet | Human / friendbot UI | `ensure_wallet_funded` ✅ (FUNDING); `fund_testnet_wallet` ❌ 502 |
| Obtain publishable key | Human dashboard copy | MCP `create_api_key` ❌ no plaintext |
| Generate Quickstart UI | From docs ✅ | From docs ✅ |
| Send payment E2E | Needs OAuth (manual) | Needs OAuth (manual) |
| Hallucination risk | High on truncated issuers / activate URL | Lower for provisioning; still high on key type case + activate URL |

## Honest read

MCP removes most dashboard toil for agents, but **cannot finish unaided** today because new API keys are not returned in plaintext and `api.pollar.xyz` Server API routes 404 as documented. Docs-only agents are blocked even earlier (no provisioning). Highest-leverage fixes: return key plaintext once from `create_api_key`, fix Server API base URL, document `PUBLISHABLE`/`SECRET` enums and split-wallet `FUNDING` role, and make `fund_testnet_wallet` idempotent without 502 when already funded.
