/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { usePollar } from "@pollar/react";
import type { RampCountry, RampQuote, RampTxStatus } from "@pollar/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSharedPollarClient } from "../providers";
import {
  callMorapay,
  inferStellarMemo,
  toGhanaInternationalPhone,
  MorapayApiError,
  PESOS_CURRENCIES,
  BRIDGE_TERMINAL_STATUSES,
  type BridgeQuote,
  type BridgeExecuteResult,
  type BridgePayment,
  type BridgeResult,
} from "./lib/morapay-client";

type Direction = "onramp" | "offramp";

type Step = "form" | "quotes" | "fields" | "processing";

const TERMINAL: RampTxStatus[] = ["completed", "failed"];

type RequiredField = RampQuote["requiredFields"][number];

// Onramp's request body has no generic catch-all for arbitrary fields (only
// email/fullName/taxId/qrCode + bankDetails on offramp) — this mirrors the
// same mapping Pollar's own RampWidget uses internally.
const STANDARD_BODY_KEYS = new Set(["email", "fullName", "taxId", "qrCode"]);

// Some providers shouldn't be named in the UI (per product decision) — the
// quote/route itself still works exactly the same, we just don't print who's
// actually running it. Case-insensitive since the API's casing isn't guaranteed.
const HIDDEN_PROVIDERS = new Set(["stereum", "abroad"]);
function displayProviderName(providerName: string) {
  return HIDDEN_PROVIDERS.has(providerName.trim().toLowerCase()) ? "Pollar" : providerName;
}

function shortenAddress(address: string) {
  return address.length <= 12
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Real wallet-connect buttons swap to an address+dropdown once connected
// instead of just printing the address as text — this is that, with
// disconnect as the one action in the menu since that's all Pollar's SDK
// exposes here (no "switch wallet" affordance in usePollar()).
type BalanceRow = { code: string; amount: string | null };

function WalletMenuButton({
  address,
  onDisconnect,
  balances,
  balancesLoading,
  balancesError,
}: {
  address: string;
  onDisconnect: () => void;
  balances: BalanceRow[];
  balancesLoading: boolean;
  balancesError: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {shortenAddress(address)}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3 w-3 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          <div className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Connected
          </div>
          <div className="break-all px-3 py-2 font-mono text-xs text-zinc-600">{address}</div>
          <div className="border-t border-zinc-100 px-3 py-2">
            {balancesLoading && <p className="text-xs text-zinc-400">Loading balances…</p>}
            {balancesError && !balancesLoading && (
              <p className="text-xs text-red-500">{balancesError}</p>
            )}
            {!balancesLoading && !balancesError && balances.length === 0 && (
              <p className="text-xs text-zinc-400">No balance yet.</p>
            )}
            {!balancesLoading &&
              !balancesError &&
              balances.map((b) => (
                <div key={b.code} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{b.code}</span>
                  <span className="font-mono font-semibold text-zinc-700">
                    {b.amount ?? "—"}
                  </span>
                </div>
              ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setFailed(false);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard API throws NotAllowedError when the document/iframe
          // isn't focused (common in dev-tool previews) — not a real bug,
          // just tell the user to click the page first instead of crashing.
          setFailed(true);
          setTimeout(() => setFailed(false), 1500);
        }
      }}
      className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-200"
    >
      {copied ? "Copied" : failed ? "Click page first" : "Copy"}
    </button>
  );
}

// The API types depositInstructions as `Record<string, unknown>` — providers
// shape it differently (Stereum nests a QR under scannable.image, others
// return a flat { qrBase64, br_code, ... } object). Render defensively so
// nothing silently disappears the way it did in Pollar's own widget.
function DepositInstructions({ data }: { data: Record<string, unknown> }) {
  const rows: { key: string; label: string; node: React.ReactNode }[] = [];

  const scannable = data.scannable as
    | { kind?: string; payload?: string | null; payloadLabel?: string | null; image?: { mediaType?: string; encoding?: string; data?: string } }
    | undefined;
  if (scannable?.image?.data) {
    const mime = scannable.image.mediaType ?? "image/png";
    rows.push({
      key: "scannable-image",
      label: scannable.payloadLabel || "Scan to pay",
      node: (
        <img
          src={`data:${mime};base64,${scannable.image.data}`}
          alt="Payment QR"
          className="mx-auto block w-full max-w-[220px]"
        />
      ),
    });
  } else if (scannable?.payload) {
    rows.push({
      key: "scannable-payload",
      label: scannable.payloadLabel || "Payment code",
      node: (
        <span className="flex items-center gap-2">
          <code className="flex-1 break-all">{scannable.payload}</code>
          <CopyButton value={scannable.payload} />
        </span>
      ),
    });
  }

  const fields = data.fields as
    | { key: string; label: string; value: string; type?: string; copyable?: boolean }[]
    | undefined;
  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (!f || typeof f.value !== "string" && typeof f.value !== "number") continue;
      rows.push({
        key: f.key,
        label: f.label ?? f.key,
        node: f.copyable ? (
          <span className="flex items-center gap-2">
            <code className="flex-1 break-all">{String(f.value)}</code>
            <CopyButton value={String(f.value)} />
          </span>
        ) : (
          <span>{String(f.value)}</span>
        ),
      });
    }
  }

  // Legacy flat shape some providers use directly on the top-level object.
  for (const [k, v] of Object.entries(data)) {
    if (k === "scannable" || k === "fields") continue;
    if (k === "qrBase64" && typeof v === "string" && v) {
      rows.push({
        key: k,
        label: "Payment QR",
        node: (
          <img
            src={v.startsWith("data:") ? v : `data:image/png;base64,${v}`}
            alt="Payment QR"
            className="mx-auto block w-full max-w-[220px]"
          />
        ),
      });
      continue;
    }
    if (typeof v === "string" || typeof v === "number") {
      rows.push({ key: k, label: k, node: <span>{String(v)}</span> });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
        The provider returned deposit instructions in a shape this page
        doesn&apos;t recognize yet. Raw response below so nothing is hidden:
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-white p-2 text-[10px]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {r.label}
          </div>
          <div className="text-xs text-zinc-700">{r.node}</div>
        </div>
      ))}
    </div>
  );
}

