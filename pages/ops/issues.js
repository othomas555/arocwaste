// pages/ops/issues.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

async function readJsonOrText(res) {
  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (ct.includes("application/json")) {
    try {
      return { ok: true, json: JSON.parse(text), raw: text };
    } catch {
      return { ok: false, json: null, raw: text };
    }
  }
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, json: null, raw: text };
  }
}

function clean(s) {
  return String(s || "").trim();
}

export default function OpsIssuesPage() {
  const [status, setStatus] = useState("open"); // open|closed|all
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState([]);

  const [closingId, setClosingId] = useState("");
  const [actionById, setActionById] = useState({});
  const [outcomeById, setOutcomeById] = useState({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/issues/list?status=${encodeURIComponent(status)}`);
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to load issues");
      setIssues(Array.isArray(parsed?.json?.issues) ? parsed.json.issues : []);
    } catch (e) {
      setIssues([]);
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function closeIssue(issue) {
    const id = String(issue?.id || "");
    if (!id) return;

    const action = clean(actionById[id] || "");
    const outcome = clean(outcomeById[id] || "");

    if (!action) {
      setError("Add an action note before closing.");
      return;
    }

    setClosingId(id);
    setError("");
    try {
      const res = await fetch("/api/ops/issues/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_id: id,
          resolution_action: action,
          resolution_outcome: outcome,
        }),
      });

      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to close issue");

      setActionById((prev) => ({ ...prev, [id]: "" }));
      setOutcomeById((prev) => ({ ...prev, [id]: "" }));
      await load();
    } catch (e) {
      setError(e?.message || "Failed to close issue");
    } finally {
      setClosingId("");
    }
  }

  const openCount = useMemo(() => issues.filter((x) => !x.resolved_at).length, [issues]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ops • Issues</h1>
            <p className="text-sm text-slate-600">Actionable problems raised by drivers. Add action notes, then close.</p>
          </div>

          <div className="flex gap-2">
            <Link href="/ops/dashboard" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Dashboard
            </Link>
            <Link href="/ops/daily-runs" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Day Planner
            </Link>
            <Link href="/ops/today" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Today
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">
              {status === "open" ? "Open issues" : status === "closed" ? "Closed issues" : "All issues"}
              {status === "open" ? <span className="ml-2 text-slate-500">({openCount})</span> : null}
            </div>

            <div className="flex gap-2">
              {["open", "closed", "all"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cx(
                    "rounded-lg px-3 py-2 text-sm font-semibold ring-1",
                    status === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-900 ring-slate-200 hover:bg-slate-50"
                  )}
                >
                  {s.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                onClick={load}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-600">Loading issues…</div>
          </div>
        ) : issues.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
            No issues.
          </div>
        ) : (
          <div className="space-y-2 pb-10">
            {issues.map((x) => {
              const isClosed = !!x.resolved_at;
              const stopType = clean(x.stop_type).toLowerCase();
              const stop = x.stop || null;

              const run = x.run || null;
              const runLabel = run
                ? `${run.run_date} • ${run.route_area} • ${run.route_day} • ${String(run.route_slot || "ANY").toUpperCase()}`
                : "—";

              const addr = clean(stop?.address);
              const pc = clean(stop?.postcode);

              const title = stopType === "booking" ? clean(stop?.booking_ref) || "Booking" : "Subscription";

              const closing = closingId === x.id;

              return (
                <div key={x.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cx(
                            "rounded-full px-2 py-1 text-[11px] font-extrabold ring-1",
                            stopType === "booking"
                              ? "bg-blue-100 text-blue-900 ring-blue-200"
                              : "bg-red-100 text-red-900 ring-red-200"
                          )}
                        >
                          {stopType === "booking" ? "ONE-OFF" : "WHEELIE BIN"}
                        </span>

                        {!isClosed ? (
                          <span className="rounded-full bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-amber-700">
                            OPEN
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                            CLOSED
                          </span>
                        )}

                        <span className="text-sm font-semibold text-slate-900">{title}</span>

                        <Link
                          href={run ? `/ops/run/${run.id}` : "#"}
                          className={cx(
                            "text-xs font-semibold underline",
                            run ? "text-slate-700" : "text-slate-400 pointer-events-none"
                          )}
                        >
                          View run
                        </Link>
                      </div>

                      <div className="mt-2 text-sm font-semibold text-slate-900">{addr || "— address missing —"}</div>
                      <div className="mt-1 text-xs text-slate-600">{pc || ""}</div>

                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                        <span className="font-semibold">Reason:</span> {clean(x.reason) || "—"}
                        {clean(x.details) ? <span className="ml-2">• {clean(x.details)}</span> : null}
                      </div>

                      <div className="mt-2 text-xs text-slate-600">Run: {runLabel}</div>

                      {isClosed ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                          <div>
                            <span className="font-semibold">Action:</span> {clean(x.resolution_action) || "—"}
                          </div>
                          {clean(x.resolution_outcome) ? (
                            <div className="mt-1">
                              <span className="font-semibold">Outcome:</span> {clean(x.resolution_outcome)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <div className="text-xs font-semibold text-slate-800">Office action (required to close)</div>

                          <label className="mt-2 block text-[11px] font-semibold text-slate-600">Action</label>
                          <textarea
                            value={actionById[x.id] ?? ""}
                            onChange={(e) => setActionById((prev) => ({ ...prev, [x.id]: e.target.value }))}
                            placeholder="e.g. Called customer, explained contamination; rebooked for Tue"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            rows={2}
                          />

                          <label className="mt-2 block text-[11px] font-semibold text-slate-600">Outcome (optional)</label>
                          <input
                            value={outcomeById[x.id] ?? ""}
                            onChange={(e) => setOutcomeById((prev) => ({ ...prev, [x.id]: e.target.value }))}
                            placeholder="e.g. Customer agreed; job created; driver notified"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          />

                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => closeIssue(x)}
                              disabled={closing}
                              className={cx(
                                "rounded-lg px-4 py-2 text-sm font-semibold",
                                closing ? "bg-slate-300 text-slate-600" : "bg-emerald-600 text-white hover:bg-emerald-700"
                              )}
                            >
                              {closing ? "Closing…" : "Close issue"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
