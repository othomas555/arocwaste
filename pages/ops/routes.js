import { useMemo, useState } from "react";

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfISOWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function OpsRoutes() {
  const thisMonday = useMemo(() => startOfISOWeekMonday(new Date()), []);
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [weekStart, setWeekStart] = useState(toISODate(thisMonday));
  const [frequency, setFrequency] = useState("all");
  const [dueOnly, setDueOnly] = useState(true);
  const [postcode, setPostcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [undoingId, setUndoingId] = useState(null);
  const [rows, setRows] = useState([]);
  const [collectedDates, setCollectedDates] = useState({}); // { [subId]: 'YYYY-MM-DD' }
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ops/route-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          frequency,
          dueOnly,
          postcode: postcode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load route list");

      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);

      // Default collected date to TODAY for any new rows
      setCollectedDates((prev) => {
        const copy = { ...prev };
        for (const r of nextRows) {
          if (!copy[r.id]) copy[r.id] = todayISO;
        }
        return copy;
      });
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function markCollected(subscriptionId) {
    setMarkingId(subscriptionId);
    setError("");

    const collectedDate = collectedDates[subscriptionId] || todayISO;

    try {
      const res = await fetch("/api/ops/mark-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          collectedDate, // default is "today" because we set it that way
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to mark collected");

      setRows((prev) =>
        prev.map((r) =>
          r.id === subscriptionId
            ? {
                ...r,
                next_collection_date: data.next_collection_date || r.next_collection_date,
                is_due: false,
              }
            : r
        )
      );
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setMarkingId(null);
    }
  }

  async function undoCollected(subscriptionId) {
    const ok = window.confirm(
      "Undo last collection for this customer?\n\nThis will revert next collection date and remove the most recent log entry."
    );
    if (!ok) return;

    setUndoingId(subscriptionId);
    setError("");

    try {
      const res = await fetch("/api/ops/undo-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to undo");

      setRows((prev) =>
        prev.map((r) =>
          r.id === subscriptionId
            ? {
                ...r,
                next_collection_date: data.next_collection_date || r.next_collection_date,
                // If the reverted date lands inside the selected week, it may now be due again.
                // Easiest: refresh the list if you want perfect accuracy; but we’ll do a light heuristic:
                is_due: true,
              }
            : r
        )
      );
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setUndoingId(null);
    }
  }

  const weekStartDate = new Date(weekStart + "T00:00:00");
  const weekEndDate = addDays(weekStartDate, 6);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ops · Route List</h1>
            <p className="text-sm text-gray-600">
              Week: <span className="font-medium">{toISODate(weekStartDate)}</span> →{" "}
              <span className="font-medium">{toISODate(weekEndDate)}</span>
            </p>
          </div>

          <button
            onClick={load}
            className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Loading..." : "Load list"}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-xs font-semibold text-gray-700">Week starting (Mon)</label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="three-weekly">Three-weekly</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dueOnly}
                  onChange={(e) => setDueOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Due only
              </label>
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs font-semibold text-gray-700">Postcode contains</label>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="e.g. CF33"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="text-sm font-semibold text-gray-900">
              {rows.length} {rows.length === 1 ? "stop" : "stops"}
            </div>
            <div className="text-xs text-gray-500">
              Default collected date is <span className="font-semibold">today</span>.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-700">
                <tr>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Postcode</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Frequency</th>
                  <th className="px-4 py-3">Extra</th>
                  <th className="px-4 py-3">Next</th>
                  <th className="px-4 py-3">Collected date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {r.is_due ? (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                          DUE
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.route_area || "—"}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.customer_name || "—"}</td>
                    <td className="px-4 py-3">{r.postcode || "—"}</td>
                    <td className="px-4 py-3">{r.address || "—"}</td>
                    <td className="px-4 py-3">{r.frequency || "—"}</td>
                    <td className="px-4 py-3">{Number.isFinite(r.extra_bags) ? r.extra_bags : "—"}</td>
                    <td className="px-4 py-3">{r.next_collection_date || "—"}</td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={collectedDates[r.id] || todayISO}
                        onChange={(e) =>
                          setCollectedDates((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => markCollected(r.id)}
                          disabled={!r.is_due || markingId === r.id}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                          title={!r.is_due ? "Only available for due stops" : "Mark collected"}
                        >
                          {markingId === r.id ? "Saving..." : "Mark collected"}
                        </button>

                        <button
                          onClick={() => undoCollected(r.id)}
                          disabled={undoingId === r.id}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                          title="Undo last collection"
                        >
                          {undoingId === r.id ? "Undoing..." : "Undo"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-gray-600" colSpan={10}>
                      No rows loaded yet. Click <span className="font-semibold">Load list</span>.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
