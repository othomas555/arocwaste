// pages/ops/routes.js
import { useMemo, useState } from "react";
import Link from "next/link";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = ["ANY", "AM", "PM"];

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
  const [slot, setSlot] = useState("ANY");
  const [active, setActive] = useState(true);
  const [postcodesText, setPostcodesText] = useState("");
  const [notes, setNotes] = useState("");

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const aa = a.active ? 0 : 1;
      const bb = b.active ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return copy;
  }, [rows]);

  function resetForm() {
    setName("");
    setRouteDay("Monday");
    setSlot("ANY");
    setActive(true);
    setPostcodesText("");
    setNotes("");
    setEditId(null);
  }

  function openCreate() {
    setError("");
    resetForm();
    setMode("create");
    setOpen(true);
  }

  function openEdit(r) {
    setError("");
    setMode("edit");
    setEditId(r.id);
    setName(r.name || "");
    setRouteDay(r.route_day || "Monday");
    setSlot(r.slot || "ANY");
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
    if (!DAYS.includes(routeDay)) return setError("Pick a valid day.");
    if (!SLOTS.includes(slot)) return setError("Pick a valid slot.");

    const payload = {
      name: trimmedName,
      route_day: routeDay,
      slot,
      active,
      notes: notes.trim() ? notes.trim() : null,
      postcode_prefixes: postcodesText, // API normalises
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
    const ok = window.confirm(`Delete route area "${r.name}"?`);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Route areas</h1>
            <p className="text-sm text-gray-600">
              Define your coverage + assign run day + AM/PM. (Ops-only)
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
              onClick={openCreate}
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              Add route area
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
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
                {sortedRows.length ? (
                  sortedRows.map((r) => (
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
                          title="Toggle active"
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
                            {r.postcode_prefixes.slice(0, 8).map((p) => (
                              <span
                                key={p}
                                className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800"
                              >
                                {p}
                              </span>
                            ))}
                            {r.postcode_prefixes.length > 8 ? (
                              <span className="text-xs text-gray-500">
                                +{r.postcode_prefixes.length - 8} more
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
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
                      No route areas yet. Click <span className="font-semibold">Add route area</span>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200 p-4 text-xs text-gray-600">
            <div className="font-semibold text-gray-900">How postcode prefixes work</div>
            <div className="mt-1">
              Keep it practical: store prefixes like <span className="font-mono">CF36</span> or{" "}
              <span className="font-mono">CF33 4</span>. We’ll match the customer’s postcode against
              these prefixes (fast + simple).
            </div>
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
                    {mode === "create" ? "Add route area" : "Edit route area"}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Name + day + AM/PM + postcode prefixes
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
                    {DAYS.map((d) => (
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
                    We’ll match by prefix (so CF36 covers CF36 5AA etc).
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export async function getServerSideProps(ctx) {
  // SSR fetch via internal API so it stays aligned with your Basic Auth protection on /api/ops/*
  const proto =
    (ctx.req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host;
  const baseUrl = `${proto}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/api/ops/route-areas`, {
      headers: {
        // forward basic auth header (middleware uses it)
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { props: { initial: [], _error: json?.error || "Failed to load" } };
    }
    return { props: { initial: json.data || [] } };
  } catch (e) {
    return { props: { initial: [], _error: e?.message || "Failed to load" } };
  }
}
