import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";
import { basketClear } from "../utils/basket";

function pounds(pence) {
  const num = Number(pence);
  if (!Number.isFinite(num)) return "";
  return `£${(num / 100).toFixed(2)}`;
}

function moneyGBP(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "£0.00";
  return `£${num.toFixed(2)}`;
}

export default function SuccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [booking, setBooking] = useState(null);

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
        // 1) Finalize (verifies Stripe is paid + marks booking paid)
        const res = await fetch("/api/finalize-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || "Could not verify payment.");
          setLoading(false);
          return;
        }

        const ref = data.bookingRef || "";
        setBookingRef(ref);

        // 2) Pull full booking from Supabase
        const r2 = await fetch(
          `/api/get-booking?bookingRef=${encodeURIComponent(ref)}`
        );
        const d2 = await r2.json();

        if (r2.ok) setBooking(d2.booking || null);

        // ✅ 3) Clear basket after confirmed payment
        try {
          basketClear();
        } catch {
          // ignore
        }

        setLoading(false);
      } catch (e) {
        setError("Network error verifying payment.");
        setLoading(false);
      }
    };

    run();
  }, []);

  const payload = booking?.payload || null;

  const basketItems = useMemo(() => {
    if (!payload || payload.mode !== "basket") return [];
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items
      .filter((x) => x && x.title)
      .map((x) => ({
        title: String(x.title),
        qty: Math.max(1, Number(x.qty || 1)),
        unitPrice: Number(x.unitPrice || 0),
        category: String(x.category || ""),
      }));
  }, [payload]);

  const basketSubtotal = useMemo(() => {
    return basketItems.reduce((sum, it) => {
      const qty = Number(it.qty) || 0;
      const unit = Number(it.unitPrice) || 0;
      return sum + qty * unit;
    }, 0);
  }, [basketItems]);

  const timeAdd = Number(payload?.timeAdd ?? 0);
  const removeAdd = Number(payload?.removeAdd ?? 0);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          {loading ? (
            <>
              <h1 className="text-2xl font-semibold">Payment received</h1>
              <p className="mt-2 text-gray-600">
                Just confirming your booking details…
              </p>
              <div className="mt-6 h-10 w-full animate-pulse bg-gray-100 rounded-lg" />
            </>
          ) : error ? (
            <>
              <h1 className="text-2xl font-semibold">We couldn’t confirm that</h1>
              <p className="mt-2 text-gray-600">{error}</p>
              <div className="mt-6 flex gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-black text-white"
                >
                  Back to home
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2 border"
                >
                  Contact us
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">Booked ✅</h1>
              <p className="mt-2 text-gray-600">
                Thanks — your payment has been received and your booking is confirmed.
              </p>

              <div className="mt-6 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Booking reference</div>
                    <div className="text-xl font-semibold">{bookingRef}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Total paid</div>
                    <div className="text-xl font-semibold">
                      {booking ? pounds(booking.total_pence) : "Paid"}
                    </div>
                  </div>
                </div>

                {booking?.email ? (
                  <div className="mt-3 text-sm text-gray-600">
                    Confirmation will be sent to{" "}
                    <span className="font-medium">{booking.email}</span>
                  </div>
                ) : null}
              </div>

              {booking ? (
                <div className="mt-6 rounded-xl border p-4">
                  <div className="font-semibold">Booking details</div>

                  <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
                    {/* Basket mode details */}
                    {payload?.mode === "basket" ? (
                      <>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-500">Items</span>
                          <span className="font-medium text-right">
                            {basketItems.length} item type{basketItems.length === 1 ? "" : "s"}
                          </span>
                        </div>

                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="space-y-2">
                            {basketItems.map((it, idx) => (
                              <div
                                key={`${it.title}-${idx}`}
                                className="flex items-start justify-between gap-4"
                              >
                                <div className="text-gray-700">
                                  <div className="font-medium">
                                    {it.title} × {it.qty}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {it.category ? `${it.category} • ` : ""}
                                    {moneyGBP(it.unitPrice)} each
                                  </div>
                                </div>
                                <div className="font-medium text-right">
                                  {moneyGBP(it.unitPrice * it.qty)}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 border-t pt-3 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Items subtotal</span>
                              <span className="font-medium">{moneyGBP(basketSubtotal)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Time option</span>
                              <span className="font-medium">{moneyGBP(timeAdd)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Remove from property</span>
                              <span className="font-medium">{moneyGBP(removeAdd)}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Single mode details (existing) */
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Item</span>
                        <span className="font-medium text-right">{booking.title}</span>
                      </div>
                    )}

                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Collection date</span>
                      <span className="font-medium text-right">
                        {booking.collection_date}
                      </span>
                    </div>

                    {payload?.time ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Time option</span>
                        <span className="font-medium text-right">
                          {payload.time}
                          {Number(payload.timeAdd) > 0
                            ? ` (+£${Number(payload.timeAdd).toFixed(2)})`
                            : ""}
                        </span>
                      </div>
                    ) : null}

                    {payload?.remove ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Remove from property</span>
                        <span className="font-medium text-right">
                          {payload.remove}
                          {Number(payload.removeAdd) > 0
                            ? ` (+£${Number(payload.removeAdd).toFixed(2)})`
                            : ""}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Postcode</span>
                      <span className="font-medium text-right">{booking.postcode}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Address</span>
                      <span className="font-medium text-right">{booking.address}</span>
                    </div>

                    {booking.notes ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Notes</span>
                        <span className="font-medium text-right">{booking.notes}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-black text-white"
                >
                  Back to home
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2 border"
                >
                  Contact us
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
