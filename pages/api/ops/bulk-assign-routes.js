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

  // --- UI state ---
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Prices are displayed as guidance only — Stripe is the source of truth at checkout.
  // Keep these aligned with your Stripe prices if you want the UI to match exactly.
  const priceGuide = useMemo(() => {
    // You can tweak these numbers if you want — they are only for display.
    // If you want exact pricing displayed, we can add a lightweight pricing API later.
    const base = {
      weekly: 8.0,
      fortnightly: 9.0,
      threeweekly: 10.0,
    };
    const bag = {
      weekly: 2.0,
      fortnightly: 2.0,
      threeweekly: 2.0,
    };
    const deposit = 25.0; // just a guide
    return { base, bag, deposit };
  }, []);

  const covered = checked && routeResult?.in_area && routeResult?.default;
  const matchesSorted = useMemo(
    () => sortMatches(routeResult?.matches),
    [routeResult?.matches]
  );

  const totalGuide = useMemo(() => {
    const base = priceGuide.base[frequency] || 0;
    const bag = (priceGuide.bag[frequency] || 0) * clampInt(extraBags, 0, 10);
    const deposit = useOwnBin ? 0 : priceGuide.deposit;
    return base + bag + deposit;
  }, [priceGuide, frequency, extraBags, useOwnBin]);

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

    // Require postcode coverage check
    if (!covered) {
      setSubmitError("Please check your postcode first.");
      return;
    }

    const pc = routeResult?.postcode || normalizePostcode(postcode);

    if (!email.trim() || !pc || !address.trim()) {
      setSubmitError("Please fill in email, postcode, and address.");
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

          // IMPORTANT:
          // Do NOT send routeDay/routeArea anymore.
          // Backend assigns route from /api/route-lookup and writes route_day/route_area/route_slot + next_collection_date.
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
              Domestic bin collections — ops-first, simple, reliable.
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
            We’ll confirm your collection area and days before you subscribe.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="e.g. CF36 5AA"
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

                {routeResult.default?.next_date ? (
                  <div className="mt-2 text-xs text-emerald-800">
                    Next collection date (default):{" "}
                    <span className="font-semibold">{routeResult.default.next_date}</span>
                  </div>
                ) : null}
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

          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-900">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Estimated total today</div>
              <div className="text-lg font-semibold">{fmtGBP(totalGuide)}</div>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              This is a guide only — Stripe checkout is the source of truth.
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
              disabled={submitting || !covered}
              className={classNames(
                "rounded-lg px-5 py-2 text-sm font-semibold",
                submitting || !covered
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-black"
              )}
              title={!covered ? "Check your postcode first" : "Continue to payment"}
            >
              {submitting ? "Redirecting…" : "Continue to payment"}
            </button>
          </div>

          {!covered ? (
            <div className="mt-2 text-xs text-gray-500">
              You must check your postcode and be in-area before subscribing.
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
