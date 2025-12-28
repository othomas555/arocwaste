import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";

export default function SuccessPage() {
  const [state, setState] = useState({
    loading: true,
    error: "",
    bookingRef: "",
    booking: null,
    session: null,
    warning: "",
  });

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const session_id = params.get("session_id");

      if (!session_id) {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Missing session_id. Please check your Stripe redirect URL.",
        }));
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
          setState((s) => ({
            ...s,
            loading: false,
            error: data?.error || "Could not verify payment.",
          }));
          return;
        }

        setState({
          loading: false,
          error: "",
          bookingRef: data.bookingRef || "",
          booking: data.booking || null,
          session: data.session || null,
          warning: data.warning || "",
        });
      } catch (e) {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Network error verifying payment.",
        }));
      }
    };

    run();
  }, []);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          {state.loading ? (
            <>
              <h1 className="text-2xl font-semibold">Payment received</h1>
              <p className="mt-2 text-gray-600">
                Just confirming your booking details…
              </p>
              <div className="mt-6 h-10 w-full animate-pulse bg-gray-100 rounded-lg" />
            </>
          ) : state.error ? (
            <>
              <h1 className="text-2xl font-semibold">We couldn’t confirm that</h1>
              <p className="mt-2 text-gray-600">{state.error}</p>
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

              {state.warning ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm">
                  {state.warning}
                </div>
              ) : null}

              <div className="mt-6 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Booking reference</div>
                    <div className="text-xl font-semibold">{state.bookingRef}</div>
                  </div>
                  {state.session?.amount_total != null ? (
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Paid</div>
                      <div className="text-xl font-semibold">
                        £{(state.session.amount_total / 100).toFixed(2)}
                      </div>
                    </div>
                  ) : null}
                </div>

                {state.booking?.customer?.email ? (
                  <div className="mt-3 text-sm text-gray-600">
                    Confirmation sent to <span className="font-medium">{state.booking.customer.email}</span>
                  </div>
                ) : null}
              </div>

              {state.booking?.booking ? (
                <div className="mt-6 rounded-xl border p-4">
                  <div className="font-semibold">Booking summary</div>
                  <pre className="mt-3 text-xs bg-gray-50 p-3 rounded-lg overflow-auto">
                    {JSON.stringify(state.booking.booking, null, 2)}
                  </pre>
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
