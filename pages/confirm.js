import { useMemo } from "react";
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

export default function ConfirmPage() {
  const router = useRouter();
  const q = router.query;

  const data = useMemo(() => {
    return {
      item: q.item || "",
      title: q.title || "",
      base: q.base || 0,

      date: q.date || "",
      routeDay: q.routeDay || "",
      routeArea: q.routeArea || "",

      time: q.time || "any",
      timeAdd: q.timeAdd || 0,

      remove: q.remove || "no",
      removeAdd: q.removeAdd || 0,

      name: q.name || "",
      email: q.email || "",
      phone: q.phone || "",
      postcode: q.postcode || "",
      address: q.address || "",
      notes: q.notes || "",

      total: q.total || 0,
    };
  }, [q]);

  const hasBasics =
    data.title &&
    data.date &&
    data.name &&
    data.email &&
    data.phone &&
    data.postcode &&
    data.address;

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
              Check the details below. Payment is the next step (we’ll enable it once you’re happy).
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: details */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Collection details</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <div className="text-slate-500">Service</div>
                    <div className="font-semibold text-slate-900">{data.title || "—"}</div>
                  </div>

                  <div>
                    <div className="text-slate-500">Collection date</div>
                    <div className="font-semibold text-slate-900">{formatISO(data.date)}</div>
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

              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Customer details</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <div className="text-slate-500">Name</div>
                    <div className="font-semibold text-slate-900">{data.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Phone</div>
                    <div className="font-semibold text-slate-900">{data.phone || "—"}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-slate-500">Email</div>
                    <div className="font-semibold text-slate-900">{data.email || "—"}</div>
                  </div>
                </div>

                {!hasBasics && (
                  <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                    Some details look missing. Go back and complete the form before payment.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">What happens next?</h2>
                <ol className="mt-4 space-y-2 text-sm text-slate-700 list-decimal pl-5">
                  <li>You’ll pay securely by card (Stripe) — we’ll enable this next.</li>
                  <li>You’ll receive a confirmation email with your booking summary.</li>
                  <li>Our driver collects on your chosen date/time option.</li>
                </ol>
              </div>
            </div>

            {/* Right: pricing summary */}
            <div className="space-y-6">
              <div className="sticky top-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Price summary</h2>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-slate-600">Base price</div>
                    <div className="font-semibold text-slate-900">{money(data.base)}</div>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="text-slate-600">Time option</div>
                    <div className="font-semibold text-slate-900">{money(data.timeAdd)}</div>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="text-slate-600">Remove from property</div>
                    <div className="font-semibold text-slate-900">{money(data.removeAdd)}</div>
                  </div>

                  <div className="border-t border-slate-200 pt-3 flex items-start justify-between gap-4">
                    <div className="font-extrabold text-slate-900">Total</div>
                    <div className="font-extrabold text-slate-900">{money(data.total)}</div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled
                  className="mt-6 w-full rounded-2xl bg-slate-300 px-6 py-3 text-sm font-semibold text-white cursor-not-allowed"
                >
                  Pay now (coming next)
                </button>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold hover:border-slate-300"
                  >
                    Back
                  </button>

                  <Link
                    href="/contact"
                    className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Need help?
                  </Link>
                </div>

                <p className="mt-4 text-xs text-slate-500">
                  Tip: next step is enabling Stripe checkout so customers can pay by card.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center text-sm text-slate-600">
            Prefer to book by phone? Call{" "}
            <a className="font-semibold text-indigo-600 hover:underline" href="tel:01656470040">
              01656 470040
            </a>
            .
          </div>
        </div>
      </div>
    </Layout>
  );
}
