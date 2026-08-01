#!/usr/bin/env bash
# Docs: https://docs.pollar.xyz/docs/sdk-reference/mcp-gateway
# Do not commit a real PAT.
set -euo pipefail
: "${POLLAR_PAT:?Set POLLAR_PAT to your pat_… token}"
claude mcp add --transport http pollar https://mcp.api.pollar.xyz/mcp \
  --header "Authorization: Bearer ${POLLAR_PAT}"
claude mcp get pollar
