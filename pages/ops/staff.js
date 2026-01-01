import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const ROLES = [
  { key: "driver", label: "driver" },
  { key: "admin", label: "admin" },
];

export default function OpsStaffPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");

  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "driver",
    active: true,
    notes: "",
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState({
    id: "",
    name: "",
    email: "",
    role: "driver",
    active: true,
    notes: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ops/staff");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load staff");
      setRows(Array.isArray(data?.staff) ? data.staff : []);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = `${r.name || ""} ${r.email || ""} ${r.role || ""} ${r.notes || ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [rows, q]);

  async function createStaff() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: (createForm.name || "").toString().trim(),
        email: (createForm.email || "").toString().trim(),
        role: createForm.role,
        active: !!createForm.active,
        notes: (createForm.notes || "").toString(),
      };

      if (!payload.name) throw new Error("Name is required");
      if (!payload.email) throw new Error("Email is required");

      const res = await fetch("/api/ops/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Create failed");

      setCreateForm({ name: "", email: "", role: "driver", active: true, notes: "" });
      await load();
    } catch (e) {
      setError(e.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r) {
    setEdit({
      id: r.id,
      name: r.name || "",
      email: r.email || "",
      role: r.role || "driver",
      active: !!r.active,
      notes: r.notes || "",
    });
    setDrawerOpen(true);
  }

  async function saveEdit() {
    if (!edit.id) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/staff/${edit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name,
          email: edit.email,
          role: edit.role,
          active: !!edit.active,
          notes: edit.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setDrawerOpen(false);
      await load();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStaff(id) {
    const ok = window.confirm("Delete this staff record? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/staff/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      setDrawerOpen(false);
      await load();
    } catch (e) {
      setError(e.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-3 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ops • Staff</h1>
            <p className="text-sm text-slate-600">
              Create driver/admin people records. Later we’ll link these emails to logins + daily runs.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
            >
              Dashboard
            </Link>
            <Link
              href="/ops/subscribers"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
            >
              Subscribers
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Create */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 text-sm font-semibold text-slate-900">Add staff member</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Name</label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Mark"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Email (login)</label>
              <input
                value={createForm.email}
                onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
                placeholder="mark@yourdomain.co.uk"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Role</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((s) => ({ ...s, role: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!createForm.active}
                  onChange={(e) => setCreateForm((s) => ({ ...s, active: e.target.checked }))}
                />
                Active
              </label>

              <button
                type="button"
                onClick={createStaff}
                disabled={saving}
                className={cx(
                  "ml-auto rounded-xl px-4 py-2 text-sm font-semibold shadow-sm ring-1 active:scale-[0.99]",
                  saving
                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                    : "bg-black text-white ring-black hover:bg-slate-900"
                )}
              >
                {saving ? "Saving…" : "Add"}
              </button>
            </div>

            <div className="md:col-span-4">
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

        {/* Search */}
        <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search staff…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-600">Loading staff…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-700">No staff found.</div>
          </div>
        ) : (
          <div className="space-y-2 pb-10">
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openEdit(r)}
                className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 active:scale-[0.999]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">
                      {r.name || "Name missing"}
                      {!r.active ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          inactive
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      <span className="font-medium text-slate-700">{r.email}</span>
                      <span className="mx-2 text-slate-300">•</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        {r.role}
                      </span>
                    </div>
                    {r.notes ? <div className="mt-1 text-xs text-slate-500">{r.notes}</div> : null}
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-slate-500">Edit</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
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
                <div className="text-base font-semibold text-slate-900">Edit staff</div>
                <div className="mt-1 text-sm text-slate-600">{edit.email}</div>
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
                <label className="text-xs font-semibold text-slate-600">Name</label>
                <input
                  value={edit.name}
                  onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Email</label>
                <input
                  value={edit.email}
                  onChange={(e) => setEdit((s) => ({ ...s, email: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Role</label>
                <select
                  value={edit.role}
                  onChange={(e) => setEdit((s) => ({ ...s, role: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!edit.active}
                    onChange={(e) => setEdit((s) => ({ ...s, active: e.target.checked }))}
                  />
                  Active
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  value={edit.notes || ""}
                  onChange={(e) => setEdit((s) => ({ ...s, notes: e.target.value }))}
                  rows={3}
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
                  "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1 active:scale-[0.99]",
                  saving
                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                    : "bg-emerald-600 text-white ring-emerald-700 hover:bg-emerald-700"
                )}
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 active:scale-[0.99]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => deleteStaff(edit.id)}
                disabled={saving}
                className={cx(
                  "rounded-xl px-4 py-3 text-sm font-semibold shadow-sm ring-1 active:scale-[0.99]",
                  saving
                    ? "bg-slate-200 text-slate-500 ring-slate-200"
                    : "bg-red-50 text-red-800 ring-red-200 hover:bg-red-100"
                )}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