type SendStep = "quote" | "recipient" | "pay" | "confirm";

// Morapay's docs don't list a stable error code for this case, so match on
// the message too — update NAME_MISMATCH_CODES if a real code turns up in a
// live response.
const NAME_MISMATCH_CODES = new Set([
  "RECEIVER_NAME_MISMATCH",
  "NAME_MISMATCH",
  "INVALID_RECEIVER_NAME",
  "MOMO_NAME_MISMATCH",
]);

function isNameMismatchError(error: unknown): error is MorapayApiError {
  if (!(error instanceof MorapayApiError)) return false;
  if (error.code && NAME_MISMATCH_CODES.has(error.code)) return true;
  return /name/i.test(error.message) && /(match|mismatch|incorrect|invalid|doesn.t)/i.test(error.message);
}

export default function OnrampOfframpPage() {
  const {
    isAuthenticated,
    openLoginModal,
    logout,
    wallet,
    network,
    sendPayment,
    walletBalance,
    refreshWalletBalance,
  } = usePollar();
  const walletAddress = wallet?.address ?? null;
  const client = useMemo(() => getSharedPollarClient(), []);

  // Only USDC + native XLM matter for this app's flows (onramp/offramp/send
  // all move one or the other) — everything else the wallet might hold via
  // other enabled assets is out of scope for this display.
  const displayBalances = useMemo<BalanceRow[]>(() => {
    if (walletBalance.step !== "loaded") return [];
    const records = walletBalance.data.balances;
    const codes = ["USDC", "XLM"];
    return codes
      .map((code) => records.find((r) => r.code === code))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ code: r.code, amount: r.balance }));
  }, [walletBalance]);
  const balancesLoading = walletBalance.step === "loading";
  const balancesError = walletBalance.step === "error" ? walletBalance.message : null;

  useEffect(() => {
    if (isAuthenticated) void refreshWalletBalance();
  }, [isAuthenticated, refreshWalletBalance]);

  const [mode, setMode] = useState<"ramp" | "send">("ramp");

  const [step, setStep] = useState<Step>("form");
  const [direction, setDirection] = useState<Direction>("onramp");
  const [countries, setCountries] = useState<RampCountry[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [countriesErr, setCountriesErr] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [amount, setAmount] = useState("100");

  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesErr, setQuotesErr] = useState<string | null>(null);
  // Two-way converter above the quote list. The API only accepts a fiat
  // amount as input — there's no "quote by crypto amount" endpoint — so the
  // crypto→fiat direction is our own math against the reference quote's rate,
  // not a second network call. Convention: rate = units of `currency` per 1
  // unit of crypto (matches how BOB/USD and similar pairs are conventionally
  // quoted, and how Fonbnk's own exchangeRate field works) — flip the two
  // formulas below if a provider turns out to report it the other way.
  const [cryptoAmount, setCryptoAmount] = useState("");
  const referenceQuote = useMemo(
    () => quotes.find((q) => q.recommended) ?? quotes[0] ?? null,
    [quotes],
  );

  const [selectedQuote, setSelectedQuote] = useState<RampQuote | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [txId, setTxId] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<RampTxStatus | null>(null);
  const [txProvider, setTxProvider] = useState<string>("");
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [stellarTxHash, setStellarTxHash] = useState<string | null>(null);
  const [depositInstructions, setDepositInstructions] = useState<Record<string, unknown> | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);

  // --- Send tab (Morapay pesos<->GHS bridge) ---
  const [sendStep, setSendStep] = useState<SendStep>("quote");
  const [sendSourceCurrency, setSendSourceCurrency] = useState("BOB");
  const [sendSourceAmount, setSendSourceAmount] = useState("100");
  const [sendQuote, setSendQuote] = useState<BridgeQuote | null>(null);
  const [sendQuoteLoading, setSendQuoteLoading] = useState(false);
  const [sendQuoteErr, setSendQuoteErr] = useState<string | null>(null);

  const [momoPhone, setMomoPhone] = useState("");
  const [momoName, setMomoName] = useState("");
  const [momoProvider, setMomoProvider] = useState("mtn");
  const [executing, setExecuting] = useState(false);
  const [executeErr, setExecuteErr] = useState<string | null>(null);
  // Set only when Morapay rejects the transfer specifically because
  // receiverName doesn't match what the MoMo network has on file for that
  // phone number — surfaced on the Name field itself, not the generic error
  // banner, since it's the one thing the user can actually go fix.
  const [momoNameErr, setMomoNameErr] = useState<string | null>(null);

  const [bridgeTransferId, setBridgeTransferId] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<BridgePayment | null>(null);
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  // Set the moment the on-chain payment itself succeeds, before we've heard
  // back from Morapay's confirm call. Once real funds have moved, the "Send"
  // button must never be clickable again — if confirm fails, the recovery
  // path is retrying *confirm* with this same hash, never re-paying.
  const [paidHash, setPaidHash] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [bridgeResult, setBridgeResult] = useState<BridgeResult | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Ticks the countdown on the recipient step so "quote expires in Ns" stays
  // live instead of a static timestamp nobody reads.
  useEffect(() => {
    if (sendStep !== "recipient") return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sendStep]);

  const loadCountries = useCallback(async () => {
    setCountriesLoading(true);
    setCountriesErr(null);
    try {
      const { countries: list } = await client.getRampCountries();
      setCountries(list);
      const first = list[0];
      if (first) {
        setCountry(first.code);
        if (first.currency) setCurrency(first.currency);
      }
    } catch (error: any) {
      setCountriesErr(error?.message ?? "Could not load supported countries");
    } finally {
      setCountriesLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (isAuthenticated) void loadCountries();
  }, [isAuthenticated, loadCountries]);

  function handleCountryChange(code: string) {
    setCountry(code);
    const match = countries.find((c) => c.code === code);
    if (match?.currency) setCurrency(match.currency);
  }

  async function fetchQuotes() {
    setQuotesLoading(true);
    setQuotesErr(null);
    setQuotes([]);
    try {
      const amountNum = Number(amount);
      const result = await client.getRampsQuote({
        country,
        currency,
        amount: amountNum,
        direction,
      });
      const list = result.quotes ?? [];
      setQuotes(list);
      setStep("quotes");
      if (!list.length) {
        setQuotesErr("No routes returned for this country/amount combination.");
        setCryptoAmount("");
      } else {
        const ref = list.find((q) => q.recommended) ?? list[0];
        setCryptoAmount((amountNum / ref.rate).toFixed(4));
      }
    } catch (error: any) {
      setQuotesErr(
        error?.responseBody?.details ?? error?.message ?? "Could not fetch quotes",
      );
    } finally {
      setQuotesLoading(false);
    }
  }

  // Both directions of the converter above the quote list — pure client-side
  // math against `referenceQuote.rate`, no network call. Typing in one field
  // updates the other instantly; "Refresh quotes" re-queries the API for
  // real quotes at whatever fiat amount that lands on.
  function onFiatAmountInput(value: string) {
    setAmount(value);
    if (!referenceQuote) return;
    const n = Number(value);
    setCryptoAmount(Number.isFinite(n) ? (n / referenceQuote.rate).toFixed(4) : "");
  }

  function onCryptoAmountInput(value: string) {
    setCryptoAmount(value);
    if (!referenceQuote) return;
    const n = Number(value);
    setAmount(Number.isFinite(n) ? (n * referenceQuote.rate).toFixed(2) : "");
  }

  function selectQuote(quote: RampQuote) {
    setSelectedQuote(quote);
    const defaults: Record<string, string> = {};
    for (const f of quote.requiredFields ?? []) {
      defaults[f.key] = f.options?.[0]?.value ?? "";
    }
    setFieldValues(defaults);
    setSubmitErr(null);
    setStep("fields");
  }

  // Ramp quotes are only good for ~15 min per Pollar's docs, but filling in
  // the required-fields form (bank details, etc.) can easily eat into that.
  // There's no expiresAt on RampQuote to show a countdown from, so instead we
  // just quietly re-fetch quotes in the background while the user is on this
  // step and swap in a fresh quoteId for the same provider/rail — the form
  // fields the user already typed are untouched (separate state).
  useEffect(() => {
    if (step !== "fields" || !selectedQuote) return;
    const provider = selectedQuote.provider;
    const rail = selectedQuote.rail;
    const id = setInterval(async () => {
      try {
        const amountNum = Number(amount);
        const result = await client.getRampsQuote({ country, currency, amount: amountNum, direction });
        const fresh = result.quotes?.find((q) => q.provider === provider && q.rail === rail);
        if (fresh) setSelectedQuote(fresh);
      } catch {
        // Opportunistic refresh — leave the existing quoteId in place and
        // let submitOrder's own error handling surface it if it's gone stale.
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [step, selectedQuote, amount, country, currency, direction, client]);

  function isFieldValid(f: RequiredField, value: string | undefined) {
    const v = (value ?? "").trim();
    if (!v) return false;
    if (f.type === "email") return /\S+@\S+\.\S+/.test(v);
    return true;
  }

  const requiredFields = selectedQuote?.requiredFields ?? [];
  const allFieldsValid = requiredFields.every((f) => isFieldValid(f, fieldValues[f.key]));

  async function submitOrder() {
    if (!selectedQuote || !walletAddress) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const base: Record<string, any> = {
        quoteId: selectedQuote.quoteId,
        amount: Number(amount),
        currency,
        country,
        walletAddress,
      };
      const extraFields: Record<string, string> = {};
      let bankDetails: { type: string; value: string } | undefined;
      for (const f of requiredFields) {
        const val = fieldValues[f.key];
        if (val == null || val === "") continue;
        if (f.bankType) {
          bankDetails = { type: f.bankType, value: val };
        } else if (STANDARD_BODY_KEYS.has(f.key)) {
          base[f.key] = val;
        } else {
          extraFields[f.key] = val;
        }
      }

      const response =
        direction === "onramp"
          ? await client.createOnRamp(base as any)
          : await client.createOffRamp({
              ...base,
              ...(bankDetails ? { bankDetails } : {}),
              ...(Object.keys(extraFields).length ? { fields: extraFields } : {}),
            } as any);

      setTxId(response.txId);
      setTxProvider(response.provider);
      setTxStatus(response.status);
      if (response.kycUrl) setKycUrl(response.kycUrl);
      if (response.stellarTxHash) setStellarTxHash(response.stellarTxHash);
      if (response.depositInstructions) setDepositInstructions(response.depositInstructions);
      setPollAttempts(0);
      setPollErr(null);
      setStep("processing");
    } catch (error: any) {
      setSubmitErr(
        error?.responseBody?.details ?? error?.message ?? "Could not create the order",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Poll ourselves — and unlike Pollar's own widget, don't swallow errors:
  // surface them so a stuck "pending" is visibly a stuck "pending", not silence.
  useEffect(() => {
    if (step !== "processing" || !txId) return;
    if (txStatus && TERMINAL.includes(txStatus)) return;
    let active = true;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts += 1;
      setPollAttempts(attempts);
      try {
        const tx = await client.getRampTransaction(txId);
        if (!active) return;
        setTxStatus(tx.status);
        setPollErr(null);
        if (tx.stellarTxHash) setStellarTxHash(tx.stellarTxHash);
        if (tx.kycUrl) setKycUrl(tx.kycUrl);
        if (tx.depositInstructions) setDepositInstructions(tx.depositInstructions);
        if (TERMINAL.includes(tx.status)) clearInterval(id);
      } catch (error: any) {
        if (!active) return;
        setPollErr(error?.responseBody?.details ?? error?.message ?? "Status check failed");
      }
      if (attempts > 60 && active) {
        // ~5 minutes at 5s/poll — stop hammering the API, let the user decide.
        clearInterval(id);
      }
    }, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [step, txId, txStatus, client]);

  function resetToForm() {
    setStep("form");
    setQuotes([]);
    setSelectedQuote(null);
    setTxId(null);
    setTxStatus(null);
    setDepositInstructions(null);
    setKycUrl(null);
    setStellarTxHash(null);
    setSubmitErr(null);
    setPollErr(null);
  }

  // Morapay quotes are stateless and self-expiring (TTL ~5 min, code
  // QUOTE_EXPIRED) — it never auto-refreshes, it just rejects a stale
  // quoteId. So refreshing is entirely our job: silently re-fetch with the
  // same params and swap the quoteId in. Single source of truth for the
  // *rate* stays Morapay; we just own noticing when to ask again.
  async function requestSendQuote(): Promise<BridgeQuote | null> {
    try {
      const data = await callMorapay<BridgeQuote>("bridge/quote", {
        direction: "PESOS_TO_GHS",
        sourceCurrency: sendSourceCurrency,
        sourceAmount: Number(sendSourceAmount),
      });
      setSendQuote(data);
      return data;
    } catch (error: any) {
      setSendQuoteErr(error?.message ?? "Could not fetch quote");
      return null;
    }
  }

  async function fetchSendQuote() {
    setSendQuoteLoading(true);
    setSendQuoteErr(null);
    const data = await requestSendQuote();
    setSendQuoteLoading(false);
    if (data) setSendStep("recipient");
  }

  async function executeSend() {
    if (!sendQuote) return;
    setExecuting(true);
    setExecuteErr(null);
    setMomoNameErr(null);
    try {
      let quote = sendQuote;
      if (new Date(quote.expiresAt).getTime() <= Date.now()) {
        const fresh = await requestSendQuote();
        if (!fresh) {
          setExecuteErr("Quote expired and refresh failed — try again.");
          return;
        }
        quote = fresh;
      }

      const phone = toGhanaInternationalPhone(momoPhone);
      const attemptExecute = (quoteId: string) =>
        callMorapay<BridgeExecuteResult>(
          "bridge/execute",
          { quoteId, momo: { phone, receiverName: momoName, providerHint: momoProvider || undefined } },
          `execute:${quoteId}`,
        );

      let data: BridgeExecuteResult;
      try {
        data = await attemptExecute(quote.quoteId);
      } catch (error) {
        // Reactive fallback: it can still expire in the gap between our
        // freshness check above and the request actually landing.
        if (error instanceof MorapayApiError && error.code === "QUOTE_EXPIRED") {
          const fresh = await requestSendQuote();
          if (!fresh) {
            setExecuteErr("Quote expired and refresh failed — try again.");
            return;
          }
          data = await attemptExecute(fresh.quoteId);
        } else {
          throw error;
        }
      }

      if (!data.payment) {
        setExecuteErr("Morapay didn't return payment instructions for this transfer.");
        return;
      }
      setBridgeTransferId(data.bridgeTransferId);
      setBridgeStatus(data.status);
      setPaymentInfo(data.payment);
      setSendStep("pay");
    } catch (error: any) {
      if (isNameMismatchError(error)) {
        setMomoNameErr(error.message);
      } else {
        setExecuteErr(error?.message ?? "Could not create the transfer");
      }
    } finally {
      setExecuting(false);
    }
  }

  async function confirmSend(hash: string) {
    if (!bridgeTransferId) return;
    setConfirming(true);
    setConfirmErr(null);
    try {
      const data = await callMorapay<BridgeResult>(
        "bridge/confirm",
        { bridgeTransferId, stellarTxHash: hash },
        `confirm:${bridgeTransferId}:${hash}`,
      );
      setBridgeResult(data);
      setBridgeStatus(data.status);
      setSendStep("confirm");
    } catch (error: any) {
      setConfirmErr(error?.message ?? "Could not confirm the on-chain payment");
    } finally {
      setConfirming(false);
    }
  }

  async function payWithWallet() {
    if (!paymentInfo) return;
    setPaying(true);
    setPayErr(null);
    try {
      const memo = inferStellarMemo(paymentInfo.memo);
      const outcome = await sendPayment({
        destination: paymentInfo.destination,
        amount: paymentInfo.amount,
        asset:
          paymentInfo.assetType === "native"
            ? { type: "native" }
            : {
                type: paymentInfo.assetType as "credit_alphanum4" | "credit_alphanum12",
                code: paymentInfo.assetCode,
                issuer: paymentInfo.assetIssuer,
              },
        ...(memo ? { options: { memo } } : {}),
      });
      if (outcome.status !== "success" && outcome.status !== "pending") {
        setPayErr(outcome.details || outcome.resultCode || "Payment failed");
        return;
      }
      setPaidHash(outcome.hash);
      void refreshWalletBalance();
      await confirmSend(outcome.hash);
    } catch (error: any) {
      setPayErr(error?.message ?? "Could not send payment");
    } finally {
      setPaying(false);
    }
  }

  function resetSend() {
    setSendStep("quote");
    setSendQuote(null);
    setSendQuoteErr(null);
    setMomoPhone("");
    setMomoName("");
    setMomoNameErr(null);
    setBridgeTransferId(null);
    setBridgeStatus(null);
    setPaymentInfo(null);
    setPayErr(null);
    setPaidHash(null);
    setExecuteErr(null);
    setConfirmErr(null);
    setBridgeResult(null);
  }

  // Poll Morapay's bridge status ourselves once we're waiting on the MoMo
  // payout — same "never swallow errors silently" rule as the ramp poller.
  useEffect(() => {
    if (sendStep !== "confirm" || !bridgeTransferId) return;
    if (bridgeStatus && BRIDGE_TERMINAL_STATUSES.includes(bridgeStatus)) return;
    let active = true;
    const id = setInterval(async () => {
      try {
        const data = await callMorapay<BridgeResult>(`bridge/status/${bridgeTransferId}`);
        if (!active) return;
        setBridgeResult(data);
        setBridgeStatus(data.status);
        setConfirmErr(null);
        if (BRIDGE_TERMINAL_STATUSES.includes(data.status)) clearInterval(id);
      } catch (error: any) {
        if (active) setConfirmErr(error?.message ?? "Status check failed");
      }
    }, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sendStep, bridgeTransferId, bridgeStatus]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-zinc-200/80 bg-white/80 px-4 py-4 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white font-bold">
            P
          </div>
          <span className="shrink-0 font-bold">Pollar</span>
          <span className="hidden shrink-0 text-zinc-400 sm:inline">×</span>
          <span className="hidden truncate font-medium text-zinc-600 sm:inline">Ramp (direct API)</span>
        </div>
        {isAuthenticated && walletAddress ? (
          <WalletMenuButton
            address={walletAddress}
            onDisconnect={logout}
            balances={displayBalances}
            balancesLoading={balancesLoading}
            balancesError={balancesError}
          />
        ) : (
          <button
            type="button"
            onClick={openLoginModal}
            className="shrink-0 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Connect Wallet
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
          {mode === "ramp" ? "Onramp / Offramp" : "Send"}
        </h1>
        <p className="mb-4 text-sm text-zinc-500">
          {mode === "ramp"
            ? `Calling /ramps/* directly · ${network} · no widget in between`
            : "Pesos -> GHS via Morapay's bridge API · Stellar USDC"}
        </p>

        {!isAuthenticated ? (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white text-2xl font-bold">
              $
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Direct SEP-24 ramp calls against Pollar&apos;s API — quotes, rates,
              and raw deposit instructions, without the built-in modal hiding
              any of it.
            </p>
            <button
              type="button"
              onClick={openLoginModal}
              className="mt-8 w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
            >
              Connect with Pollar Wallet
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex rounded-xl bg-zinc-100 p-1">
              {(["ramp", "send"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition ${
                    mode === m ? "bg-white shadow text-brand" : "text-zinc-500"
                  }`}
                >
                  {m === "ramp" ? "Onramp / Offramp" : "Send"}
                </button>
              ))}
            </div>

        {mode === "ramp" && step === "form" && (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
            <div className="mb-4 flex rounded-xl bg-zinc-100 p-1">
              {(["onramp", "offramp"] as Direction[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition ${
                    direction === d ? "bg-white shadow text-brand" : "text-zinc-500"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Country
            </label>
            {countriesErr && (
              <div className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{countriesErr}</div>
            )}
            <select
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
              disabled={countriesLoading || !countries.length}
              className="mb-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm"
            >
              {countriesLoading && <option>Loading…</option>}
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.currency ? `— ${c.currency}` : ""}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Amount ({currency || "—"})
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mb-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-lg font-semibold"
            />

            {quotesErr && (
              <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{quotesErr}</div>
            )}

            <button
              onClick={fetchQuotes}
              disabled={!country || !currency || !amount || quotesLoading}
              className="w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
            >
              {quotesLoading ? "Fetching quotes…" : "Get quotes"}
            </button>
          </div>
        )}

        {mode === "ramp" && step === "quotes" && (
          <div className="space-y-3">
            <button onClick={resetToForm} className="text-xs font-semibold text-zinc-500">
              ← Back
            </button>
            {quotesErr && (
              <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{quotesErr}</div>
            )}

            {referenceQuote && (
              <div className="rounded-2xl border border-zinc-200/60 bg-white p-4 shadow-sm">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Convert (either field — computed against {displayProviderName(referenceQuote.provider)}&apos;s rate,
                  not a new API call)
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] text-zinc-400">{currency}</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => onFiatAmountInput(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                  <span className="mt-4 text-zinc-400">⇄</span>
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] text-zinc-400">USDC</label>
                    <input
                      type="number"
                      value={cryptoAmount}
                      onChange={(e) => onCryptoAmountInput(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-zinc-400">
                  1 USDC ≈ {referenceQuote.rate} {currency} (assumed convention — the API
                  doesn&apos;t label which side <code>rate</code> is on)
                </div>
                <button
                  onClick={fetchQuotes}
                  disabled={quotesLoading}
                  className="mt-3 w-full rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {quotesLoading ? "Refreshing…" : `Refresh quotes for ${amount} ${currency}`}
                </button>
              </div>
            )}

            {quotes.map((q) => {
              const amt = Number(amount);
              const cryptoEquivalent = amt / q.rate;
              return (
                <button
                  key={q.quoteId}
                  onClick={() => selectQuote(q)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-brand"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-zinc-800">
                      {displayProviderName(q.provider)}
                    </span>
                    {q.recommended && (
                      <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand">
                        Best rate
                      </span>
                    )}
                  </div>
                  <div className="mb-2 text-xs text-zinc-500">
                    {q.rail} · {q.protocol} · {q.estimatedTime} · {q.fee}% fee ({q.feeCurrency})
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700">
                    {amt.toLocaleString()} {currency} ≈{" "}
                    <span className="font-semibold">
                      {cryptoEquivalent.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC
                    </span>{" "}
                    <span className="text-zinc-400">(rate: 1 USDC ≈ {q.rate} {currency})</span>
                  </div>
                  {(q.minAmount != null || q.maxAmount != null) && (
                    <div className="mt-1 text-[10px] text-zinc-400">
                      limits: {q.minAmount ?? "—"} – {q.maxAmount ?? "—"} {currency}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {mode === "ramp" && step === "fields" && selectedQuote && (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
            <button onClick={() => setStep("quotes")} className="mb-3 text-xs font-semibold text-zinc-500">
              ← Back to routes
            </button>
            <h2 className="mb-3 text-sm font-semibold text-zinc-700">
              {displayProviderName(selectedQuote.provider)} · {selectedQuote.rail}
            </h2>

            {requiredFields.length === 0 && (
              <p className="mb-4 text-xs text-zinc-500">
                No extra fields required by this route.
              </p>
            )}

            {requiredFields.map((f) => (
              <div key={f.key} className="mb-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {f.label}
                </label>
                {f.type === "select" ? (
                  <select
                    value={fieldValues[f.key] ?? ""}
                    onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm"
                  >
                    {(f.options ?? []).map((o, i) => (
                      // Bolivia's bank list has real duplicate codes (e.g.
                      // "BCP" used for both Yape and Banco de Credito de
                      // Bolivia) — that's upstream data, not fixable here,
                      // but React still needs a unique key per row.
                      <option key={`${o.value}-${i}`} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                    value={fieldValues[f.key] ?? ""}
                    onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm"
                  />
                )}
              </div>
            ))}

            {submitErr && (
              <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{submitErr}</div>
            )}

            <button
              onClick={submitOrder}
              disabled={!allFieldsValid || submitting}
              className="w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
            >
              {submitting ? "Creating order…" : `Create ${direction}`}
            </button>
          </div>
        )}

        {mode === "ramp" && step === "processing" && (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
            <button onClick={resetToForm} className="mb-3 text-xs font-semibold text-zinc-500">
              ← Start over
            </button>
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-500">Provider</span>
              <code>{displayProviderName(txProvider)}</code>
            </div>
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-500">Status</span>
              <span className="flex items-center gap-2">
                <code className={txStatus === "completed" ? "text-emerald-600" : "text-zinc-700"}>
                  {txStatus ?? "pending"}
                </code>
                {txStatus && !TERMINAL.includes(txStatus) && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                )}
              </span>
            </div>

            {pollErr && (
              <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                Status check error (this is surfaced, not swallowed): {pollErr}
              </div>
            )}

            {kycUrl && (
              <a
                href={kycUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block w-full rounded-2xl bg-zinc-800 px-4 py-3 text-center text-sm font-semibold text-white"
              >
                Complete verification at {displayProviderName(txProvider)}
              </a>
            )}

            {stellarTxHash && (
              <div className="mb-3 rounded-xl bg-zinc-50 p-3 text-xs">
                <div className="mb-1 font-semibold text-zinc-400">Stellar tx</div>
                <span className="flex items-center gap-2">
                  <code className="flex-1 break-all">{stellarTxHash}</code>
                  <CopyButton value={stellarTxHash} />
                </span>
              </div>
            )}

            {depositInstructions ? (
              <DepositInstructions data={depositInstructions} />
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
                No deposit instructions yet — polling every 5s
                {pollAttempts > 0 ? ` (attempt ${pollAttempts})` : ""}.
              </div>
            )}
          </div>
        )}

        {mode === "send" && sendStep === "quote" && (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              From currency
            </label>
            <select
              value={sendSourceCurrency}
              onChange={(e) => setSendSourceCurrency(e.target.value)}
              className="mb-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm"
            >
              {PESOS_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Amount ({sendSourceCurrency})
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={sendSourceAmount}
              onChange={(e) => setSendSourceAmount(e.target.value)}
              className="mb-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-lg font-semibold"
            />

            {sendQuoteErr && (
              <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{sendQuoteErr}</div>
            )}

            <button
              onClick={fetchSendQuote}
              disabled={!sendSourceAmount || sendQuoteLoading}
              className="w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
            >
              {sendQuoteLoading ? "Getting quote…" : "Get quote"}
            </button>
          </div>
        )}

        {mode === "send" && sendStep === "recipient" && sendQuote && (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
            <button onClick={resetSend} className="mb-3 text-xs font-semibold text-zinc-500">
              ← Back
            </button>
            <div className="mb-4 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-700">
              <div className="flex justify-between">
                <span>{sendQuote.source.currency}</span>
                <span className="font-semibold">{sendQuote.source.amount}</span>
              </div>
              <div className="my-1 text-center text-zinc-300">↓</div>
              <div className="flex justify-between">
                <span>Bridge ({sendQuote.bridge.chain})</span>
                <span className="font-semibold">
                  {sendQuote.bridge.amount} {sendQuote.bridge.asset}
                </span>
              </div>
              <div className="my-1 text-center text-zinc-300">↓</div>
              <div className="flex justify-between">
                <span>{sendQuote.destination.currency} (Ghana MoMo)</span>
                <span className="font-semibold">{sendQuote.destination.amount}</span>
              </div>
              <div className="mt-2 text-[10px] text-zinc-400">
                {(() => {
                  const secondsLeft = Math.round(
                    (new Date(sendQuote.expiresAt).getTime() - nowTick) / 1000,
                  );
                  return secondsLeft > 0
                    ? `Quote expires in ${secondsLeft}s — refreshed automatically if you take longer`
                    : "Quote expired — will be refreshed automatically when you continue";
                })()}
              </div>
            </div>

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Recipient phone (Ghana MoMo)
            </label>
            <input
              type="tel"
              placeholder="0241234567"
              value={momoPhone}
              onChange={(e) => setMomoPhone(e.target.value)}
              className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm"
            />

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Recipient name
            </label>
            <input
              value={momoName}
              onChange={(e) => {
                setMomoName(e.target.value);
                if (momoNameErr) setMomoNameErr(null);
              }}
              className={`w-full rounded-xl border bg-zinc-50 px-3 py-2.5 text-sm ${
                momoNameErr ? "border-red-300" : "border-zinc-200"
              }`}
            />
            {momoNameErr ? (
              <p className="mb-3 mt-1 text-xs text-red-700">
                {momoNameErr} — check the spelling against the name registered on this MoMo
                number.
              </p>
            ) : (
              <div className="mb-3" />
            )}

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Mobile money network
            </label>
            <select
              value={momoProvider}
              onChange={(e) => setMomoProvider(e.target.value)}
              className="mb-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm"
            >
              <option value="mtn">MTN</option>
              <option value="vodafone">Telecel (Vodafone)</option>
              <option value="airteltigo">AirtelTigo</option>
            </select>

            {executeErr && (
              <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{executeErr}</div>
            )}

            <button
              onClick={executeSend}
              disabled={!momoPhone || !momoName || executing}
              className="w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
            >
              {executing ? "Creating transfer…" : "Continue"}
            </button>
          </div>
        )}

        {mode === "send" && sendStep === "pay" && paymentInfo && (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700">
              Send {paymentInfo.amount} {paymentInfo.assetCode} to Morapay
            </h2>
            <div className="mb-3 rounded-xl bg-zinc-50 p-3 text-xs">
              <div className="mb-1 font-semibold text-zinc-400">Destination</div>
              <span className="flex items-center gap-2">
                <code className="flex-1 break-all">{paymentInfo.destination}</code>
                <CopyButton value={paymentInfo.destination} />
              </span>
            </div>
            {paymentInfo.memo && (
              <div className="mb-3 rounded-xl bg-zinc-50 p-3 text-xs">
                <div className="mb-1 font-semibold text-zinc-400">Memo (required)</div>
                <span className="flex items-center gap-2">
                  <code className="flex-1 break-all">{paymentInfo.memo}</code>
                  <CopyButton value={paymentInfo.memo} />
                </span>
              </div>
            )}

            {payErr && <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{payErr}</div>}

            {paidHash ? (
              <>
                {confirmErr && (
                  <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                    Payment sent on-chain, but confirming it with Morapay failed:{" "}
                    {confirmErr}
                  </div>
                )}
                <div className="mb-3 rounded-xl bg-zinc-50 p-3 text-xs">
                  <div className="mb-1 font-semibold text-zinc-400">Sent (tx hash)</div>
                  <span className="flex items-center gap-2">
                    <code className="flex-1 break-all">{paidHash}</code>
                    <CopyButton value={paidHash} />
                  </span>
                </div>
                <button
                  onClick={() => confirmSend(paidHash)}
                  disabled={confirming}
                  className="w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
                >
                  {confirming ? "Confirming…" : "Retry confirmation"}
                </button>
                <p className="mt-2 text-[10px] text-zinc-400">
                  The payment already went out — this only retries telling Morapay about
                  it, it never sends again.
                </p>
              </>
            ) : (
              <>
                <button
                  onClick={payWithWallet}
                  disabled={paying || !walletAddress}
                  className="w-full rounded-2xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
                >
                  {paying ? "Sending…" : "Send USDC via Pollar wallet"}
                </button>
                <p className="mt-2 text-[10px] text-zinc-400">
                  Uses Pollar&apos;s built-in <code>sendPayment</code> — signs and submits with
                  your connected wallet, no manual XDR building.
                </p>
              </>
            )}
          </div>
        )}

        {mode === "send" && sendStep === "confirm" && (
          <div className="rounded-3xl border border-zinc-200/60 bg-white p-5 shadow-sm">
            <button onClick={resetSend} className="mb-3 text-xs font-semibold text-zinc-500">
              ← Start over
            </button>
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-500">Status</span>
              <span className="flex items-center gap-2">
                <code
                  className={bridgeStatus === "COMPLETED" ? "text-emerald-600" : "text-zinc-700"}
                >
                  {bridgeStatus ?? "…"}
                </code>
                {bridgeStatus && !BRIDGE_TERMINAL_STATUSES.includes(bridgeStatus) && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                )}
              </span>
            </div>

            {confirming && <div className="mb-3 text-xs text-zinc-500">Confirming on-chain payment…</div>}
            {confirmErr && (
              <div className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                Status check error (surfaced, not swallowed): {confirmErr}
              </div>
            )}

            {bridgeResult?.momoReference && (
              <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                MoMo reference: <code>{bridgeResult.momoReference}</code>
              </div>
            )}
            {bridgeResult?.failureMessage && (
              <div className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">
                {bridgeResult.failureCode}: {bridgeResult.failureMessage}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
