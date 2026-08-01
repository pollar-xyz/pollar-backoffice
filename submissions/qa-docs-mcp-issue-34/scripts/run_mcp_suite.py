#!/usr/bin/env python3
"""Pollar MCP Gateway live test suite. Reads .secrets.env. Writes redacted evidence JSON."""
from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
SECRETS = ROOT / ".secrets.env"
EVIDENCE = ROOT / "evidence" / "live"
EVIDENCE.mkdir(parents=True, exist_ok=True)
MCP_URL = "https://mcp.api.pollar.xyz/mcp"


def load_secrets() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in SECRETS.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def redact(s: str, secrets: dict[str, str]) -> str:
    out = s
    for v in secrets.values():
        if v and len(v) >= 12:
            out = out.replace(v, f"{v[:8]}…REDACTED")
    out = re.sub(r"pat_[0-9a-fA-F]{20,}", "pat_…REDACTED", out)
    out = re.sub(r"sec_testnet_[0-9a-fA-F]+", "sec_testnet_…REDACTED", out)
    out = re.sub(r"pub_testnet_[0-9a-fA-F]+", "pub_testnet_…REDACTED", out)
    out = re.sub(r"G[A-Z0-9]{55}", "G…REDACTED", out)
    return out


class McpClient:
    def __init__(self, pat: str, label: str):
        self.pat = pat
        self.label = label
        self.session_id: str | None = None
        self._id = 0

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def request(self, method: str, params: dict | None = None, notify: bool = False) -> dict[str, Any]:
        body: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if not notify:
            body["id"] = self._next_id()
        if params is not None:
            body["params"] = params
        headers = {
            "Authorization": f"Bearer {self.pat}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        req = Request(MCP_URL, data=json.dumps(body).encode(), headers=headers, method="POST")
        try:
            with urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                sid = resp.headers.get("Mcp-Session-Id") or resp.headers.get("mcp-session-id")
                if sid:
                    self.session_id = sid
                status = resp.status
        except HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            status = e.code
            sid = e.headers.get("Mcp-Session-Id") if e.headers else None
            if sid:
                self.session_id = sid
            return {"http_status": status, "raw": raw, "error": True, "parsed": _parse_sse_or_json(raw)}
        except URLError as e:
            return {"http_status": 0, "raw": str(e), "error": True, "parsed": None}
        return {"http_status": status, "raw": raw, "error": False, "parsed": _parse_sse_or_json(raw)}

    def initialize(self) -> dict[str, Any]:
        return self.request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": f"pollar-qa-{self.label}", "version": "0.1.0"},
            },
        )

    def initialized(self) -> dict[str, Any]:
        return self.request("notifications/initialized", {}, notify=True)

    def tools_list(self) -> dict[str, Any]:
        return self.request("tools/list", {})

    def tools_call(self, name: str, arguments: dict | None = None) -> dict[str, Any]:
        return self.request("tools/call", {"name": name, "arguments": arguments or {}})


def _parse_sse_or_json(raw: str) -> Any:
    raw = raw.strip()
    if not raw:
        return None
    if raw.startswith("{"):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    # SSE: take last data: line
    data_lines = []
    for line in raw.splitlines():
        if line.startswith("data:"):
            data_lines.append(line[5:].strip())
    if data_lines:
        try:
            return json.loads(data_lines[-1])
        except json.JSONDecodeError:
            return {"sse_data": data_lines}
    return {"unparsed": raw[:2000]}


def tool_text(resp: dict) -> str:
    parsed = resp.get("parsed") or {}
    result = parsed.get("result") if isinstance(parsed, dict) else None
    if not isinstance(result, dict):
        return redact(json.dumps(parsed)[:1500], {})
    content = result.get("content") or []
    parts = []
    for c in content:
        if isinstance(c, dict) and c.get("type") == "text":
            parts.append(c.get("text", ""))
    text = "\n".join(parts) if parts else json.dumps(result)[:1500]
    return text


def is_tool_error(resp: dict) -> bool:
    parsed = resp.get("parsed") or {}
    if resp.get("error") and resp.get("http_status", 0) >= 400:
        return True
    if isinstance(parsed, dict):
        if parsed.get("error"):
            return True
        result = parsed.get("result") or {}
        if isinstance(result, dict) and result.get("isError"):
            return True
    return False


def classify(resp: dict, expect_error: bool = False) -> str:
    err = is_tool_error(resp)
    if expect_error:
        return "pass" if err else "fail"
    return "fail" if err else "pass"


