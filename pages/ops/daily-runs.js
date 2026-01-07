// pages/ops/daily-runs.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = ["ANY", "AM", "PM"];

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function londonTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

export default function OpsDailyRunsPage() {
  const [date, setDate] = useState(londonTodayYMD());

  const [runs, setRuns] = useState([]);
  const [staff, setStaff] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [createForm, setCreateForm] = useState({
    run_date: londonTodayYMD(),
    route_day: "Monday",
    route_area: "",
    route_slot: "ANY",
    vehicle_id: "",
    notes: "",
    staff_ids: [],
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState({
    id: "",
    run_date: "",
    route_day: "",
    route_area: "",
    route_slot: "ANY",
    vehicle_id: "",
    notes: "",
    staff_ids: [],
  });

  async function loadAll(forDate) {
    setLoading(true);
    setError("");
    try {
      const [rRuns, rStaff, rVehicles] = await Promise.all([
        fetch(`/api/ops/daily-runs?date=${encodeURIComponent(forDate)}`),
        fetch("/api/ops/staff"),
        fetch("/api/ops/vehicles"),
      ]);

      const jRuns = await rRuns.json();
      const jStaff = await rStaff.json();
      const jVehicles = await rVehicles.json();

      if (!rRuns.ok) throw new Error(jRuns?.error || "Failed loading runs");
      if (!rStaff.ok) throw new Error(jStaff?.error || "Failed loading staff");
      if (!rVehicles.ok) throw new Error(jVehicles?.error || "Failed loading vehicles");

      setRuns(Array.isArray(jRuns?.runs) ? jRuns.runs : []);
      setStaff(Array.isArray(jStaff?.staff) ? jStaff.staff : []);
      setVehicles(Array.isArray(jVehicles?.vehicles) ? jVehicles.vehicles : []);

      setCreateForm((s) => ({ ...s, run_date: forDate }));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);
  const activeVehicles = useMemo(() => vehicles.filter((v) => v.active), [vehicles]);

  async function createRun() {
    setSaving(true);
    setError("");
    try {
      const route_area = (createForm.route_area || "").toString().trim();
      const route_slot = (createForm.route_slot || "ANY").toString().toUpperCase();
      const route_day = (createForm.route_day || "").toString();

      const payload = {
        run_date: date,
        route_day,
        route_area,
        route_slot: SLOTS.includes(route_slot) ? route_slot : "ANY",
        vehicle_id: createForm.vehicle_id || null,
        notes: createForm.notes || "",
        staff_ids: Array.isArray(createForm.staff_ids) ? createForm.staff_ids : [],
      };

      if (!payload.route_area) throw new Error("Route area is required");

      const res = await fetch("/api/ops/daily-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Create failed");

      setCreateForm((s) => ({
        ...s,
        route_area: "",
        route_slot: "ANY",
        vehicle_id: "",
        notes: "",
        staff_ids: [],
      }));
      await loadAll(date);
    } catch (e) {
      setError(e.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(run) {
    const staff_ids = Array.isArray(run.daily_run_staff)
      ? run.daily_run_staff.map((x) => x.staff?.id).filter(Boolean)
      : [];

    setEdit({
      id: run.id,
      run_date: run.run_date,
      route_day: run.route_day,
      route_area: run.route_area,
      route_slot: (run.route_slot || "ANY").toString().toUpperCase(),
      vehicle_id: run.vehicle_id || "",
      notes: run.notes || "",
      staff_ids,
    });
    setDrawerOpen(true);
  }

  async function saveEdit() {
    if (!edit.id) return;
    setSaving(true);
    setError("");
    try {
      const route_area = (edit.route_area || "").toString().trim();
      const route_slot = (edit.route_slot || "ANY").toString().toUpperCase();

      const payload = {
        run_date: edit.run_date,
        route_day: edit.route_day,
        route_area,
        route_slot: SLOTS.includes(route_slot) ? route_slot : "ANY",
        vehicle_id: edit.vehicle_id || null,
        notes: edit.notes || "",
        staff_ids: Array.isArray(edit.staff_ids) ? edit.staff_ids : [],
      };
      if (!payload.route_area) throw new Error("Route area is required");

      const res = await fetch(`/api/ops/daily-runs/${edit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Save failed");

      setDrawerOpen(false);
      await loadAll(date);
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRun(id) {
    const ok = window.confirm("Delete this run? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/daily-runs/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Delete failed");
      setDrawerOpen(false);
      await loadAll(date);
    } catch (e) {
      setError(e.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleStaff(list, staffId) {
    const set = new Set(list);
    if (set.has(staffId)) set.delete(staffId);
    else set.add(staffId);
    return Array.from(set);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ops • Daily Runs</h1>
            <p className="text-sm text-slate-600">
              Define vans/crews by date + area + vehicle + staff + slot (AM/PM/ANY).
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/ops/dashboard" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Dashboard
            </Link>
            <Link href="/ops/staff" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Staff
            </Link>
            <Link href="/ops/vehicles" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm">
              Vehicles
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="ml-auto text-sm text-slate-600">
              {loading ? "Loading…" : `${runs.length} run(s) for this date`}
            </div>
          </div>
        </div>

        {/* Create run */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 text-sm font-semibold text-slate-900">Create run</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="text-xs font-semibold text-slate-600">Route day</label>
              <select
                value={createForm.route_day}
                onChange={(e) => setCreateForm((s) => ({ ...s, route_day: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Route area</label>
              <input
                value={createForm.route_area}
                onChange={(e) => setCreateForm((s) => ({ ...s, route_area: e.target.value }))}
                placeholder="e.g. Porthcawl"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Slot</label>
              <select
                value={createForm.route_slot}
                onChange={(e) => setCreateForm((s) => ({ ...s, route_slot: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Vehicle</label>
              <select
                value={createForm.vehicle_id}
                onChange={(e) => setCreateForm((s) => ({ ...s, vehicle_id: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— none —</option>
                {activeVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration}
                    {v.name ? ` • ${v.name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={createRun}
                disabled={saving}
                className={cx(
                  "w-full rounded-xl px-4 py-2 text-sm font-semibold shadow-sm ring-1",
                  saving ? "bg-slate-200 text-slate-500 ring-slate-200" : "bg-black text-white ring-black hover:bg-slate-900"
                )}
              >
                {saving ? "Saving…" : "Create run"}
              </button>
            </div>

            <div className="md:col-span-5">
              <label className="text-xs font-semibold text-slate-600">Staff on this run</label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activeStaff.map((s) => {
                  const checked = createForm.staff_ids.includes(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setCreateForm((f) => ({ ...f, staff_ids: toggleStaff(f.staff_ids, s.id) }))
                        }
                      />
                      <span className="font-semibold text-slate-900">{s.name}</span>
                      <span className="ml-auto text-xs text-slate-500">{s.role}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-5">
              <label className="text-xs font-semibold text-slate-600">Notes</label>
              <input
                value={createForm.notes}
                onChange={(e) => setCreateForm((s) => ({ ...s, notes: e.target.value }))}
                placeholder="Optional"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Runs list */}
        {loading ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-600">Loading runs…</div>
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">No runs for this date yet. Create one above.</div>
          </div>
        ) : (
          <div className="space-y-2 pb-10">
            {runs.map((r) => {
              const staffList = Array.isArray(r.daily_run_staff)
                ? r.daily_run_staff.map((x) => x.staff?.name).filter(Boolean)
                : [];
              const vehicleLabel = r.vehicles
                ? `${r.vehicles.registration}${r.vehicles.name ? ` • ${r.vehicles.name}` : ""}`
                : "— no vehicle —";

              return (
                <div
                  key={r.id}
                  className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-slate-900">
                        {r.route_area} • {r.route_day} • {String(r.route_slot || "ANY").toUpperCase()}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        <span className="font-medium text-slate-700">{vehicleLabel}</span>
                        <span className="mx-2 text-slate-300">•</span>
                        <span>{staffList.length ? staffList.join(", ") : "No staff assigned"}</span>
                      </div>
                      {r.notes ? <div className="mt-1 text-xs text-slate-500">{r.notes}</div> : null}
                    </div>

                    <div className="shrink-0 flex gap-2">
                      <Link
                        href={`/ops/run/${r.id}`}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drawer edit */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close"
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl rounded-t-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900">Edit run</div>
                <div className="mt-1 text-sm text-slate-600">{edit.run_date}</div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">Run date</label>
                <input
                  type="date"
                  value={edit.run_date}
                  onChange={(e) => setEdit((s) => ({ ...s, run_date: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Route day</label>
                <select
                  value={edit.route_day}
                  onChange={(e) => setEdit((s) => ({ ...s, route_day: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Route area</label>
                <input
                  value={edit.route_area}
                  onChange={(e) => setEdit((s) => ({ ...s, route_area: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Slot</label>
                <select
                  value={edit.route_slot}
                  onChange={(e) => setEdit((s) => ({ ...s, route_slot: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Vehicle</label>
                <select
                  value={edit.vehicle_id}
                  onChange={(e) => setEdit((s) => ({ ...s, vehicle_id: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— none —</option>
                  {activeVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration}
                      {v.name ? ` • ${v.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Staff on this run</label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {activeStaff.map((s) => {
                    const checked = edit.staff_ids.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setEdit((f) => ({ ...f, staff_ids: toggleStaff(f.staff_ids, s.id) }))}
                        />
                        <span className="font-semibold text-slate-900">{s.name}</span>
                        <span className="ml-auto text-xs text-slate-500">{s.role}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  rows={3}
                  value={edit.notes}
                  onChange={(e) => setEdit((s) => ({ ...s, notes: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className={cx(
                  "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1",
                  saving ? "bg-slate-200 text-slate-500 ring-slate-200" : "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
                )}
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => deleteRun(edit.id)}
                disabled={saving}
                className={cx(
                  "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1",
                  saving ? "bg-slate-200 text-slate-500 ring-slate-200" : "bg-red-50 text-red-800 ring-red-200 hover:bg-red-100"
                )}
              >
                Delete
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Slot matching: Run AM includes subscribers AM + ANY + blank. Run PM includes PM + ANY + blank.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
