import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";

function pounds(pence) {
  if (typeof pence !== "number") return "";
  return `£${(pence / 100).toFixed(2)}`;
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
        const r2 = await fetch(`/api/get-booking?bookingRef=${encodeURIComponent(ref)}`);
        const d2 = await r2.json();

        if (r2.ok) setBooking(d2.booking || null);

        setLoading(false);
      } catch (e) {
        setError("Network error verifying payment.");
        setLoading(false);
      }
    };

    run();
  }, []);

  const payload = booking?.payload || null;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          {loading ? (
            <>
              <h1 className="text-2xl font-semibold">Payment received</h1>
              <p className="mt-2 text-gray-600">Just confirming your booking details…</p>
              <div className="mt-6 h-10 w-full animate-pulse bg-gray-100 rounded-lg" />
            </>
          ) : error ? (
            <>
              <h1 className="text-2xl font-semibold">We couldn’t confirm that</h1>
              <p className="mt-2 text-gray-600">{error}</p>
              <div className="mt-6 flex gap-3">
                <Link href="/" className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-black text-white">
                  Back to home
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center rounded-xl px-4 py-2 border">
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
                    Confirmation will be sent to <span className="font-medium">{booking.email}</span>
                  </div>
                ) : null}
              </div>

              {booking ? (
                <div className="mt-6 rounded-xl border p-4">
                  <div className="font-semibold">Booking details</div>

                  <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Item</span>
                      <span className="font-medium text-right">{booking.title}</span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500">Collection date</span>
                      <span className="font-medium text-right">{booking.collection_date}</span>
                    </div>

                    {payload?.time ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Time option</span>
                        <span className="font-medium text-right">
                          {payload.time}
                          {Number(payload.timeAdd) > 0 ? ` (+£${Number(payload.timeAdd).toFixed(2)})` : ""}
                        </span>
                      </div>
                    ) : null}

                    {payload?.remove ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Remove from property</span>
                        <span className="font-medium text-right">
                          {payload.remove}
                          {Number(payload.removeAdd) > 0 ? ` (+£${Number(payload.removeAdd).toFixed(2)})` : ""}
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
                <Link href="/" className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-black text-white">
                  Back to home
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center rounded-xl px-4 py-2 border">
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
