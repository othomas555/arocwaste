// pages/bins-bags.js
import { useMemo, useState } from "react";
import Link from "next/link";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function fmtGBP(n) {
  const x = Number(n || 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function normalizePostcode(pc) {
  return String(pc || "").trim().toUpperCase().replace(/\s+/g, " ").trim();
}

async function lookupRoute(postcode) {
  const pc = normalizePostcode(postcode);
  if (!pc) return null;

  const res = await fetch(`/api/route-lookup?postcode=${encodeURIComponent(pc)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return json;
}

function sortMatches(matches) {
  const dayIndex = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };
  const slotIndex = { AM: 1, PM: 2, ANY: 3 };

  const arr = Array.isArray(matches) ? [...matches] : [];
  arr.sort((a, b) => {
    const da = dayIndex[a.route_day] || 99;
    const db = dayIndex[b.route_day] || 99;
    if (da !== db) return da - db;

    const sa = slotIndex[a.slot] || 99;
    const sb = slotIndex[b.slot] || 99;
    if (sa !== sb) return sa - sb;

    return String(a.route_area || "").localeCompare(String(b.route_area || ""));
  });
  return arr;
}

// ---- Date helpers (London-safe) ----
const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function londonTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function ymdToDateNoonUTC(ymd) {
  const [Y, M, D] = String(ymd).split("-").map((x) => Number(x));
  return new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
}
function dateToYMDUTC(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDaysYMD(ymd, n) {
  const dt = ymdToDateNoonUTC(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dateToYMDUTC(dt);
}

function londonWeekdayNameToday() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
  }).format(new Date());
}

function nextOccurrencesOfDay(routeDay, count = 6) {
  const todayYMD = londonTodayYMD();
  const todayWeekday = londonWeekdayNameToday();

  const todayIdx = DAY_INDEX[todayWeekday];
  const targetIdx = DAY_INDEX[routeDay];
  if (todayIdx == null || targetIdx == null) return [];

  const delta = (targetIdx - todayIdx + 7) % 7; // includes today if same day
  const first = addDaysYMD(todayYMD, delta);

  const out = [];
  for (let i = 0; i < count; i++) out.push(addDaysYMD(first, i * 7));
  return out;
}

function formatStartOption(ymd) {
  const dt = ymdToDateNoonUTC(ymd);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dt);
}

// ---- Stripe-aligned pricing (matches your Stripe products) ----
const STRIPE_PRICES = {
  bin: 16.8,
  bag: 3.2,
  deposit: 50.0,
};

function frequencyLabel(freq) {
  if (freq === "weekly") return "per week";
  if (freq === "fortnightly") return "every 2 weeks";
  return "every 3 weeks";
}

export default function BinsBags() {
  // --- Postcode / coverage ---
  const [postcode, setPostcode] = useState("");
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [checkError, setCheckError] = useState("");

  // --- Subscription form fields ---
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [frequency, setFrequency] = useState("weekly"); // weekly | fortnightly | threeweekly
  const [extraBags, setExtraBags] = useState(0);
  const [useOwnBin, setUseOwnBin] = useState(false);

  // --- First collection start date ---
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD (chosen)

  // --- UI state ---
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const covered = checked && routeResult?.in_area && routeResult?.default;
  const matchesSorted = useMemo(
    () => sortMatches(routeResult?.matches),
    [routeResult?.matches]
  );

  const routeDay = routeResult?.default?.route_day || null;
  const startOptions = useMemo(() => {
    if (!covered || !routeDay) return [];
    return nextOccurrencesOfDay(routeDay, 6);
  }, [covered, routeDay]);

  // When coverage changes, set default start date to first option.
  useMemo(() => {
    if (!covered) return;
    if (!startOptions.length) return;
    if (!startDate || !startOptions.includes(startDate)) {
      setStartDate(startOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covered, routeDay]);

  const depositApplied = covered ? !useOwnBin : false;

  const dueTodayAtCheckout = useMemo(() => {
    // Stripe will charge the first recurring period immediately at checkout, plus deposit if applicable.
    const bin = STRIPE_PRICES.bin;
    const bags = STRIPE_PRICES.bag * clampInt(extraBags, 0, 10);
    const deposit = depositApplied ? STRIPE_PRICES.deposit : 0;
    return bin + bags + deposit;
  }, [extraBags, depositApplied]);

  const recurringPerCycle = useMemo(() => {
    const bin = STRIPE_PRICES.bin;
    const bags = STRIPE_PRICES.bag * clampInt(extraBags, 0, 10);
    return bin + bags;
  }, [extraBags]);

  async function onCheckPostcode() {
    setCheckError("");
    setSubmitError("");
    setChecked(false);
    setRouteResult(null);

    const pc = normalizePostcode(postcode);
    if (!pc) {
      setCheckError("Enter a postcode first.");
      return;
    }

    setChecking(true);
    try {
      const result = await lookupRoute(pc);
      setRouteResult(result);
      setChecked(true);

      if (!result || !result.in_area) {
        setCheckError("Sorry — we don’t currently cover that postcode.");
      }
    } catch (e) {
      setChecked(true);
      setRouteResult(null);
      setCheckError("Postcode lookup failed. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  async function subscribe() {
    setSubmitError("");

    if (!covered) {
      setSubmitError("Please check your postcode first.");
      return;
    }

    const pc = routeResult?.postcode || normalizePostcode(postcode);

    if (!email.trim() || !pc || !address.trim()) {
      setSubmitError("Please fill in email, postcode, and address.");
      return;
    }

    if (!startDate) {
      setSubmitError("Please choose your first collection start date.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/create-subscription-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          phone: phone.trim(),
          postcode: pc,
          address: address.trim(),
          frequency,
          extraBags: clampInt(extraBags, 0, 10),
          useOwnBin: !!useOwnBin,
          startDate, // ✅ chosen first collection date (YYYY-MM-DD)
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.error || `Subscribe failed (${res.status})`);
        setSubmitting(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      setSubmitError("Subscribe failed: no checkout URL returned.");
      setSubmitting(false);
    } catch (e) {
      setSubmitError(e?.message || "Subscribe failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Bins & Bags</h1>
            <p className="mt-1 text-sm text-gray-600">
              Domestic bin collections — simple, reliable, ops-first.
            </p>
          </div>
          <Link
            href="/my-bins"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Customer portal
          </Link>
        </div>

        {/* Postcode check */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">1) Check your postcode</h2>
          <p className="mt-1 text-xs text-gray-600">
            We’ll confirm your collection area and time before you subscribe.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="e.g. CF71 7AA"
            />
            <button
              type="button"
              onClick={onCheckPostcode}
              disabled={checking}
              className={classNames(
                "rounded-lg px-4 py-2 text-sm font-semibold",
                checking ? "bg-gray-400 text-white" : "bg-gray-900 text-white hover:bg-black"
              )}
            >
              {checking ? "Checking…" : "Check"}
            </button>
          </div>

          {checkError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {checkError}
            </div>
          ) : null}

          {covered ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="font-semibold">✅ We cover {routeResult.postcode}.</div>

              <div className="mt-2">
                <div className="text-sm">
                  <span className="font-semibold">Area:</span>{" "}
                  {routeResult.default.route_area}
                </div>

                <div className="mt-2 text-sm">
                  <div className="font-semibold">Collections:</div>
                  <ul className="mt-1 list-disc pl-5">
                    {matchesSorted.map((m, i) => (
                      <li key={`${m.route_area_id || i}-${m.route_day}-${m.slot}-${i}`}>
                        {m.route_day}
                        {m.slot && m.slot !== "ANY" ? ` ${m.slot}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 rounded-xl bg-white/60 p-3 text-xs text-emerald-900">
                  <div className="font-semibold">Choose your first collection start date</div>
                  <div className="mt-1 text-emerald-800">
                    Your normal collection day is{" "}
                    <span className="font-semibold">{routeDay}</span>.
                  </div>

                  <div className="mt-2">
                    <select
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      {startOptions.map((ymd) => (
                        <option key={ymd} value={ymd}>
                          {formatStartOption(ymd)}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-emerald-800">
                      This will be your <span className="font-semibold">first</span> collection date.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-3 text-xs text-gray-500">
            If you’re out of area, you can still contact us — we may expand coverage.
          </div>
        </div>

        {/* Subscription form */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">2) Choose your plan</h2>
          <p className="mt-1 text-xs text-gray-600">
            Card payments only. You can manage, pause, or cancel in the customer portal.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="threeweekly">3-weekly</option>
              </select>
              <div className="mt-1 text-xs text-gray-500">
                Billed {frequencyLabel(frequency)}.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">Extra bags</label>
              <input
                type="number"
                min={0}
                max={10}
                value={extraBags}
                onChange={(e) => setExtraBags(clampInt(e.target.value, 0, 10))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
              <div className="mt-1 text-xs text-gray-500">0–10</div>
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={useOwnBin}
                  onChange={(e) => setUseOwnBin(e.target.checked)}
                />
                I’ll use my own bin (no deposit)
              </label>
            </div>
          </div>

          {/* Exact Stripe-aligned pricing breakdown */}
          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-900">
            <div className="text-sm font-semibold">Pricing (exact)</div>

            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <div>Bin collection ({frequencyLabel(frequency)})</div>
                <div className="font-semibold">{fmtGBP(STRIPE_PRICES.bin)}</div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  Extra bags ({clampInt(extraBags, 0, 10)} × {fmtGBP(STRIPE_PRICES.bag)} {frequencyLabel(frequency)})
                </div>
                <div className="font-semibold">{fmtGBP(STRIPE_PRICES.bag * clampInt(extraBags, 0, 10))}</div>
              </div>

              <div className="flex items-center justify-between">
                <div>Bin deposit (one-off)</div>
                <div className="font-semibold">{fmtGBP(depositApplied ? STRIPE_PRICES.deposit : 0)}</div>
              </div>
            </div>

            <div className="mt-3 border-t border-gray-200 pt-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Due today at checkout</div>
                <div className="text-lg font-semibold">{fmtGBP(dueTodayAtCheckout)}</div>
              </div>

              <div className="mt-1 text-xs text-gray-600">
                Then <span className="font-semibold">{fmtGBP(recurringPerCycle)}</span>{" "}
                {frequencyLabel(frequency)} (until cancelled).
              </div>

              {!covered ? (
                <div className="mt-2 text-xs text-amber-700">
                  Pricing will apply once your postcode is confirmed in-area.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Customer details */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">3) Your details</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700">Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="House number + street + town"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">Name (optional)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Owain"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700">Phone (optional)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="07..."
              />
            </div>
          </div>

          {submitError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {submitError}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500">
              By subscribing, you agree to recurring charges until cancelled.
            </div>

            <button
              type="button"
              onClick={subscribe}
              disabled={submitting || !covered || !startDate}
              className={classNames(
                "rounded-lg px-5 py-2 text-sm font-semibold",
                submitting || !covered || !startDate
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-black"
              )}
              title={
                !covered
                  ? "Check your postcode first"
                  : !startDate
                  ? "Choose your first collection date"
                  : "Continue to payment"
              }
            >
              {submitting ? "Redirecting…" : "Continue to payment"}
            </button>
          </div>

          {!covered ? (
            <div className="mt-2 text-xs text-gray-500">
              You must check your postcode and be in-area before subscribing.
            </div>
          ) : null}

          {covered && !startDate ? (
            <div className="mt-2 text-xs text-gray-500">
              Choose your first collection date before continuing.
            </div>
          ) : null}
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          Ops? Go to{" "}
          <Link
            href="/ops/dashboard"
            className="font-medium text-gray-900 underline decoration-gray-300 hover:decoration-gray-900"
          >
            /ops/dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
