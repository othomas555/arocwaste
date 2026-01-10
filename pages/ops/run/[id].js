import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
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

export default function OpsRunViewPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [run, setRun] = useState(null);
  const [stops, setStops] = useState([]);
  const [totals, setTotals] = useState({ totalStops: 0, totalExtraBags: 0 });

  // staff assignment UI
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [allStaff, setAllStaff] = useState([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffSavedMsg, setStaffSavedMsg] = useState("");

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    setWarning("");

    try {
      const res = await fetch(`/api/ops/run/${id}`);
      const parsed = await readJsonOrText(res);

      if (!res.ok) {
        const msg =
          parsed?.json?.error ||
          `Run API failed (${res.status}). ${parsed.ok ? "" : "Non-JSON response from server."}`;
        const snippet = parsed?.raw ? String(parsed.raw).slice(0, 200) : "";
        throw new Error(`${msg}${snippet ? `\n\nResponse starts:\n${snippet}` : ""}`);
      }

      const data = parsed.json || {};
      setRun(data.run || null);
      setStops(Array.isArray(data.stops) ? data.stops : []);
      setTotals(data.totals || { totalStops: 0, totalExtraBags: 0 });
      if (data.warning) setWarning(data.warning);

      // preselect assigned staff from run payload (daily_run_staff join)
      const assigned = Array.isArray(data.run?.daily_run_staff)
        ? data.run.daily_run_staff.map((x) => x.staff_id).filter(Boolean)
        : [];
      setSelectedStaffIds(assigned);
    } catch (e) {
      setRun(null);
      setStops([]);
      setTotals({ totalStops: 0, totalExtraBags: 0 });
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff() {
    setStaffError("");
    setStaffSavedMsg("");
    setStaffLoading(true);
    try {
      const res = await fetch("/api/ops/staff/list");
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to load staff");
      setAllStaff(Array.isArray(parsed.json?.staff) ? parsed.json.staff : []);
    } catch (e) {
      setAllStaff([]);
      setStaffError(e?.message || "Failed to load staff");
    } finally {
      setStaffLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    // load staff once we have a run id
    if (id) loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const staffNames = useMemo(() => {
    if (!run?.daily_run_staff) return "";
    const names = run.daily_run_staff.map((x) => x.staff?.name).filter(Boolean);
    return names.join(", ");
  }, [run]);

  const vehicleLabel = useMemo(() => {
    if (!run?.vehicles) return "— no vehicle —";
    const v = run.vehicles;
    return `${v.registration}${v.name ? ` • ${v.name}` : ""}`;
  }, [run]);

  const slotLabel = useMemo(() => String(run?.route_slot || "ANY").toUpperCase(), [run]);

  function toggleStaff(staffId) {
    setStaffSavedMsg("");
    setSelectedStaffIds((prev) => {
      const set = new Set(prev);
      if (set.has(staffId)) set.delete(staffId);
      else set.add(staffId);
      return Array.from(set);
    });
  }

  async function saveStaffAssignments() {
    if (!run?.id) return;
    setStaffError("");
    setStaffSavedMsg("");
    setSavingStaff(true);
    try {
      const res = await fetch(`/api/ops/run/${run.id}/assign-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_ids: selectedStaffIds }),
      });
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to save assignments");

      setStaffSavedMsg("Saved.");
      await load(); // refresh run header (names)
    } catch (e) {
      setStaffError(e?.message || "Failed to save assignments");
    } finally {
      setSavingStaff(false);
    }
  }

  async function markCollected(subscription_id) {
    setSavingId(subscription_id);
    setError("");
    try {
      const res = await fetch("/api/ops/mark-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id, collection_date: run?.run_date }),
      });
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to mark collected");
      await load();
    } catch (e) {
      setError(e?.message || "Failed");
    } finally {
      setSavingId("");
    }
  }

  async function undoCollected(subscription_id) {
    setSavingId(subscription_id);
    setError("");
    try {
      const res = await fetch("/api/ops/undo-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id, collection_date: run?.run_date }),
      });
      const parsed = await readJsonOrText(res);
      if (!res.ok) throw new Error(parsed?.json?.error || "Failed to undo");
      await load();
    } catch (e) {
      setError(e?.message || "Failed");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ops • Run</h1>
            <p className="text-sm text-slate-600">Stops due for this run’s date + area + day + slot.</p>
          </div>

          <div className="flex gap-2">
            <Link href="/ops/daily-runs" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Day Planner
            </Link>
            <Link href="/ops/today" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Today
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-3 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {warning ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {warning}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-600">Loading run…</div>
          </div>
        ) : !run ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">Run not found.</div>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="text-base font-semibold text-slate-900">
                {run.route_area} • {run.route_day} • {slotLabel}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">{run.run_date}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="font-medium text-slate-700">{vehicleLabel}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span>{staffNames || "No staff assigned"}</span>
              </div>

              {/* ASSIGNMENT */}
              <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Assign driver / team</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Tick staff members who should see this run in the driver portal.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={loadStaff}
                    disabled={staffLoading}
                    className={cx(
                      "rounded-lg border px-3 py-2 text-sm font-semibold",
                      staffLoading ? "border-slate-200 bg-slate-100 text-slate-500" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    {staffLoading ? "Refreshing…" : "Refresh staff"}
                  </button>
                </div>

                {staffError ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {staffError}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(allStaff || []).map((s) => {
                    const checked = selectedStaffIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={cx(
                          "flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1",
                          checked ? "ring-emerald-200" : "ring-slate-200"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{s.name}</div>
                          <div className="truncate text-xs text-slate-600">
                            {s.role || "staff"} • {s.email || "no email"}
                          </div>
                        </div>

                        <input type="checkbox" checked={checked} onChange={() => toggleStaff(s.id)} />
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  {staffSavedMsg ? <div className="text-sm text-emerald-700">{staffSavedMsg}</div> : null}
                  <button
                    type="button"
                    onClick={saveStaffAssignments}
                    disabled={savingStaff}
                    className={cx(
                      "rounded-lg px-4 py-2 text-sm font-semibold",
                      savingStaff ? "bg-slate-300 text-slate-600" : "bg-slate-900 text-white hover:bg-black"
                    )}
                  >
                    {savingStaff ? "Saving…" : "Save assignments"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Stops</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalStops}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-600">Extra bags</div>
                  <div className="text-lg font-semibold text-slate-900">{totals.totalExtraBags}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Slot matching: AM includes AM + ANY + blank. PM includes PM + ANY + blank. ANY includes all.
              </div>

              {run.notes ? <div className="mt-3 text-sm text-slate-600">{run.notes}</div> : null}
            </div>

            {stops.length === 0 ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="text-sm text-slate-700">No due stops match this run.</div>
              </div>
            ) : (
              <div className="space-y-2 pb-10">
                {stops.map((s) => (
                  <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-slate-900">
                          {s.address}
                          {s.collected ? (
                            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                              collected
                            </span>
                          ) : (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                              due
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-sm text-slate-600">
                          {s.postcode}
                          <span className="mx-2 text-slate-300">•</span>
                          Slot: <span className="font-semibold text-slate-800">{String(s.route_slot || "ANY").toUpperCase()}</span>
                          <span className="mx-2 text-slate-300">•</span>
                          Extra bags: <span className="font-semibold text-slate-800">{Number(s.extra_bags) || 0}</span>
                          <span className="mx-2 text-slate-300">•</span>
                          {s.use_own_bin ? "Own bin" : "Company bin"}
                        </div>

                        {s.ops_notes ? <div className="mt-1 text-xs text-slate-500">{s.ops_notes}</div> : null}
                      </div>

                      <div className="shrink-0 flex gap-2">
                        {s.collected ? (
                          <button
                            type="button"
                            onClick={() => undoCollected(s.id)}
                            disabled={savingId === s.id}
                            className={cx(
                              "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                              savingId === s.id
                                ? "bg-slate-200 text-slate-500 ring-slate-200"
                                : "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100"
                            )}
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markCollected(s.id)}
                            disabled={savingId === s.id}
                            className={cx(
                              "rounded-xl px-3 py-2 text-sm font-semibold ring-1",
                              savingId === s.id
                                ? "bg-slate-200 text-slate-500 ring-slate-200"
                                : "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
                            )}
                          >
                            Collected
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