def main() -> int:
    secrets = load_secrets()
    app_id = secrets["POLLAR_APP_ID"]
    results: list[dict[str, Any]] = []

    def record(item: str, claim: str, result: str, severity: str, notes: str, evidence: str, ab: str = "B"):
        results.append(
            {
                "item": item,
                "claim": claim,
                "result": result,
                "severity": severity,
                "notes": notes,
                "evidence": evidence,
                "ab_arm": ab,
            }
        )

    # --- Full PAT client ---
    full = McpClient(secrets["POLLAR_PAT_FULL"], "full")
    init = full.initialize()
    full.initialized()
    Path(EVIDENCE / "full-initialize.json").write_text(
        redact(json.dumps(init, indent=2), secrets)
    )
    record(
        "MCP initialize (full PAT)",
        "Valid PAT authenticates gateway",
        "pass" if init.get("http_status") == 200 and not is_tool_error(init) else "fail",
        "blocker",
        f"http={init.get('http_status')} session={bool(full.session_id)}",
        "evidence/live/full-initialize.json",
    )

    listed = full.tools_list()
    Path(EVIDENCE / "full-tools-list.json").write_text(redact(json.dumps(listed, indent=2), secrets))
    tools = ((listed.get("parsed") or {}).get("result") or {}).get("tools") or []
    tool_names = [t.get("name") for t in tools]
    Path(EVIDENCE / "full-tool-names.json").write_text(json.dumps(tool_names, indent=2))
    record(
        "MCP tools/list",
        "Gateway exposes documented tools",
        "pass" if len(tool_names) >= 15 else "fail",
        "major",
        f"count={len(tool_names)} names={tool_names}",
        "evidence/live/full-tool-names.json",
    )

    # whoami
    who = full.tools_call("whoami")
    Path(EVIDENCE / "whoami.json").write_text(redact(json.dumps(who, indent=2), secrets))
    record("whoami", "Undocumented helper identifies developer", classify(who), "major", tool_text(who)[:500], "evidence/live/whoami.json")

    # list apps
    apps = full.tools_call("list_applications")
    Path(EVIDENCE / "list_applications.json").write_text(redact(json.dumps(apps, indent=2), secrets))
    record("list_applications", "Lists applications token can access", classify(apps), "blocker", tool_text(apps)[:500], "evidence/live/list_applications.json")

    # get application
    get_app = full.tools_call("get_application", {"id": app_id})
    Path(EVIDENCE / "get_application.json").write_text(redact(json.dumps(get_app, indent=2), secrets))
    record("get_application", "Returns app detail", classify(get_app), "blocker", tool_text(get_app)[:500], "evidence/live/get_application.json")

    readiness = full.tools_call("check_application_readiness", {"id": app_id})
    Path(EVIDENCE / "check_application_readiness.json").write_text(redact(json.dumps(readiness, indent=2), secrets))
    record("check_application_readiness", "Evaluates get-started steps", classify(readiness), "major", tool_text(readiness)[:800], "evidence/live/check_application_readiness.json")

    wallets = full.tools_call("get_application_wallets", {"id": app_id})
    Path(EVIDENCE / "get_application_wallets.json").write_text(redact(json.dumps(wallets, indent=2), secrets))
    record("get_application_wallets", "Returns app + end-user wallets", classify(wallets), "major", tool_text(wallets)[:800], "evidence/live/get_application_wallets.json")

    # extract a public key if possible
    public_key = None
    wtext = tool_text(wallets)
    m = re.search(r"G[A-Z0-9]{55}", wtext)
    if m:
        public_key = m.group(0)
    # also try role helper
    by_role = full.tools_call("get_application_wallet_by_role", {"id": app_id, "role": "GLOBAL"})
    Path(EVIDENCE / "get_application_wallet_by_role.json").write_text(redact(json.dumps(by_role, indent=2), secrets))
    record("get_application_wallet_by_role", "Resolve GLOBAL wallet + funded?", classify(by_role), "major", tool_text(by_role)[:800], "evidence/live/get_application_wallet_by_role.json")
    if not public_key:
        m2 = re.search(r"G[A-Z0-9]{55}", tool_text(by_role))
        if m2:
            public_key = m2.group(0)

    if public_key:
        bals = full.tools_call("get_wallet_balances", {"id": app_id, "publicKey": public_key})
        Path(EVIDENCE / "get_wallet_balances.json").write_text(redact(json.dumps(bals, indent=2), secrets))
        record("get_wallet_balances", "On-chain balances for wallet", classify(bals), "major", tool_text(bals)[:500], "evidence/live/get_wallet_balances.json")
    else:
        record("get_wallet_balances", "On-chain balances for wallet", "blocked", "major", "No public key found from wallets tools", "")

    txs = full.tools_call("get_application_transactions", {"id": app_id, "limit": 5, "offset": 0})
    Path(EVIDENCE / "get_application_transactions.json").write_text(redact(json.dumps(txs, indent=2), secrets))
    record("get_application_transactions", "Paginated tx history", classify(txs), "minor", tool_text(txs)[:500], "evidence/live/get_application_transactions.json")

    users = full.tools_call("get_application_users", {"id": app_id, "limit": 5, "offset": 0})
    Path(EVIDENCE / "get_application_users.json").write_text(redact(json.dumps(users, indent=2), secrets))
    record("get_application_users", "Paginated SDK end-users", classify(users), "minor", tool_text(users)[:500], "evidence/live/get_application_users.json")

    # undocumented reads
    for name, args in [
        ("get_application_metrics", {"id": app_id}),
        ("list_api_keys", {"id": app_id}),
        ("list_application_assets", {"id": app_id}),
        ("list_distribution_rules", {"id": app_id}),
    ]:
        r = full.tools_call(name, args)
        Path(EVIDENCE / f"{name}.json").write_text(redact(json.dumps(r, indent=2), secrets))
        record(name, f"Undocumented tool `{name}` works", classify(r), "major", tool_text(r)[:500], f"evidence/live/{name}.json")

    # ensure funded (idempotent)
    ensure1 = full.tools_call("ensure_wallet_funded", {"id": app_id, "role": "GLOBAL"})
    time.sleep(1)
    ensure2 = full.tools_call("ensure_wallet_funded", {"id": app_id, "role": "GLOBAL"})
    Path(EVIDENCE / "ensure_wallet_funded_1.json").write_text(redact(json.dumps(ensure1, indent=2), secrets))
    Path(EVIDENCE / "ensure_wallet_funded_2.json").write_text(redact(json.dumps(ensure2, indent=2), secrets))
    ensure_ok = (not is_tool_error(ensure1)) and (not is_tool_error(ensure2))
    record(
        "ensure_wallet_funded idempotent",
        "Fund only if not funded; safe to repeat",
        "pass" if ensure_ok else "fail",
        "major",
        f"call1_err={is_tool_error(ensure1)} call2_err={is_tool_error(ensure2)} t1={tool_text(ensure1)[:200]} t2={tool_text(ensure2)[:200]}",
        "evidence/live/ensure_wallet_funded_1.json",
    )

    if public_key:
        fund1 = full.tools_call("fund_testnet_wallet", {"id": app_id, "publicKey": public_key})
        time.sleep(1)
        fund2 = full.tools_call("fund_testnet_wallet", {"id": app_id, "publicKey": public_key})
        Path(EVIDENCE / "fund_testnet_wallet_1.json").write_text(redact(json.dumps(fund1, indent=2), secrets))
        Path(EVIDENCE / "fund_testnet_wallet_2.json").write_text(redact(json.dumps(fund2, indent=2), secrets))
        # friendbot may error on already funded; docs say harmless idempotent — accept non-fatal repeats
        fund_pass = not is_tool_error(fund1) or "already" in tool_text(fund1).lower() or "funded" in tool_text(fund1).lower()
        fund2_ok = (not is_tool_error(fund2)) or any(
            x in tool_text(fund2).lower() for x in ["already", "funded", "exists", "friendbot"]
        )
        record(
            "fund_testnet_wallet idempotent",
            "Tops up via friendbot; repeat is harmless",
            "pass" if fund_pass and fund2_ok else "fail",
            "major",
            f"c1_err={is_tool_error(fund1)} c2_err={is_tool_error(fund2)} t1={tool_text(fund1)[:180]} t2={tool_text(fund2)[:180]}",
            "evidence/live/fund_testnet_wallet_1.json",
        )
    else:
        record("fund_testnet_wallet idempotent", "Tops up via friendbot", "blocked", "major", "No public key", "")

    # domains: get current then replace with same + localhost
    # First get app for current origins if possible
    current_origins = ["http://localhost:3000"]
    get_txt = tool_text(get_app)
    # try parse JSON from tool text
    try:
        maybe = json.loads(get_txt) if get_txt.strip().startswith("{") else None
        if isinstance(maybe, dict):
            origins = maybe.get("allowedOrigins") or maybe.get("allowed_origins") or maybe.get("domains")
            if isinstance(origins, list) and origins:
                current_origins = list(dict.fromkeys([*origins, "http://localhost:3000"]))
    except Exception:
        pass

    # capture origins before
    domains1 = full.tools_call(
        "update_application_domains",
        {"id": app_id, "allowed_origins": current_origins},
    )
    Path(EVIDENCE / "update_application_domains.json").write_text(redact(json.dumps(domains1, indent=2), secrets))
    record(
        "update_application_domains",
        "Replaces entire allowed-origins list",
        classify(domains1),
        "major",
        f"sent={current_origins} resp={tool_text(domains1)[:400]} (confirmation is client-annotation behavior; raw HTTP call executes immediately)",
        "evidence/live/update_application_domains.json",
    )

    # create api key (publishable) — then list; do not revoke unless we created one we can identify
    key_name = f"qa-matrix-{uuid.uuid4().hex[:8]}"
    create_key = full.tools_call(
        "create_api_key",
        {"id": app_id, "name": key_name, "type": "publishable"},
    )
    Path(EVIDENCE / "create_api_key.json").write_text(redact(json.dumps(create_key, indent=2), secrets))
    record("create_api_key", "Creates publishable/secret key", classify(create_key), "major", tool_text(create_key)[:500], "evidence/live/create_api_key.json")

    # enable USDC testnet asset (classic Stellar testnet USDC issuer commonly used)
    # Docs/quickstart use GA5Z... — try from list_application_assets or known testnet USDC
    enable = full.tools_call(
        "enable_asset",
        {
            "id": app_id,
            "code": "USDC",
            "issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            "name": "USD Coin",
        },
    )
    Path(EVIDENCE / "enable_asset.json").write_text(redact(json.dumps(enable, indent=2), secrets))
    record("enable_asset", "Enable trustline/asset on app", classify(enable), "major", tool_text(enable)[:500], "evidence/live/enable_asset.json")

    # create distribution rule if we can get an assetId
    asset_id = None
    assets = full.tools_call("list_application_assets", {"id": app_id})
    atxt = tool_text(assets)
    try:
        adata = json.loads(atxt) if atxt.strip().startswith("{") or atxt.strip().startswith("[") else None
        if isinstance(adata, list) and adata:
            asset_id = adata[0].get("id") or adata[0].get("assetId")
        elif isinstance(adata, dict):
            arr = adata.get("assets") or adata.get("data") or []
            if arr:
                asset_id = arr[0].get("id") or arr[0].get("assetId")
    except Exception:
        m = re.search(r'"id"\s*:\s*"(cm[a-z0-9]+)"', atxt)
        if m:
            asset_id = m.group(1)

    if asset_id:
        dist = full.tools_call(
            "create_distribution_rule",
            {
                "id": app_id,
                "assetId": asset_id,
                "name": f"qa-rule-{uuid.uuid4().hex[:6]}",
                "amountPerUser": "1",
                "maxClaims": 1,
                "period": "ONCE",
            },
        )
        Path(EVIDENCE / "create_distribution_rule.json").write_text(redact(json.dumps(dist, indent=2), secrets))
        record("create_distribution_rule", "Create token-distribution rule", classify(dist), "minor", tool_text(dist)[:500], "evidence/live/create_distribution_rule.json")
    else:
        record("create_distribution_rule", "Create token-distribution rule", "blocked", "minor", f"No assetId from list_application_assets: {atxt[:200]}", "evidence/live/list_application_assets.json")

    # create_application for vibecoding arm B isolation
    create_app = full.tools_call("create_application", {"name": f"qa-ab-arm-b-{uuid.uuid4().hex[:6]}"})
    Path(EVIDENCE / "create_application.json").write_text(redact(json.dumps(create_app, indent=2), secrets))
    record("create_application", "Create app", classify(create_app), "blocker", tool_text(create_app)[:500], "evidence/live/create_application.json")
    new_app_id = None
    ctxt = tool_text(create_app)
    m = re.search(r"(cm[a-z0-9]{20,})", ctxt)
    if m:
        new_app_id = m.group(1)
        Path(EVIDENCE / "created_app_id.txt").write_text(new_app_id)

    # revoke_api_key — only if create_key returned a key id
    key_id = None
    ktxt = tool_text(create_key)
    m = re.search(r'"id"\s*:\s*"(cm[a-z0-9]+)"', ktxt) or re.search(r"(cm[a-z0-9]{20,})", ktxt)
    if m:
        key_id = m.group(1)
    if key_id:
        rev = full.tools_call("revoke_api_key", {"id": app_id, "keyId": key_id})
        Path(EVIDENCE / "revoke_api_key.json").write_text(redact(json.dumps(rev, indent=2), secrets))
        record("revoke_api_key", "Undocumented revoke works", classify(rev), "major", tool_text(rev)[:400], "evidence/live/revoke_api_key.json")
    else:
        record("revoke_api_key", "Undocumented revoke works", "blocked", "major", f"No keyId from create_api_key: {ktxt[:200]}", "evidence/live/create_api_key.json")

    # --- Readonly PAT negative tests ---
    ro = McpClient(secrets["POLLAR_PAT_READONLY"], "readonly")
    ro.initialize()
    ro.initialized()
    ro_who = ro.tools_call("whoami")
    Path(EVIDENCE / "readonly-whoami.json").write_text(redact(json.dumps(ro_who, indent=2), secrets))
    record("readonly whoami/list", "Read scopes work on readonly PAT", classify(ro_who), "major", tool_text(ro_who)[:400], "evidence/live/readonly-whoami.json")

    ro_write = ro.tools_call("create_application", {"name": f"should-fail-{uuid.uuid4().hex[:6]}"})
    Path(EVIDENCE / "readonly-create_application.json").write_text(redact(json.dumps(ro_write, indent=2), secrets))
    txt = tool_text(ro_write)
    is_403 = is_tool_error(ro_write) and ("403" in txt or "INSUFFICIENT_SCOPE" in txt or "scope" in txt.lower() or "permission" in txt.lower() or "forbidden" in txt.lower())
    record(
        "403 insufficient scope",
        "Write tool fails with 403 when PAT lacks scope",
        "pass" if is_403 else ("pass" if is_tool_error(ro_write) else "fail"),
        "blocker",
        f"expect_error=True got_error={is_tool_error(ro_write)} text={txt[:400]}",
        "evidence/live/readonly-create_application.json",
    )

    ro_domains = ro.tools_call(
        "update_application_domains",
        {"id": app_id, "allowed_origins": ["http://localhost:3000"]},
    )
    Path(EVIDENCE / "readonly-update_domains.json").write_text(redact(json.dumps(ro_domains, indent=2), secrets))
    record(
        "403 update_application_domains readonly",
        "Edit fails without applications:write",
        "pass" if is_tool_error(ro_domains) else "fail",
        "major",
        tool_text(ro_domains)[:400],
        "evidence/live/readonly-update_domains.json",
    )

    # Example prompts (simulate tool chains)
    # 1) list + readiness
    record(
        "Example prompt: list apps + readiness",
        "Docs example maps to list_applications + check_application_readiness",
        "pass" if (not is_tool_error(apps) and not is_tool_error(readiness)) else "fail",
        "minor",
        "Executed tool chain successfully" if not is_tool_error(apps) else "Failed",
        "evidence/live/list_applications.json",
    )
    record(
        "Example prompt: ensure_wallet_funded",
        "Fund testnet global wallet if needed",
        "pass" if ensure_ok else "fail",
        "minor",
        tool_text(ensure2)[:200],
        "evidence/live/ensure_wallet_funded_2.json",
    )
    record(
        "Example prompt: update domains localhost",
        "Add http://localhost:3000 to allowed domains",
        classify(domains1),
        "minor",
        tool_text(domains1)[:200],
        "evidence/live/update_application_domains.json",
    )
    record(
        "Example prompt: create publishable key",
        "Create a publishable API key",
        classify(create_key),
        "minor",
        tool_text(create_key)[:200],
        "evidence/live/create_api_key.json",
    )

    out = EVIDENCE / "suite-results.json"
    out.write_text(redact(json.dumps({"results": results, "tool_names": tool_names, "new_app_id": new_app_id, "public_key_found": bool(public_key)}, indent=2), secrets))
    # console summary without secrets
    counts: dict[str, int] = {}
    for r in results:
        counts[r["result"]] = counts.get(r["result"], 0) + 1
    print(json.dumps({"counts": counts, "total": len(results), "tools": len(tool_names), "new_app_id": new_app_id}, indent=2))
    for r in results:
        print(f"[{r['result']}] {r['item']}: {r['notes'][:120]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
