import { useMemo, useState } from "react";
import Layout from "../components/layout";
import { findRouteForPostcode } from "../utils/postcode";

function PricePill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

export default function BinsBagsPage() {
  const [postcode, setPostcode] = useState("");
  const [checked, setChecked] = useState(false);

  const [frequency, setFrequency] = useState("weekly"); // weekly|fortnightly|threeweekly
  const [extraBags, setExtraBags] = useState(0);
  const [useOwnBin, setUseOwnBin] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const route = useMemo(() => {
    if (!checked) return null;
    return findRouteForPostcode(postcode);
  }, [checked, postcode]);

  const covered = checked && !!route;

  const freqLabel =
    frequency === "weekly"
      ? "Weekly"
      : frequency === "fortnightly"
      ? "Fortnightly"
      : "Three-weekly";

  async function subscribe() {
    try {
      setErr("");
      setSubmitting(true);

      const res = await fetch("/api/create-subscription-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode,
          routeDay: route?.day || "",
          routeArea: route?.area || "",
          frequency,
          extraBags,
          useOwnBin,
          name,
          email,
          phone,
          address,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not start subscription checkout");
      if (!json?.url) throw new Error("Stripe did not return a checkout URL.");

      window.location.href = json.url;
    } catch (e) {
      setErr(e?.message || "Subscription failed");
      setSubmitting(false);
    }
  }

  const canSubscribe =
    covered &&
    name.trim() &&
    email.trim() &&
    phone.trim() &&
    address.trim();

  return (
    <Layout
      title="Bins & Bags Subscription | AROC Waste"
      description="Subscribe to regular wheelie bin collection. Choose weekly, fortnightly or three-weekly. Extra bags available."
    >
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Bins & bags subscription
            </h1>
            <p className="mt-2 text-slate-600 max-w-2xl">
              Regular 240L wheelie bin emptying billed per service interval — choose weekly,
              fortnightly or three-weekly. Add extra bags if needed.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <PricePill>£16.80 per empty</PricePill>
              <PricePill>Extra bag £3.20</PricePill>
              <PricePill>£50 bin deposit (or use your own)</PricePill>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: steps */}
            <div className="lg:col-span-2 space-y-6">
              {/* Postcode check */}
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">1) Check your postcode</h2>
                <p className="mt-1 text-sm text-slate-600">
                  We’ll confirm your collection day based on your area.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-slate-700">Postcode</label>
                    <input
                      value={postcode}
                      onChange={(e) => {
                        setPostcode(e.target.value);
                        setChecked(false);
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 uppercase outline-none focus:border-indigo-400"
                      placeholder="e.g. CF33 4XX"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setChecked(true)}
                    className="rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Check area
                  </button>
                </div>

                {checked && covered && (
                  <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                    ✅ We cover your postcode. Your usual collection day is{" "}
                    <span className="font-semibold">{route.day}</span>
                    {route.area ? ` (${route.area})` : ""}.
                  </div>
                )}

                {checked && !covered && (
                  <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
                    Sorry — we don’t cover that postcode yet.
                  </div>
                )}
              </div>

              {/* Plan */}
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">2) Choose your frequency</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Billing matches the schedule: weekly bills every week, fortnightly every 2 weeks, etc.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <PlanCard
                    active={frequency === "weekly"}
                    title="Weekly"
                    subtitle="Billed every 1 week"
                    onClick={() => setFrequency("weekly")}
                  />
                  <PlanCard
                    active={frequency === "fortnightly"}
                    title="Fortnightly"
                    subtitle="Billed every 2 weeks"
                    onClick={() => setFrequency("fortnightly")}
                  />
                  <PlanCard
                    active={frequency === "threeweekly"}
                    title="Three-weekly"
                    subtitle="Billed every 3 weeks"
                    onClick={() => setFrequency("threeweekly")}
                  />
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Extra bags per collection</div>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setExtraBags((n) => Math.max(0, n - 1))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        −
                      </button>
                      <div className="min-w-[44px] text-center text-sm font-semibold text-slate-900">
                        {extraBags}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExtraBags((n) => Math.min(10, n + 1))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        +
                      </button>
                      <div className="text-sm text-slate-600">£3.20 each ({freqLabel})</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Bin deposit</div>
                    <div className="mt-2 text-sm text-slate-600">
                      £50 deposit if you need our bin, or use your own 240L wheelie bin.
                    </div>

                    <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={useOwnBin}
                        onChange={(e) => setUseOwnBin(e.target.checked)}
                      />
                      I will use my own bin (no deposit)
                    </label>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">3) Your details</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" value={name} onChange={setName} />
                  <Field label="Email" value={email} onChange={setEmail} type="email" />
                  <Field label="Phone" value={phone} onChange={setPhone} />
                  <Field label="Address" value={address} onChange={setAddress} wide />
                </div>

                {err && (
                  <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
                    {err}
                  </div>
                )}
              </div>
            </div>

            {/* Right summary */}
            <div className="space-y-6">
              <div className="sticky top-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Summary</h2>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Service</span>
                    <span className="font-semibold">240L bin emptying</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Frequency</span>
                    <span className="font-semibold">{freqLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Price</span>
                    <span className="font-semibold">£16.80 / service</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Extra bags</span>
                    <span className="font-semibold">{extraBags}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Bin deposit</span>
                    <span className="font-semibold">{useOwnBin ? "£0.00" : "£50.00"}</span>
                  </div>

                  {covered ? (
                    <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-emerald-800">
                      Collection day: <span className="font-semibold">{route.day}</span>
                      {route.area ? ` (${route.area})` : ""}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-slate-600">
                      Enter postcode to confirm coverage.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={subscribe}
                  disabled={!canSubscribe || submitting}
                  className={[
                    "mt-6 w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white",
                    !canSubscribe || submitting
                      ? "bg-slate-300 cursor-not-allowed"
                      : "bg-indigo-600 hover:opacity-90",
                  ].join(" ")}
                >
                  {submitting ? "Redirecting to Stripe..." : "Subscribe"}
                </button>

                <p className="mt-3 text-xs text-slate-500">
                  You’ll be able to manage your subscription (card, cancel, etc.) via Stripe’s customer portal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function PlanCard({ active, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl border p-4 text-left shadow-sm transition",
        active
          ? "border-indigo-300 bg-indigo-50"
          : "border-slate-200 bg-white hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-600">{subtitle}</div>
    </button>
  );
}

function Field({ label, value, onChange, type = "text", wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400"
      />
    </div>
  );
}
