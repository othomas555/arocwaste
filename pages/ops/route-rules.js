import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function clsx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function normPrefix(input) {
  return (input || "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

export default function OpsRouteRulesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rules, setRules] = useState([]);

  const [newRule, setNewRule] = useState({
    postcode_prefix: "",
    route_day: "Monday",
    route_area: "",
    active: true,
    notes: "",
  });

  const sortedRules = useMemo(() => {
    const copy = [...rules];
    copy.sort((a, b) => {
      const la = (a.prefix_nospace || "").length;
      const lb = (b.prefix_nospace || "").length;
      if (lb !== la) return lb - la; // longest first
      return (a.postcode_prefix || "").localeCompare(b.postcode_prefix || "");
    });
    return copy;
  }, [rules]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ops/route-rules", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load route rules");
      setRules(json.rules || []);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createRule() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...newRule,
        postcode_prefix: normPrefix(newRule.postcode_prefix),
        route_area: (newRule.route_area || "").toString().trim(),
      };

      if (!payload.postcode_prefix) throw new Error("Postcode prefix is required");
      if (!payload.route_area) throw new Error("Route area is required");

      const res = await fetch("/api/ops/route-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create rule");

      setNewRule({
        postcode_prefix: "",
        route_day: "Monday",
        route_area: "",
        active: true,
        notes: "",
      });

      await load();
    } catch (e) {
      setError(e.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function updateRule(id, patch) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/route-rules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to update rule");
      await load();
    } catch (e) {
      setError(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id) {
    const ok = window.confirm("Delete this rule? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/route-rules/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to delete rule");
      await load();
    } catch (e) {
      setError(e.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Route Rules</h1>
            <p className="mt-1 text-sm text-gray-600">
              Ops-editable mapping: postcode prefix → route day + route area. Matching uses <b>longest prefix wins</b>.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
            >
              Dashboard
            </Link>
            <Link
              href="/ops/subscribers"
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
            >
              Subscribers
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">Problem</div>
            <div className="mt-1">{error}</div>
          </div>
        ) : null}

        {/* Create new rule */}
        <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add rule</h2>
            <button
              onClick={createRule}
              disabled={saving}
              className={clsx(
                "rounded-lg px-3 py-2 text-sm font-medium text-white",
                saving ? "bg-gray-400" : "bg-black hover:bg-gray-900"
              )}
            >
              {saving ? "Saving…" : "Add rule"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700">Postcode prefix</label>
              <input
                value={newRule.postcode_prefix}
                onChange={(e) => setNewRule((s) => ({ ...s, postcode_prefix: e.target.value }))}
                placeholder="e.g. CF33 4 or NP20 4 or CF1"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="mt-1 text-xs text-gray-500">
                Tip: use outward+sector like <b>NP20 4</b> for best control.
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">Route day</label>
              <select
                value={newRule.route_day}
                onChange={(e) => setNewRule((s) => ({ ...s, route_day: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">Route area</label>
              <input
                value={newRule.route_area}
                onChange={(e) => setNewRule((s) => ({ ...s, route_area: e.target.value }))}
                placeholder="e.g. Newport / Porthcawl"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!newRule.active}
                  onChange={(e) => setNewRule((s) => ({ ...s, active: e.target.checked }))}
                />
                Active
              </label>
            </div>

            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-gray-700">Notes (optional)</label>
              <input
                value={newRule.notes}
                onChange={(e) => setNewRule((s) => ({ ...s, notes: e.target.value }))}
                placeholder="e.g. Core Porthcawl round"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Rules table */}
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
            <div className="font-semibold">Rules</div>
            <button
              onClick={load}
              disabled={loading || saving}
              className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-gray-700">Prefix</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Day</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Area</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Active</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Notes</th>
                  <th className="px-3 py-2 font-medium text-gray-700"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRules.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-gray-500" colSpan={6}>
                      {loading ? "Loading…" : "No rules yet. Add your first prefix above."}
                    </td>
                  </tr>
                ) : (
                  sortedRules.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded-lg border px-2 py-1"
                          defaultValue={r.postcode_prefix || ""}
                          onBlur={(e) => {
                            const v = normPrefix(e.target.value);
                            if (v !== normPrefix(r.postcode_prefix)) {
                              updateRule(r.id, { postcode_prefix: v });
                            }
                          }}
                        />
                        <div className="mt-1 text-[11px] text-gray-500">
                          Match key: {r.prefix_nospace}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded-lg border px-2 py-1"
                          value={r.route_day}
                          onChange={(e) => updateRule(r.id, { route_day: e.target.value })}
                          disabled={saving}
                        >
                          {DAYS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded-lg border px-2 py-1"
                          defaultValue={r.route_area || ""}
                          onBlur={(e) => {
                            const v = (e.target.value || "").toString().trim();
                            if (v !== (r.route_area || "").toString().trim()) {
                              updateRule(r.id, { route_area: v });
                            }
                          }}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!r.active}
                          onChange={(e) => updateRule(r.id, { active: e.target.checked })}
                          disabled={saving}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded-lg border px-2 py-1"
                          defaultValue={r.notes || ""}
                          onBlur={(e) => {
                            const v = (e.target.value || "").toString();
                            if (v !== (r.notes || "").toString()) {
                              updateRule(r.id, { notes: v });
                            }
                          }}
                        />
                      </td>

                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => deleteRule(r.id)}
                          disabled={saving}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t bg-gray-50 px-4 py-3 text-xs text-gray-600">
            Matching rules: postcode is normalised (upper + spaces removed) and the system picks the <b>longest</b>{" "}
            matching prefix. Keep prefixes as specific as you need (e.g. <b>NP20 4</b> beats <b>NP20</b>).
          </div>
        </div>
      </div>
    </div>
  );
}
