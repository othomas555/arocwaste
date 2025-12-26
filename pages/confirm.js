import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/layout";

function labelTimeOption(v) {
  if (v === "morning") return "Morning (+£10)";
  if (v === "afternoon") return "Afternoon (+£10)";
  if (v === "twohour") return "2-hour slot (+£25)";
  return "Any time (£0)";
}

export default function ConfirmPage() {
  const router = useRouter();
  const q = router.query;

  const total = q.total ? Number(q.total) : null;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold">Confirmation (placeholder)</h1>
          <p className="mt-2 text-gray-600">
            This page is just to prove the booking flow works. No payment is taken.
          </p>

          <div className="mt-6 grid gap-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Item</div>
              <div className="mt-1 text-lg font-medium text-gray-900">
                {q.title || q.item || "—"}
              </div>
              {q.base && (
                <div className="mt-1 text-sm text-gray-600">Base price: £{q.base}</div>
              )}
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium text-gray-900">Chosen options</div>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <div>
                  <span className="text-gray-500">Collection date:</span>{" "}
                  <span className="font-medium text-gray-900">{q.date || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Time:</span>{" "}
                  <span className="font-medium text-gray-900">{labelTimeOption(q.time)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Remove from property:</span>{" "}
                  <span className="font-medium text-gray-900">
                    {q.remove === "yes" ? "Yes (+£20)" : "No (£0)"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium text-gray-900">Customer details</div>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <div>
                  <span className="text-gray-500">Name:</span>{" "}
                  <span className="font-medium text-gray-900">{q.name || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Email:</span>{" "}
                  <span className="font-medium text-gray-900">{q.email || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Phone:</span>{" "}
                  <span className="font-medium text-gray-900">{q.phone || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Postcode:</span>{" "}
                  <span className="font-medium text-gray-900">{q.postcode || "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Address:</span>{" "}
                  <span className="font-medium text-gray-900">{q.address || "—"}</span>
                </div>
                {q.notes ? (
                  <div>
                    <span className="text-gray-500">Notes:</span>{" "}
                    <span className="font-medium text-gray-900">{q.notes}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl bg-black p-4 text-white flex items-center justify-between">
              <div className="font-semibold">Total</div>
              <div className="text-xl font-semibold">
                {total === null || Number.isNaN(total) ? "—" : `£${total}`}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Link
                href="/appliances"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-gray-900 hover:bg-gray-50"
              >
                Back to appliances
              </Link>

              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
              >
                Back to edit
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
