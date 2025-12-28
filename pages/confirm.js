import { useMemo, useState } from "react";
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

  const data = useMemo(() => {
    const mode = String(q.mode || "");

    // Basket mode: items passed as encoded JSON string
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
      const total = Number(q.total ?? itemsSubtotal + timeAdd + removeAdd);

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

        total,
      };
    }

    // Default: single item mode (existing behaviour)
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

      total: Number(q.total ?? 0),
    };
  }, [q]);

  const hasBasics =
    data.date &&
    data.name &&
    data.email &&
    data.phone &&
    data.postcode &&
    data.address &&
    (data.mode === "basket" ? data.items?.length > 0 : !!data.title);

  async function payNow() {
    try {
      setPayError("");
      setPaying(true);

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Payment error");
      }

      if (!json?.url) {
        throw new Error("Stripe did not return a checkout URL.");
      }

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
            <p className="mt-2 text-slate-600">
              Check the details below. Payment is the next step.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Collection details</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                  <div className="sm:col-span-2">
                    <div className="text-slate-500">Service</div>

                    {data.mode === "basket" ? (
                      <div className="mt-2 space-y-2">
                        {data.items.map((it) => (
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
                          {data.title} × {data.qty}
                        </div>
                        <div className="text-xs text-slate-500">£{data.base} each</div>
                      </>
                    )}
                  </div>

                  <div>
                    <div className="text-slate-500">Collection date</div>
                    <div className="font-semibold text-slate-900">
                      {formatISO(data.date)}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Time option</div>
                    <div className="font-semibold text-slate-900">
                      {prettyTimeOption(data.time)}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">Remove from property</div>
                    <div className="font-semibold text-slate-900">
                      {data.remove === "yes" ? "Yes (+£20)" : "No"}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="text-slate-500">Address</div>
                    <div className="font-semibold text-slate-900">
                      {data.address}
                      {data.postcode ? `, ${data.postcode}` : ""}
                    </div>
                  </div>

                  {data.routeDay && (
                    <div className="sm:col-span-2">
                      <div className="text-slate-500">Route</div>
                      <div className="font-semibold text-slate-900">
                        {data.routeArea ? `${data.routeArea} — ` : ""}
                        {data.routeDay}
                      </div>
                    </div>
                  )}

                  {data.notes && (
                    <div className="sm:col-span-2">
                      <div className="text-slate-500">Notes</div>
                      <div className="text-slate-900">{data.notes}</div>
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
                  {data.mode === "basket" ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Items subtotal</span>
                      <span className="font-semibold">{money(data.itemsSubtotal)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Items ({data.qty} × £{data.base})
                      </span>
                      <span className="font-semibold">{money(data.base * data.qty)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-600">Time option</span>
                    <span className="font-semibold">{money(data.timeAdd)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">Remove from property</span>
                    <span className="font-semibold">{money(data.removeAdd)}</span>
                  </div>

                  <div className="border-t pt-3 flex justify-between">
                    <span className="font-extrabold">Total</span>
                    <span className="font-extrabold">{money(data.total)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={payNow}
                  disabled={!hasBasics || paying}
                  className={[
                    "mt-6 w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white",
                    !hasBasics || paying
                      ? "bg-slate-300 cursor-not-allowed"
                      : "bg-indigo-600 hover:opacity-90",
                  ].join(" ")}
                >
                  {paying ? "Redirecting to Stripe..." : "Pay now"}
                </button>

                {payError && (
                  <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
                    {payError}
                  </div>
                )}

                {data.mode === "basket" && (
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
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
