// pages/ops/routes.js
import { useMemo, useState } from "react";
import Link from "next/link";

const DAYS_MON_FRI = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = ["AM", "PM", "ANY"];

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function prefixesToText(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.join("\n");
}

export default function OpsRoutes({ initial }) {
  const [rows, setRows] = useState(initial || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("create"); // create | edit
  const [editId, setEditId] = useState(null);

  const [name, setName] = useState("");
  const [routeDay, setRouteDay] = useState("Monday");
  const [slot, setSlot] = useState("AM");
  const [active, setActive] = useState(true);
  const [postcodesText, setPostcodesText] = useState("");
  const [notes, setNotes] = useState("");

  const grouped = useMemo(() => {
    // name -> day -> [entries]
    const map = new Map();
    for (const r of rows || []) {
      const n = String(r.name || "").trim();
      if (!n) continue;
      if (!map.has(n)) map.set(n, {});
      const byDay = map.get(n);
      const d = r.route_day || "";
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(r);
    }
    // sort entries in each cell by slot order
    for (const [n, byDay] of map.entries()) {
      for (const d of Object.keys(byDay)) {
        byDay[d].sort((a, b) => {
          const ai = SLOTS.indexOf(a.slot || "ANY");
          const bi = SLOTS.indexOf(b.slot || "ANY");
          return ai - bi;
        });
      }
    }
    // sorted area names
    const names = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return { map, names };
  }, [rows]);

  function resetForm() {
    setName("");
    setRouteDay("Monday");
    setSlot("AM");
    setActive(true);
    setPostcodesText("");
    setNotes("");
    setEditId(null);
  }

  function openCreate(prefill = {}) {
    setError("");
    resetForm();
    setMode("create");
    setName(prefill.name || "");
    setRouteDay(prefill.route_day || "Monday");
    setSlot(prefill.slot || "AM");
    setOpen(true);
  }

  function openEdit(r) {
    setError("");
    setMode("edit");
    setEditId(r.id);
    setName(r.name || "");
    setRouteDay(r.route_day || "Monday");
    setSlot(r.slot || "AM");
    setActive(r.active !== false);
    setPostcodesText(prefixesToText(r.postcode_prefixes));
    setNotes(r.notes || "");
    setOpen(true);
  }

  async function refresh() {
    const res = await fetch("/api/ops/route-areas");
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to refresh.");
    setRows(data.data || []);
  }

  async function onSave() {
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) return setError("Area name is required.");
    if (!ALL_DAYS.includes(routeDay)) return setError("Pick a valid day.");
    if (!SLOTS.includes(slot)) return setError("Pick a valid slot (AM/PM/ANY).");

    const payload = {
      name: trimmedName,
      route_day: routeDay,
      slot,
      active,
      notes: notes.trim() ? notes.trim() : null,
      postcode_prefixes: postcodesText, // API normalises this
    };

    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/ops/route-areas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Create failed.");
      } else {
        const res = await fetch(`/api/ops/route-areas/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Update failed.");
      }

      await refresh();
      setOpen(false);
      resetForm();
    } catch (e) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(r) {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/route-areas/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !(r.active !== false) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed.");
      await refresh();
    } catch (e) {
      setError(e?.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(r) {
    setError("");
    const ok = window.confirm(
      `Delete "${r.name}" on ${r.route_day} (${r.slot})?`
    );
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/ops/route-areas/${r.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Delete failed.");
      await refresh();
    } catch (e) {
      setError(e?.message || "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  const allEntriesSorted = useMemo(() => {
    const copy = [...(rows || [])];
    copy.sort((a, b) => {
      const aa = (a.active !== false) ? 0 : 1;
      const bb = (b.active !== false) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      const n = String(a.name || "").localeCompare(String(b.name || ""));
      if (n !== 0) return n;
      const d = String(a.route_day || "").localeCompare(String(b.route_day || ""));
      if (d !== 0) return d;
      return String(a.slot || "").localeCompare(String(b.slot || ""));
    });
    return copy;
  }, [rows]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Route areas</h1>
            <p className="text-sm text-gray-600">
              Manage areas + set run day + AM/PM + postcode coverage.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={() => openCreate()}
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              Add entry
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {/* Week view */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Week view (Mon–Fri)</h2>
              <p className="text-xs text-gray-600">
                Each area can appear multiple days (e.g. Porthcawl Mon/Wed/Fri AM).
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCreate({ slot: "AM" })}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Quick add (AM)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Area</th>
                  {DAYS_MON_FRI.map((d) => (
                    <th key={d} className="px-3 py-2 text-center">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {grouped.names.length ? (
                  grouped.names.map((areaName) => (
                    <tr key={areaName} className="bg-white">
                      <td className="px-3 py-2 font-semibold text-gray-900">
                        <div className="flex items-center justify-between gap-2">
                          <span>{areaName}</span>
                          <button
                            type="button"
                            onClick={() => openCreate({ name: areaName, slot: "AM" })}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                            title="Add another day for this area"
                          >
                            + Add
                          </button>
                        </div>
                      </td>

                      {DAYS_MON_FRI.map((day) => {
                        const entries = grouped.map.get(areaName)?.[day] || [];
                        return (
                          <td key={`${areaName}-${day}`} className="px-3 py-2 align-top">
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex flex-wrap justify-center gap-1">
                                {entries.length ? (
                                  entries.map((r) => (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => openEdit(r)}
                                      className={classNames(
                                        "rounded-md px-2 py-1 text-xs font-semibold",
                                        r.active !== false
                                          ? "bg-gray-900 text-white hover:bg-black"
                                          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                      )}
                                      title="Click to edit"
                                    >
                                      {r.slot || "ANY"}
                                    </button>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  openCreate({ name: areaName, route_day: day, slot: "AM" })
                                }
                                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                              >
                                + Add
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-gray-600" colSpan={6}>
                      No route areas yet. Click <span className="font-semibold">Add entry</span>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Behind the scenes, each “slot” is a row in <span className="font-mono">route_areas</span>.
            Unique is enforced on <span className="font-mono">(name, route_day, slot)</span>.
          </div>
        </div>

        {/* All entries (detail list) */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-900">All entries</h2>
            <p className="text-xs text-gray-600">
              Use this when you want to edit postcodes/notes or disable something.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left">Area</th>
                  <th className="px-3 py-2 text-left">Day</th>
                  <th className="px-3 py-2 text-left">Slot</th>
                  <th className="px-3 py-2 text-left">Postcode prefixes</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allEntriesSorted.length ? (
                  allEntriesSorted.map((r) => (
                    <tr key={r.id} className="bg-white">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onToggleActive(r)}
                          disabled={saving}
                          className={classNames(
                            "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                            r.active !== false
                              ? "bg-gray-900 text-white hover:bg-black"
                              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                          )}
                        >
                          {r.active !== false ? "Active" : "Off"}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                      <td className="px-3 py-2 text-gray-700">{r.route_day}</td>
                      <td className="px-3 py-2 text-gray-700">{r.slot}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {Array.isArray(r.postcode_prefixes) && r.postcode_prefixes.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.postcode_prefixes.slice(0, 10).map((p) => (
                              <span
                                key={p}
                                className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800"
                              >
                                {p}
                              </span>
                            ))}
                            {r.postcode_prefixes.length > 10 ? (
                              <span className="text-xs text-gray-500">
                                +{r.postcode_prefixes.length - 10} more
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(r)}
                            disabled={saving}
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-gray-600" colSpan={6}>
                      No entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {mode === "create" ? "Add entry" : "Edit entry"}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    One entry = one day + slot for an area.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700">Area name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    placeholder="e.g. Porthcawl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Run day</label>
                  <select
                    value={routeDay}
                    onChange={(e) => setRouteDay(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {ALL_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Slot</label>
                  <select
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-gray-500">
                    Use AM/PM if you want to split the day.
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    Postcode prefixes (one per line, or comma separated)
                  </label>
                  <textarea
                    value={postcodesText}
                    onChange={(e) => setPostcodesText(e.target.value)}
                    className="mt-1 h-32 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    placeholder={`Examples:\nCF36\nCF33 4\nCF33 6`}
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    Match is prefix-based (CF36 covers CF36 5AA etc).
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700">Notes (optional)</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    placeholder="Anything ops should know"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    id="active"
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <label htmlFor="active" className="text-sm text-gray-900">
                    Active
                  </label>
                </div>
              </div>

              {error ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className={classNames(
                    "rounded-lg px-4 py-2 text-sm font-semibold",
                    saving ? "bg-gray-400 text-white" : "bg-gray-900 text-white hover:bg-black"
                  )}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                If you try to create the exact same (Area + Day + Slot) twice, you’ll get a duplicate error — that’s intentional.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export async function getServerSideProps(ctx) {
  const proto = (ctx.req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host;
  const baseUrl = `${proto}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/api/ops/route-areas`, {
      headers: {
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { props: { initial: [], _error: json?.error || "Failed to load" } };

    return { props: { initial: json.data || [] } };
  } catch (e) {
    return { props: { initial: [], _error: e?.message || "Failed to load" } };
  }
}
