import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/layout";

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "£0.00";
  return `£${num.toFixed(2)}`;
}

function formatISO(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function prettyTimeOption(key) {
  if (key === "morning") return "Morning (+£10)";
  if (key === "afternoon") return "Afternoon (+£10)";
  if (key === "twohour") return "2-hour slot (+£25)";
  return "Any time";
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export default function ConfirmPage() {
  const router = useRouter();
  const q = router.query;

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settings, setSettings] = useState({
    small_order_threshold_pounds: 25,
    small_order_fee_pounds: 20,
  });

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      try {
        setSettingsLoading(true);
        const res = await fetch("/api/public-settings");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load settings");
        if (!mounted) return;
        setSettings({
          small_order_threshold_pounds: Number(json.small_order_threshold_pounds ?? 25),
          small_order_fee_pounds: Number(json.small_order_fee_pounds ?? 20),
        });
      } catch {
        // keep defaults
      } finally {
        if (mounted) setSettingsLoading(false);
      }
    }
    loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const baseData = useMemo(() => {
    const mode = String(q.mode || "");

    if (mode === "basket" && q.items) {
      const raw = typeof q.items === "string" ? q.items : String(q.items || "");
      const decoded = decodeURIComponent(raw);
      const items = safeParseJSON(decoded, []);

      const cleanItems = Array.isArray(items)
        ? items
            .filter((x) => x && x.title)
            .map((x) => ({
              id: String(x.id || ""),
              category: String(x.category || ""),
              slug: String(x.slug || ""),
              title: String(x.title || ""),
              unitPrice: Number(x.unitPrice || 0),
              qty: Math.max(1, Number(x.qty || 1)),
            }))
        : [];

      const itemsSubtotal = cleanItems.reduce((sum, it) => {
        const unit = Number(it.unitPrice) || 0;
        const qty = Math.max(1, Number(it.qty) || 1);
        return sum + unit * qty;
      }, 0);

      const timeAdd = Number(q.timeAdd ?? 0);
      const removeAdd = Number(q.removeAdd ?? 0);

      return {
        mode: "basket",
        items: cleanItems,
        itemsSubtotal,

        date: q.date || "",
        routeDay: q.routeDay || "",
        routeArea: q.routeArea || "",

        time: q.time || "any",
        timeAdd,

        remove: q.remove || "no",
        removeAdd,

        name: q.name || "",
        email: q.email || "",
        phone: q.phone || "",
        postcode: q.postcode || "",
        address: q.address || "",
        notes: q.notes || "",
      };
    }

    const base = Number(q.base ?? 0);
    const qty = Math.max(1, Number(q.qty ?? 1));

    return {
      mode: "single",
      item: q.item || "",
      title: q.title || "",
      base,
      qty,

      date: q.date || "",
      routeDay: q.routeDay || "",
      routeArea: q.routeArea || "",

      time: q.time || "any",
      timeAdd: Number(q.timeAdd ?? 0),

      remove: q.remove || "no",
      removeAdd: Number(q.removeAdd ?? 0),

      name: q.name || "",
      email: q.email || "",
      phone: q.phone || "",
      postcode: q.postcode || "",
      address: q.address || "",
      notes: q.notes || "",
    };
  }, [q]);

  const computed = useMemo(() => {
    if (baseData.mode !== "basket") {
      const total = (Number(baseData.base) || 0) * (Number(baseData.qty) || 1) + (Number(baseData.timeAdd) || 0) + (Number(baseData.removeAdd) || 0);
      return { ...baseData, total, smallOrderFee: 0 };
    }

    const threshold = Number(settings.small_order_threshold_pounds ?? 25);
    const fee = Number(settings.small_order_fee_pounds ?? 20);

    const itemsSubtotal = Number(baseData.itemsSubtotal) || 0;
    const timeAdd = Number(baseData.timeAdd) || 0;
    const removeAdd = Number(baseData.removeAdd) || 0;

    const smallOrderFee =
      Number.isFinite(threshold) &&
      Number.isFinite(fee) &&
      threshold > 0 &&
      fee > 0 &&
      itemsSubtotal > 0 &&
      itemsSubtotal < threshold
        ? fee
        : 0;

    const total = itemsSubtotal + timeAdd + removeAdd + smallOrderFee;

    return { ...baseData, smallOrderFee, total };
  }, [baseData, settings]);

  const hasBasics =
    computed.date &&
    computed.name &&
    computed.email &&
    computed.phone &&
    computed.postcode &&
    computed.address &&
    (computed.mode === "basket" ? computed.items?.length > 0 : !!computed.title);

  async function payNow() {
    try {
      setPayError("");
      setPaying(true);

      const payload = { ...computed };

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Payment error");
      if (!json?.url) throw new Error("Stripe did not return a checkout URL.");

      window.location.href = json.url;
    } catch (e) {
      setPayError(e?.message || "Payment failed");
      setPaying(false);
    }
  }

  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-6">
            <Link href="/" className="text-sm text-slate-600 hover:underline">
              ← Back to home
            </Link>
            <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Confirm your booking
            </h1>
            <p className="mt-2 text-slate-600">Check the details below. Payment is the next step.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Collection details</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                  <div className="sm:col-span-2">
                    <div className="text-slate-500">Service</div>

                    {computed.mode === "basket" ? (
                      <div className="mt-2 space-y-2">
                        {computed.items.map((it) => (
                          <div
                            key={it.id || `${it.category}:${it.slug}:${it.title}`}
                            className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-3"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">
                                {it.title} × {it.qty}
                              </div>
                              <div className="text-xs text-slate-500">
                                £{Number(it.unitPrice).toFixed(2)} each • {it.category}
                              </div>
                            </div>
                            <div className="font-semibold text-slate-900">
                              {money((Number(it.unitPrice) || 0) * (Number(it.qty) || 0))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-900">
                          {computed.title} × {computed.qty}
                        </div>
                        <div className="text-xs text-slate-500">£{computed.base} each</div>
                      </>
                    )}
                  </div>

                  <div>
                    <div className="text-slate-500">Collection date</div>
                    <div className="font-semibold text-slate-900">{formatISO(computed.date)}</div>
                  </div>

                  <div>
                    <div className="text-slate-500">Time option</div>
                    <div className="font-semibold text-slate-900">{prettyTimeOption(computed.time)}</div>
                  </div>

                  <div>
                    <div className="text-slate-500">Remove from property</div>
                    <div className="font-semibold text-slate-900">{computed.remove === "yes" ? "Yes (+£20)" : "No"}</div>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="text-slate-500">Address</div>
                    <div className="font-semibold text-slate-900">
                      {computed.address}
                      {computed.postcode ? `, ${computed.postcode}` : ""}
                    </div>
                  </div>

                  {computed.routeDay && (
                    <div className="sm:col-span-2">
                      <div className="text-slate-500">Route</div>
                      <div className="font-semibold text-slate-900">
                        {computed.routeArea ? `${computed.routeArea} — ` : ""}
                        {computed.routeDay}
                      </div>
                    </div>
                  )}

                  {computed.notes && (
                    <div className="sm:col-span-2">
                      <div className="text-slate-500">Notes</div>
                      <div className="text-slate-900">{computed.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="space-y-6">
              <div className="sticky top-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Price summary</h2>

                <div className="mt-4 space-y-3 text-sm">
                  {computed.mode === "basket" ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Items subtotal</span>
                      <span className="font-semibold">{money(computed.itemsSubtotal)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Items ({computed.qty} × £{computed.base})
                      </span>
                      <span className="font-semibold">{money(computed.base * computed.qty)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-600">Time option</span>
                    <span className="font-semibold">{money(computed.timeAdd)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">Remove from property</span>
                    <span className="font-semibold">{money(computed.removeAdd)}</span>
                  </div>

                  {computed.mode === "basket" ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Small order service charge
                        {settingsLoading ? " (loading…)" : ""}
                      </span>
                      <span className="font-semibold">{money(computed.smallOrderFee)}</span>
                    </div>
                  ) : null}

                  <div className="border-t pt-3 flex justify-between">
                    <span className="font-extrabold">Total</span>
                    <span className="font-extrabold">{money(computed.total)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={payNow}
                  disabled={!hasBasics || paying || (computed.mode === "basket" && settingsLoading)}
                  className={[
                    "mt-6 w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white",
                    !hasBasics || paying || (computed.mode === "basket" && settingsLoading)
                      ? "bg-slate-300 cursor-not-allowed"
                      : "bg-indigo-600 hover:opacity-90",
                  ].join(" ")}
                >
                  {paying ? "Redirecting to Stripe..." : "Pay now"}
                </button>

                {payError && (
                  <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{payError}</div>
                )}

                {computed.mode === "basket" && (
                  <div className="mt-4">
                    <Link
                      href="/basket"
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    >
                      Edit basket
                    </Link>
                  </div>
                )}
              </div>

              {computed.mode === "basket" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
                  Small order rule: if items subtotal is under £{Number(settings.small_order_threshold_pounds ?? 25).toFixed(0)},
                  a £{Number(settings.small_order_fee_pounds ?? 20).toFixed(0)} service charge applies.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
