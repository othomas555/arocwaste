import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";

export default function SuccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingRef, setBookingRef] = useState("");

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

        setBookingRef(data.bookingRef || "");
        setLoading(false);
      } catch (e) {
        setError("Network error verifying payment.");
        setLoading(false);
      }
    };

    run();
  }, []);

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
                  href="/confirm"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2 border"
                >
                  Back to confirm
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">Booked ✅</h1>
              <p className="mt-2 text-gray-600">
                Thanks — your payment has been received and your booking is confirmed.
              </p>

              <div className="mt-6 rounded-xl border p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-500">Booking reference</div>
                  <div className="text-xl font-semibold">{bookingRef}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Status</div>
                  <div className="text-xl font-semibold">Paid</div>
                </div>
              </div>

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
