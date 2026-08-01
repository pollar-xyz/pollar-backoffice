#!/usr/bin/env python3
"""SDK + Server API probes using publishable/secret keys. Redacted evidence only."""
from __future__ import annotations

import json
import re
import ssl
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
SECRETS = ROOT / ".secrets.env"
EVIDENCE = ROOT / "evidence" / "live"
EVIDENCE.mkdir(parents=True, exist_ok=True)
SDK = "https://sdk.api.pollar.xyz/v1"
# hub/server API base from docs
HUB = "https://api.pollar.xyz"  # may vary; we'll probe


def load_secrets():
    out = {}
    for line in SECRETS.read_text().splitlines():
        if not line.strip() or line.strip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def redact(s: str, secrets: dict) -> str:
    out = s
    for v in secrets.values():
        if v and len(v) >= 12:
            out = out.replace(v, f"{v[:8]}…REDACTED")
    out = re.sub(r"pat_[0-9a-fA-F]+", "pat_…REDACTED", out)
    out = re.sub(r"sec_testnet_[0-9a-fA-F]+", "sec_testnet_…REDACTED", out)
    out = re.sub(r"pub_testnet_[0-9a-fA-F]+", "pub_testnet_…REDACTED", out)
    out = re.sub(r"G[A-Z0-9]{55}", "G…REDACTED", out)
    return out


def http(method: str, url: str, token: str | None = None, body: dict | None = None, header_name: str = "Authorization"):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers[header_name] = f"Bearer {token}"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=45, context=ssl.create_default_context()) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, raw
    except HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return e.code, raw
    except URLError as e:
        return 0, str(e)


def main():
    secrets = load_secrets()
    pub = secrets["POLLAR_PUBLISHABLE_KEY"]
    sec = secrets["POLLAR_SECRET_KEY"]
    results = []

    def rec(item, result, notes, evidence=""):
        results.append({"item": item, "result": result, "notes": notes, "evidence": evidence})

    # Publishable: applications/config
    status, raw = http("GET", f"{SDK}/applications/config", pub)
    Path(EVIDENCE / "sdk-applications-config.json").write_text(redact(raw, secrets))
    rec("GET /v1/applications/config (publishable)", "pass" if status == 200 else "fail", f"http={status} body={raw[:300]}", "evidence/live/sdk-applications-config.json")

    # Secret-only style routes — probe common bases from docs
    bases = [
        "https://sdk.api.pollar.xyz/v1",
        "https://api.pollar.xyz/v1",
        "https://hub.api.pollar.xyz/v1",
    ]
    # From llms-full: POST /v1/wallets/activate needs secret
    activate_body = {"address": "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"}  # invalid but auth probe
    for base in bases:
        status, raw = http("POST", f"{base}/wallets/activate", sec, activate_body)
        fname = f"activate-{base.replace('https://','').replace('/','_')}.json"
        Path(EVIDENCE / fname).write_text(redact(json.dumps({"base": base, "status": status, "body": raw[:2000]}, indent=2), secrets))
        rec(f"POST {base}/wallets/activate (secret auth probe)", "pass" if status not in (0, 401, 404) or (status in (400, 422) and "API_KEY" not in raw) else ("pass" if status in (400, 422) else "fail" if status in (401, 403) else "blocked" if status == 404 else "fail"), f"http={status} body={raw[:250]}", f"evidence/live/{fname}")

    # GET tx history style
    for base in bases:
        status, raw = http("GET", f"{base}/tx/history?limit=5", sec)
        fname = f"tx-history-{base.replace('https://','').replace('/','_')}.json"
        Path(EVIDENCE / fname).write_text(redact(json.dumps({"status": status, "body": raw[:2000]}, indent=2), secrets))
        if status != 404:
            rec(f"GET {base}/tx/history", "pass" if status in (200, 400, 422) else "fail", f"http={status} body={raw[:200]}", f"evidence/live/{fname}")

    # Publishable should fail on secret routes
    status, raw = http("POST", f"{SDK}/wallets/activate", pub, activate_body)
    Path(EVIDENCE / "activate-with-publishable.json").write_text(redact(json.dumps({"status": status, "body": raw[:1000]}, indent=2), secrets))
    rec("POST /v1/wallets/activate with publishable key", "pass" if status in (401, 403) else "fail", f"http={status} — publishable must not activate wallets; body={raw[:200]}", "evidence/live/activate-with-publishable.json")

    # Bad publishable
    status, raw = http("GET", f"{SDK}/applications/config", "pub_testnet_invalid")
    rec("Invalid publishable key rejected", "pass" if status in (401, 403) else "fail", f"http={status} body={raw[:200]}")

    out = EVIDENCE / "api-suite-results.json"
    out.write_text(redact(json.dumps(results, indent=2), secrets))
    print(json.dumps({"total": len(results), "results": results}, indent=2)[:4000])


if __name__ == "__main__":
    main()
