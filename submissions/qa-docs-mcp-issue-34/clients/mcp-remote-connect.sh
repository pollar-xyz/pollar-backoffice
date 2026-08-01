#!/usr/bin/env bash
# Docs stdio bridge via mcp-remote. Do not commit a real PAT.
set -euo pipefail
: "${POLLAR_PAT:?Set POLLAR_PAT}"
echo "Starting mcp-remote bridge to https://mcp.api.pollar.xyz/mcp"
exec npx -y mcp-remote "https://mcp.api.pollar.xyz/mcp" --header "Authorization: Bearer ${POLLAR_PAT}"
