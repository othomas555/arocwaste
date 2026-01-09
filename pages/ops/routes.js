// pages/ops/routes.js
import { useMemo, useState } from "react";
import Link from "next/link";

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = ["AM", "PM", "ANY"];

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function safeStr(x) {
  return (x ?? "").toString();
}

function normalisePrefixesFromText(text) {
  // Supports newline and comma separated, trims, uppercases, de-dupes.
  const raw = safeStr(text)
    .replace(/\r/g, "\n")
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase().replace(/\s+/g, " ").trim());

  const out = [];
  const seen = new Set();
  for (const p of raw) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function prefixesToText(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.join("\n");
}

async function apiJSON(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Request failed");
  return json;
}

export default function OpsRoutes({ initial }) {
  const [rows, setRows] = useState(initial || []);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Editor (side panel)
  const [open, setOpen] = useState(false);
  const [areaName, setAreaName] = useState(""); // selected area group
  const [draftName, setDraftName] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftPostcodesText, setDraftPostcodesText] = useState("");
  const [schedule, setSchedule] = useState(() => {
    const init = {};
    for (const d of ALL_DAYS) {
      init[d] = { AM: false, PM: false, ANY: false };
    }
    return init;
  });

  const grouped = useMemo(() => {
    // name -> { entries: [], byDay: { Monday: {AM: entry, ...}} }
    const map = new Map();
    for (const r of rows || []) {
      const name = safeStr(r.name).trim();
      if (!name) continue;
      if (!map.has(name)) map.set(name, { entries: [], byDay: {} });
      const g = map.get(name);
      g.entries.push(r);

      const day = safeStr(r.route_day).trim();
      const slot = safeStr(r.slot).trim() || "ANY";
      if (!g.byDay[day]) g.byDay[day] = {};
      g.byDay[day][slot] = r;
    }

    const names = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return { map, names };
  }, [rows]);

  const filteredAreaNames = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = [];
    for (const name of grouped.names) {
      const g = grouped.map.get(name);
      if (!g) continue;

      // hide fully inactive areas unless showInactive
      const hasAnyActive = g.entries.some((e) => e.active !== false);
      if (!showInactive && !hasAnyActive) continue;

      if (!needle) {
        out.push(name);
        continue;
      }

      const hay = [
        name,
        ...g.entries.map((e) => safeStr(e.route_day)),
        ...g.entries.map((e) => safeStr(e.slot)),
        ...g.entries.flatMap((e) => (Array.isArray(e.postcode_prefixes) ? e.postcode_prefixes : [])),
        ...g.entries.map((e) => safeStr(e.notes)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (hay.includes(needle)) out.push(name);
    }
    return out;
  }, [grouped, q, showInactive]);

  const postcodeCountByArea = useMemo(() => {
    // union prefixes across ALL entries for that area name
    const map = new Map();
    for (const [name, g] of grouped.map.entries()) {
      const set = new Set();
      for (const e of g.entries) {
        if (Array.isArray(e.postcode_prefixes)) {
          for (const p of e.postcode_prefixes) set.add(p);
        }
      }
      map.set(name, set.size);
    }
    return map;
  }, [grouped]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const json = await apiJSON("/api/ops/route-areas");
      setRows(json.data || []);
    } catch (e) {
      setError(e?.message || "Failed to refresh");
    } finally {
      setLoading(false);
    }
  }

  function blankSchedule() {
    const init = {};
    for (const d of ALL_DAYS) init[d] = { AM: false, PM: false, ANY: false };
    return init;
  }

  function openEditorForArea(name) {
    setError("");
    const g = grouped.map.get(name);
    if (!g) return;

    setAreaName(name);
    setDraftName(name);

    // “Area-level” fields — take from the first entry (we’ll apply to all)
    const first = g.entries[0];
    setDraftActive(first?.active !== false);
    setDraftNotes(first?.notes || "");

    // union prefixes for display
    const union = [];
    const seen = new Set();
    for (const e of g.entries) {
      if (Array.isArray(e.postcode_prefixes)) {
        for (const p of e.postcode_prefixes) {
          if (!seen.has(p)) {
            seen.add(p);
            union.push(p);
          }
        }
      }
    }
    union.sort((a, b) => a.localeCompare(b));
    setDraftPostcodesText(prefixesToText(union));

    // schedule from entries
    const sch = blankSchedule();
    for (const e of g.entries) {
      const day = safeStr(e.route_day);
      const slot = safeStr(e.slot) || "ANY";
      if (sch[day] && sch[day][slot] !== undefined) sch[day][slot] = true;
    }
    setSchedule(sch);

    setOpen(true);
  }

  function openCreateArea() {
    setError("");
    setAreaName(""); // new
    setDraftName("");
    setDraftActive(true);
    setDraftNotes("");
    setDraftPostcodesText("");
    setSchedule(blankSchedule());
    setOpen(true);
  }

  function toggleSlot(day, slot) {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], [slot]: !prev[day][slot] },
    }));
  }

  const editorSummary = useMemo(() => {
    const chosen = [];
    for (const d of ALL_DAYS) {
      for (const s of SLOTS) {
        if (schedule?.[d]?.[s]) chosen.push({ day: d, slot: s });
      }
    }
    const prefixes = normalisePrefixesFromText(draftPostcodesText);
    return {
      chosen,
      prefixesCount: prefixes.length,
    };
  }, [schedule, draftPostcodesText]);

  async function saveAreaChanges() {
    setError("");

    const trimmedName = safeStr(draftName).trim();
    if (!trimmedName) return setError("Area name is required.");

    // Must have at least one schedule entry, otherwise area will do nothing.
    if (!editorSummary.chosen.length) {
      return setError("Pick at least one day + slot (AM/PM/ANY).");
    }

    const prefixes = normalisePrefixesFromText(draftPostcodesText);
    const postcodesPayloadText = prefixes.join("\n"); // API normalises; we still send clean text.

    setBusy(true);
    try {
      // Existing entries for original areaName (if editing)
      const existingGroup = areaName ? grouped.map.get(areaName) : null;
      const existingEntries = existingGroup?.entries || [];

      // Build desired set of (day|slot)
      const desiredKeys = new Set(editorSummary.chosen.map((x) => `${x.day}|${x.slot}`));

      // Map existing keys -> entry
      const existingByKey = new Map();
      for (const e of existingEntries) {
        const k = `${safeStr(e.route_day)}|${safeStr(e.slot) || "ANY"}`;
        existingByKey.set(k, e);
      }

      // 1) If renaming area: we handle it by:
      // - update all existing entries name via PUT
      // (and any new created will use trimmedName)
      const isRename = areaName && trimmedName !== areaName;

      // 2) Create missing entries
      for (const k of desiredKeys) {
        if (existingByKey.has(k)) continue;
        const [day, slot] = k.split("|");

        await apiJSON("/api/ops/route-areas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            route_day: day,
            slot,
            active: !!draftActive,
            notes: safeStr(draftNotes).trim() ? safeStr(draftNotes).trim() : null,
            postcode_prefixes: postcodesPayloadText,
          }),
        });
      }

      // 3) Update kept entries (and rename if needed)
      for (const [k, e] of existingByKey.entries()) {
        if (!desiredKeys.has(k)) continue;

        await apiJSON(`/api/ops/route-areas/${e.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName, // applies rename too
            active: !!draftActive,
            notes: safeStr(draftNotes).trim() ? safeStr(draftNotes).trim() : null,
            postcode_prefixes: postcodesPayloadText,
          }),
        });
      }

      // 4) Delete removed entries
      for (const [k, e] of existingByKey.entries()) {
        if (desiredKeys.has(k)) continue;

        await apiJSON(`/api/ops/route-areas/${e.id}`, { method: "DELETE" });
      }

      await refresh();

      // If rename, move selection to new name
      setAreaName(trimmedName);
      setOpen(false);
    } catch (e) {
      setError(e?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const weekGrid = useMemo(() => {
    return filteredAreaNames.map((name) => {
      const g = grouped.map.get(name);
      const anyActive = g?.entries?.some((e) => e.active !== false);
      return { name, g, anyActive };
    });
  }, [filteredAreaNames, grouped]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Routes</h1>
            <p className="text-sm text-gray-600">
              Week view first. Click an area to edit schedule + postcodes.
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
              href="/ops/route-assign"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Bulk assign routes
            </Link>

            <button
              type="button"
              onClick={openCreateArea}
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              New area
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full gap-2 sm:max-w-xl">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search areas, postcodes, notes..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <button
              type="button"
              onClick={() => setQ("")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive areas
            </label>

            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className={cx(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                loading
                  ? "border-gray-200 bg-gray-100 text-gray-500"
                  : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
              )}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Week grid */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Week view (Mon–Sun)</h2>
              <p className="text-xs text-gray-600">
                Cells show AM / PM / ANY entries. Click an area row to edit.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              Total areas: <span className="font-semibold">{weekGrid.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Area</th>
                  <th className="px-3 py-2 text-left">Postcodes</th>
                  {ALL_DAYS.map((d) => (
                    <th key={d} className="px-3 py-2 text-center">
                      {d.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {weekGrid.length ? (
                  weekGrid.map(({ name, g, anyActive }) => (
                    <tr
                      key={name}
                      className={cx("bg-white hover:bg-gray-50")}
                      style={{ cursor: "pointer" }}
                      onClick={() => openEditorForArea(name)}
                      title="Click to edit"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={cx("font-semibold", anyActive ? "text-gray-900" : "text-gray-500")}>
                            {name}
                          </span>
                          {!anyActive ? (
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              inactive
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-gray-700">
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
                          PC: {postcodeCountByArea.get(name) || 0}
                        </span>
                      </td>

                      {ALL_DAYS.map((day) => {
                        const cell = g?.byDay?.[day] || {};
                        const present = SLOTS.filter((s) => !!cell[s]);

                        return (
                          <td key={`${name}-${day}`} className="px-3 py-2 text-center align-top">
                            {present.length ? (
                              <div className="flex flex-wrap justify-center gap-1">
                                {present.map((slot) => {
                                  const entry = cell[slot];
                                  const isOn = entry?.active !== false;
                                  return (
                                    <span
                                      key={slot}
                                      className={cx(
                                        "rounded-md px-2 py-1 text-xs font-semibold",
                                        isOn ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"
                                      )}
                                      title={isOn ? "Active" : "Inactive"}
                                    >
                                      {slot}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-10 text-center text-sm text-gray-600" colSpan={2 + ALL_DAYS.length}>
                      No areas match your filter. Click <span className="font-semibold">New area</span> to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Your data model is one row per <span className="font-mono">(area name + day + slot)</span>. This UI keeps
            that model, but hides the noise.
          </div>
        </div>
      </div>

      {/* Side panel editor */}
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-full max-w-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {areaName ? "Edit area" : "New area"}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Schedule is day × slot toggles. Postcodes/notes/active apply to the whole area.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  disabled={busy}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700">Area name</label>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  placeholder="e.g. Porthcawl"
                  disabled={busy}
                />
                {areaName && safeStr(draftName).trim() !== areaName ? (
                  <div className="mt-1 text-xs text-amber-700">
                    Renaming will update all entries for this area.
                  </div>
                ) : null}
              </div>

              {/* Active + Notes */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <label className="flex items-center gap-2 text-sm text-gray-900">
                  <input
                    type="checkbox"
                    checked={draftActive}
                    onChange={(e) => setDraftActive(e.target.checked)}
                    disabled={busy}
                  />
                  Active
                </label>
                <div className="text-xs text-gray-600">
                  If inactive, it still exists but won’t be used (unless your code ignores active — we can enforce later).
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Notes (optional)</label>
                <input
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  placeholder="Anything ops should know"
                  disabled={busy}
                />
              </div>

              {/* Schedule */}
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-gray-900">Schedule</div>
                  <div className="text-xs text-gray-600">
                    Toggle slots for each day. This creates/deletes (day+slot) rows behind the scenes.
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600">
                      <tr>
                        <th className="px-2 py-2 text-left">Day</th>
                        {SLOTS.map((s) => (
                          <th key={s} className="px-2 py-2 text-center">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ALL_DAYS.map((d) => (
                        <tr key={d}>
                          <td className="px-2 py-2 text-gray-900 font-medium">{d}</td>
                          {SLOTS.map((s) => (
                            <td key={`${d}-${s}`} className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleSlot(d, s)}
                                disabled={busy}
                                className={cx(
                                  "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                                  schedule?.[d]?.[s]
                                    ? "border-gray-900 bg-gray-900 text-white hover:bg-black"
                                    : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
                                )}
                              >
                                {schedule?.[d]?.[s] ? "On" : "Off"}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 text-xs text-gray-600">
                  Selected entries: <span className="font-semibold">{editorSummary.chosen.length}</span>
                </div>
              </div>

              {/* Postcodes */}
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Postcode prefixes</div>
                    <div className="text-xs text-gray-600">
                      Paste one per line or comma-separated. We de-dupe and uppercase.
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    Count: <span className="font-semibold">{editorSummary.prefixesCount}</span>
                  </div>
                </div>

                <textarea
                  value={draftPostcodesText}
                  onChange={(e) => setDraftPostcodesText(e.target.value)}
                  className="h-40 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  placeholder={`Examples:\nCF36\nCF33 4\nCF33 6`}
                  disabled={busy}
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const cleaned = normalisePrefixesFromText(draftPostcodesText).join("\n");
                      setDraftPostcodesText(cleaned);
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    Clean + de-dupe
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDraftPostcodesText("")}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Save */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAreaChanges}
                  disabled={busy}
                  className={cx(
                    "rounded-lg px-4 py-2 text-sm font-semibold",
                    busy ? "bg-gray-400 text-white" : "bg-gray-900 text-white hover:bg-black"
                  )}
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>

              <div className="text-xs text-gray-500">
                This editor updates rows via your existing APIs. No new tables. No hidden logic.
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
