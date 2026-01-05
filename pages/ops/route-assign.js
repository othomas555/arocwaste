// pages/ops/route-assign.js
import { useState } from "react";
import Link from "next/link";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function OpsRouteAssign() {
  const [limit, setLimit] = useState(200);
  const [force, setForce] = useState(false);
  const [recomputeNext, setRecomputeNext] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function run(dryRun) {
    setError("");
    setRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/ops/bulk-assign-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          limit: Number(limit || 200),
          force,
          recomputeNext,
          statuses: ["active", "pending"],
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setResult(json);
    } catch (e) {
      setError(e?.message || "Failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Bulk assign routes</h1>
            <p className="text-sm text-gray-600">
              Assign <span className="font-mono">route_area</span>,{" "}
              <span className="font-mono">route_day</span>,{" "}
              <span className="font-mono">route_slot</span> from postcode using your{" "}
              <span className="font-mono">route_areas</span> config.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
            <Link
              href="/ops/routes"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Route areas
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Settings</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700">Limit</label>
              <input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
              <div className="mt-1 text-xs text-gray-500">Max 500 per run.</div>
            </div>

            <div className="flex items-center gap-2 sm:mt-6">
              <input
                id="force"
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              <label htmlFor="force" className="text-sm text-gray-900">
                Force update (overwrite existing routes)
              </label>
            </div>

            <div className="flex items-center gap-2 sm:mt-6">
              <input
                id="recompute"
                type="checkbox"
                checked={recomputeNext}
                onChange={(e) => setRecomputeNext(e.target.checked)}
              />
              <label htmlFor="recompute" className="text-sm text-gray-900">
                Recompute next_collection_date
              </label>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run(true)}
              disabled={running}
              className={classNames(
                "rounded-lg px-4 py-2 text-sm font-semibold",
                running ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white hover:bg-black"
              )}
            >
              {running ? "Running…" : "Dry run"}
            </button>

            <button
              type="button"
              onClick={() => run(false)}
              disabled={running}
              className={classNames(
                "rounded-lg px-4 py-2 text-sm font-semibold",
                running ? "bg-gray-300 text-gray-600" : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              {running ? "Running…" : "Apply changes"}
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Recommended: run Dry run first, then Apply.
          </div>
        </div>

        {result ? (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Result</div>
                <div className="text-xs text-gray-600">
                  dryRun={String(result.dryRun)} • scanned={result.scanned} • updated={result.updated} • noMatch={result.noMatch} • skipped={result.skipped}
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Subscription ID</th>
                    <th className="px-3 py-2 text-left">Postcode</th>
                    <th className="px-3 py-2 text-left">Assigned</th>
                    <th className="px-3 py-2 text-left">Next date</th>
                    <th className="px-3 py-2 text-left">Matched prefix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(result.results || []).slice(0, 200).map((r) => (
                    <tr key={r.id || Math.random()} className="bg-white">
                      <td className="px-3 py-2">
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-800">{r.id || "—"}</td>
                      <td className="px-3 py-2 text-gray-800">{r.postcode || "—"}</td>
                      <td className="px-3 py-2 text-gray-800">
                        {r.to ? (
                          <>
                            {r.to.route_area} • {r.to.route_day} • {r.to.route_slot}
                          </>
                        ) : r.route_area ? (
                          <>
                            {r.route_area} • {r.route_day} • {r.route_slot}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        {r.to?.next_collection_date || r.next_collection_date || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-800">{r.matched_prefix || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Showing first 200 rows only to keep it usable.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
