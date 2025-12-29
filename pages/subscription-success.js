import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";

export default function SubscriptionSuccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sub, setSub] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const session_id = params.get("session_id");

      if (!session_id) {
        setError("Missing session_id. Please check your Stripe redirect URL.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/get-subscription-by-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || "Could not confirm subscription.");
          setLoading(false);
          return;
        }

        setSub(data.subscription || null);
        setLoading(false);
      } catch (e) {
        setError("Network error confirming subscription.");
        setLoading(false);
      }
    };

    run();
  }, []);

  async function openPortal() {
    try {
      setPortalError("");
      setPortalLoading(true);

      const res = await fetch("/api/create-customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripe_customer_id: sub?.stripe_customer_id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not open portal");
      if (!data?.url) throw new Error("Portal URL missing");

      window.location.href = data.url;
    } catch (e) {
      setPortalError(e?.message || "Portal failed");
      setPortalLoading(false);
    }
  }

  return (
    <Layout title="Subscription confirmed | AROC Waste">
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            {loading ? (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  Subscription confirmed
                </h1>
                <p className="mt-2 text-slate-600">Just confirming your details…</p>
                <div className="mt-6 h-10 w-full animate-pulse rounded-2xl bg-slate-100" />
              </>
            ) : error ? (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  We couldn’t confirm that
                </h1>
                <p className="mt-2 text-slate-600">{error}</p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/bins-bags"
                    className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Back to bins & bags
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Contact us
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  Subscribed ✅
                </h1>
                <p className="mt-2 text-slate-600">
                  Thanks — your subscription is active. We’ll contact you if we need any extra info.
                </p>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="grid gap-3 text-sm">
                    <Row label="Email" value={sub?.email || "—"} />
                    <Row label="Address" value={`${sub?.address || "—"}${sub?.postcode ? `, ${sub.postcode}` : ""}`} />
                    <Row label="Frequency" value={prettyFrequency(sub?.frequency)} />
                    <Row label="Extra bags" value={String(sub?.extra_bags ?? 0)} />
                    <Row
                      label="Bin deposit"
                      value={sub?.use_own_bin ? "Using own bin (no deposit)" : "Deposit paid (our bin)"}
                    />
                    {sub?.route_day ? (
                      <Row
                        label="Route"
                        value={`${sub.route_day}${sub.route_area ? ` (${sub.route_area})` : ""}`}
                      />
                    ) : null}
                    {sub?.next_collection_date ? (
                      <Row label="Next billing period ends" value={sub.next_collection_date} />
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={!sub?.stripe_customer_id || portalLoading}
                    className={[
                      "inline-flex flex-1 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white",
                      !sub?.stripe_customer_id || portalLoading
                        ? "bg-slate-300 cursor-not-allowed"
                        : "bg-indigo-600 hover:opacity-90",
                    ].join(" ")}
                  >
                    {portalLoading ? "Opening…" : "Manage subscription"}
                  </button>

                  <Link
                    href="/"
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Back to home
                  </Link>
                </div>

                {portalError && (
                  <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
                    {portalError}
                  </div>
                )}

                <p className="mt-4 text-xs text-slate-500">
                  You can update payment method, cancel, or change details via the subscription portal.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900 text-right">{value}</div>
    </div>
  );
}

function prettyFrequency(f) {
  if (f === "weekly") return "Weekly";
  if (f === "fortnightly") return "Fortnightly";
  if (f === "threeweekly") return "Three-weekly";
  return f || "—";
}
