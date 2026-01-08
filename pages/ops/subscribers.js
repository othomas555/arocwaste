// pages/ops/subscribers.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "../../lib/supabaseClient";

const FREQUENCY_TO_DAYS = {
  weekly: 7,
  fortnightly: 14,
  "three-weekly": 21,
};

const ROUTE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROUTE_SLOTS = [
  { value: "", label: "(blank)" },
  { value: "ANY", label: "ANY" },
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

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
function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function ymdToDateNoonUTC(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function dateToYMDUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDaysYMD(ymd, days) {
  const dt = ymdToDateNoonUTC(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dateToYMDUTC(dt);
}
function weekdayOfYMD(ymd) {
  const d = ymdToDateNoonUTC(ymd).getUTCDay();
  const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[d];
}
function nextOccurrenceOfWeekday(fromYMD, desiredDayName) {
  const start = ymdToDateNoonUTC(fromYMD);
  const desiredIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(
    desiredDayName
  );
  if (desiredIndex === -1) return fromYMD;
  const startIndex = start.getUTCDay();
  const delta = (desiredIndex - startIndex + 7) % 7;
  const out = new Date(start);
  out.setUTCDate(out.getUTCDate() + delta);
  return dateToYMDUTC(out);
}
function computeNextFromAnchor({ anchorYMD, frequencyDays, todayYMD }) {
  let next = anchorYMD;
  for (let i = 0; i < 2000; i++) {
    if (next >= todayYMD) return next;
    next = addDaysYMD(next, frequencyDays);
  }
  return null;
}

function prettySlot(s) {
  const v = (s || "").toString().toUpperCase();
  if (!v) return "(blank)";
  return v;
}

export default function OpsSubscribersPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        r.name,
        r.email,
        r.phone,
        r.postcode,
        r.address,
        r.route_area,
        r.route_day,
        r.route_slot,
        r.frequency,
        r.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const [editing, setEditing] = useState(null); // subscription row
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveWarnings, setSaveWarnings] = useState([]);

  // Edit form state
  const [form, setForm] = useState({
    route_day: "",
    route_area: "",
    route_slot: "",
    frequency: "weekly",
  });

  // Explicit scheduling controls
  const [schedulingMode, setSchedulingMode] = useState("AUTO_FROM_ANCHOR"); // AUTO_FROM_ANCHOR | MANUAL_NEXT
  const [manualNext, setManualNext] = useState("");
  const [setAnchorToNext, setSetAnchorToNext] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr("");
      setLoading(true);
      try {
        if (!supabaseClient) throw new Error("supabaseClient is not configured");

        const { data, error } = await supabaseClient
          .from("subscriptions")
          .select(
            "id, status, name, email, phone, address, postcode, route_day, route_area, route_slot, frequency, next_collection_date, anchor_date, use_own_bin, extra_bags"
          )
          .order("postcode", { ascending: true })
          .order("address", { ascending: true })
          .limit(2000);

        if (error) throw error;
        if (!cancelled) setRows(data || []);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load subscribers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function openEdit(r) {
    setSaveMsg("");
    setSaveWarnings([]);
    setEditing(r);

    setForm({
      route_day: r.route_day || "",
      route_area: r.route_area || "",
      route_slot: (r.route_slot || "").toString().toUpperCase(),
      frequency: r.frequency || "weekly",
    });

    // Default scheduling mode rules:
    // - If route_day changes, we’ll encourage MANUAL_NEXT, but we don’t force it.
    setSchedulingMode("AUTO_FROM_ANCHOR");
    setManualNext("");
    setSetAnchorToNext(false);
  }

  function closeEdit() {
    setEditing(null);
    setSaveBusy(false);
    setSaveMsg("");
    setSaveWarnings([]);
  }

  const preview = useMemo(() => {
    if (!editing) return null;

    const today = londonTodayYMD();
    const freqDays = FREQUENCY_TO_DAYS[form.frequency] || 7;

    const current = {
      route_day: editing.route_day || "",
      route_area: editing.route_area || "",
      route_slot: (editing.route_slot || "").toString().toUpperCase(),
      frequency: editing.frequency || "",
      next_collection_date: editing.next_collection_date || "",
      anchor_date: editing.anchor_date || "",
    };

    const next = {
      route_day: form.route_day || "",
      route_area: form.route_area || "",
      route_slot: (form.route_slot || "").toString().toUpperCase(),
      frequency: form.frequency || "",
    };

    const warnings = [];

    const routeDayChanged = (current.route_day || "") !== (next.route_day || "");
    const freqChanged = (current.frequency || "") !== (next.frequency || "");

    // Compute what would happen if AUTO_FROM_ANCHOR:
    let autoAnchor = isValidYMD(current.anchor_date) ? current.anchor_date : null;
    if (!autoAnchor) {
      autoAnchor = isValidYMD(current.next_collection_date) ? current.next_collection_date : today;
      warnings.push("anchor_date is missing; AUTO preview uses fallback (next_collection_date or today).");
    }

    const autoNext = computeNextFromAnchor({ anchorYMD: autoAnchor, frequencyDays: freqDays, todayYMD: today });

    if (!autoNext) warnings.push("Could not compute AUTO next_collection_date (unexpected).");

    // Manual suggestion if route_day changed
    let suggestedManualNext = "";
    if (next.route_day) {
      suggestedManualNext = nextOccurrenceOfWeekday(today, next.route_day);
    }

    // Alignment warnings (for AUTO preview)
    if (autoNext && next.route_day) {
      const wd = weekdayOfYMD(autoNext);
      if (wd !== next.route_day) {
        warnings.push(
          `AUTO next_collection_date would be ${autoNext} (${wd}) which does not match route_day (${next.route_day}).`
        );
      }
    }
    if (autoAnchor && next.route_day) {
      const awd = weekdayOfYMD(autoAnchor);
      if (awd !== next.route_day) {
        warnings.push(
          `anchor_date basis is ${autoAnchor} (${awd}) which does not match route_day (${next.route_day}).`
        );
      }
    }

    // Encourage explicit manual control if route_day changes
    if (routeDayChanged) {
      warnings.push(
        "You changed route_day. Consider switching to MANUAL next date so you can set a clean next_collection_date (and optionally re-anchor)."
      );
    }
    if (freqChanged && !routeDayChanged) {
      // good case
      // no extra warning needed
    }

    return {
      today,
      current,
      next,
      routeDayChanged,
      freqChanged,
      autoAnchor,
      autoNext,
      suggestedManualNext,
      warnings,
    };
  }, [editing, form]);

  async function save() {
    if (!editing) return;
    setSaveBusy(true);
    setSaveMsg("");
    setSaveWarnings([]);

    try {
      // Front-end safety checks (server also enforces)
      if (form.frequency && !FREQUENCY_TO_DAYS[form.frequency]) {
        throw new Error("Invalid frequency selected");
      }
      if (form.route_day && !ROUTE_DAYS.includes(form.route_day)) {
        throw new Error("Invalid route day");
      }
      if (form.route_slot && !["", "ANY", "AM", "PM"].includes(form.route_slot)) {
        throw new Error("Invalid slot");
      }

      if (schedulingMode === "MANUAL_NEXT") {
        if (!isValidYMD(manualNext)) {
          throw new Error("Manual next date is required (YYYY-MM-DD)");
        }
      }

      const resp = await fetch("/api/ops/subscriptions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id: editing.id,
          route_day: form.route_day || null,
          route_area: (form.route_area || "").trim() || null,
          route_slot: form.route_slot || "",
          frequency: form.frequency,
          scheduling_mode: schedulingMode,
          manual_next_collection_date: schedulingMode === "MANUAL_NEXT" ? manualNext : null,
          set_anchor_to_next: schedulingMode === "MANUAL_NEXT" ? !!setAnchorToNext : false,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || "Update failed");
      }

      // Update local list
      setRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? {
                ...r,
                route_day: json.after.route_day,
                route_area: json.after.route_area,
                route_slot: json.after.route_slot,
                frequency: json.after.frequency,
                next_collection_date: json.after.next_collection_date,
                anchor_date: json.after.anchor_date,
              }
            : r
        )
      );

      setSaveWarnings(json.warnings || []);
      setSaveMsg("Saved.");
      // keep modal open so ops can read warnings, but refresh editing row:
      setEditing((cur) =>
        cur
          ? {
              ...cur,
              route_day: json.after.route_day,
              route_area: json.after.route_area,
              route_slot: json.after.route_slot,
              frequency: json.after.frequency,
              next_collection_date: json.after.next_collection_date,
              anchor_date: json.after.anchor_date,
            }
          : cur
      );
    } catch (e) {
      setSaveMsg(e?.message || "Save failed");
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Subscribers</h1>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Safe edits with explicit scheduling preview (no silent magic).
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/ops/dashboard">← Ops Dashboard</Link>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, postcode, address, route area, etc..."
          style={{
            flex: 1,
            padding: "10px 12px",
            border: "1px solid #ddd",
            borderRadius: 10,
          }}
        />
        <button
          onClick={() => {
            setQ("");
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>

      {err ? (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #f99", borderRadius: 10, background: "#fff5f5" }}>
          {err}
        </div>
      ) : null}

      {loading ? (
        <div style={{ marginTop: 18, opacity: 0.75 }}>Loading…</div>
      ) : (
        <div style={{ marginTop: 18, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["Name", "Postcode", "Address", "Status", "Freq", "Route", "Slot", "Next", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderBottom: "1px solid #eee",
                        fontWeight: 600,
                        fontSize: 13,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600 }}>{r.name || "(no name)"}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{r.email || ""}</div>
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      {r.postcode || ""}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", minWidth: 280 }}>
                      {r.address || ""}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      {r.status || ""}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      {r.frequency || ""}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      {r.route_day || ""} {r.route_area ? `• ${r.route_area}` : ""}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      {prettySlot(r.route_slot)}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      {r.next_collection_date || ""}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => openEdit(r)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 16, opacity: 0.75 }}>
                      No matches.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            zIndex: 50,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
        >
          <div
            style={{
              width: "min(980px, 100%)",
              background: "white",
              borderRadius: 16,
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 16, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{editing.name || "(no name)"}</div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  {editing.postcode || ""} • {editing.address || ""}
                </div>
              </div>
              <button
                onClick={closeEdit}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Left: Edit fields */}
              <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Edit route & frequency</div>

                <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Route day</label>
                <select
                  value={form.route_day}
                  onChange={(e) => setForm((p) => ({ ...p, route_day: e.target.value }))}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginBottom: 12 }}
                >
                  <option value="">(blank)</option>
                  {ROUTE_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Route area</label>
                <input
                  value={form.route_area}
                  onChange={(e) => setForm((p) => ({ ...p, route_area: e.target.value }))}
                  placeholder="e.g. Pyle East"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginBottom: 12 }}
                />

                <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Slot</label>
                <select
                  value={form.route_slot}
                  onChange={(e) => setForm((p) => ({ ...p, route_slot: e.target.value }))}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginBottom: 12 }}
                >
                  {ROUTE_SLOTS.map((s) => (
                    <option key={s.value || "blank"} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option value="weekly">weekly</option>
                  <option value="fortnightly">fortnightly</option>
                  <option value="three-weekly">three-weekly</option>
                </select>

                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #eee" }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Scheduling mode</div>

                  <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                    <input
                      type="radio"
                      checked={schedulingMode === "AUTO_FROM_ANCHOR"}
                      onChange={() => setSchedulingMode("AUTO_FROM_ANCHOR")}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>AUTO (from anchor)</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Recalculate next_collection_date from anchor_date + frequency (explicit preview on right).
                      </div>
                    </div>
                  </label>

                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input
                      type="radio"
                      checked={schedulingMode === "MANUAL_NEXT"}
                      onChange={() => {
                        setSchedulingMode("MANUAL_NEXT");
                        // Suggest a sane default when switching:
                        const today = londonTodayYMD();
                        const suggested = form.route_day ? nextOccurrenceOfWeekday(today, form.route_day) : today;
                        setManualNext((cur) => (cur && isValidYMD(cur) ? cur : suggested));
                      }}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>MANUAL next date</div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                        Use when route_day changes or you want a clean reset.
                      </div>

                      <input
                        type="date"
                        value={manualNext}
                        onChange={(e) => setManualNext(e.target.value)}
                        disabled={schedulingMode !== "MANUAL_NEXT"}
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: schedulingMode === "MANUAL_NEXT" ? "white" : "#fafafa",
                        }}
                      />

                      <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                        <input
                          type="checkbox"
                          checked={setAnchorToNext}
                          onChange={(e) => setSetAnchorToNext(e.target.checked)}
                          disabled={schedulingMode !== "MANUAL_NEXT"}
                        />
                        <span style={{ fontSize: 13 }}>
                          Also set <b>anchor_date</b> to this next date (explicit re-anchor)
                        </span>
                      </label>
                    </div>
                  </label>
                </div>
              </div>

              {/* Right: Preview + warnings */}
              <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Preview (before you save)</div>

                {preview ? (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                      Today (London): <b>{preview.today}</b>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={{ padding: 12, borderRadius: 12, border: "1px solid #eee", background: "#fafafa" }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Current</div>
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                          <div>
                            Route: <b>{preview.current.route_day || "(blank)"}</b> •{" "}
                            <b>{preview.current.route_area || "(blank)"}</b>
                          </div>
                          <div>
                            Slot: <b>{prettySlot(preview.current.route_slot)}</b>
                          </div>
                          <div>
                            Frequency: <b>{preview.current.frequency || "(blank)"}</b>
                          </div>
                          <div>
                            Anchor: <b>{preview.current.anchor_date || "(null)"}</b>
                          </div>
                          <div>
                            Next: <b>{preview.current.next_collection_date || "(null)"}</b>
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: 12, borderRadius: 12, border: "1px solid #eee" }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>After save</div>
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                          <div>
                            Route: <b>{preview.next.route_day || "(blank)"}</b> • <b>{preview.next.route_area || "(blank)"}</b>
                          </div>
                          <div>
                            Slot: <b>{prettySlot(preview.next.route_slot)}</b>
                          </div>
                          <div>
                            Frequency: <b>{preview.next.frequency || "(blank)"}</b>
                          </div>

                          {schedulingMode === "AUTO_FROM_ANCHOR" ? (
                            <>
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee" }}>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>AUTO result</div>
                                <div>
                                  Anchor used: <b>{preview.autoAnchor}</b>
                                </div>
                                <div>
                                  Next becomes: <b>{preview.autoNext || "(failed)"}</b>{" "}
                                  {preview.autoNext ? (
                                    <span style={{ opacity: 0.75 }}>({weekdayOfYMD(preview.autoNext)})</span>
                                  ) : null}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee" }}>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>MANUAL result</div>
                                <div>
                                  Next becomes: <b>{manualNext || "(required)"}</b>{" "}
                                  {manualNext && isValidYMD(manualNext) ? (
                                    <span style={{ opacity: 0.75 }}>({weekdayOfYMD(manualNext)})</span>
                                  ) : null}
                                </div>
                                <div>
                                  Anchor update:{" "}
                                  <b>{setAnchorToNext ? "YES (anchor_date = next)" : "NO (leave anchor_date)"}</b>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Warnings */}
                    {(preview.warnings?.length || 0) > 0 ? (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid #fde68a",
                          background: "#fffbeb",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Warnings</div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                          {preview.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                        {preview.routeDayChanged && preview.suggestedManualNext ? (
                          <div style={{ marginTop: 10, fontSize: 13 }}>
                            Suggested MANUAL next date for {preview.next.route_day}: <b>{preview.suggestedManualNext}</b>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Save response warnings */}
                    {(saveWarnings?.length || 0) > 0 ? (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid #fde68a",
                          background: "#fffbeb",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Server warnings (saved)</div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                          {saveWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {saveMsg ? (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid #eee",
                          background: "#fafafa",
                          fontSize: 13,
                        }}
                      >
                        {saveMsg}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button
                        onClick={closeEdit}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "white",
                          cursor: "pointer",
                        }}
                        disabled={saveBusy}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={save}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #111",
                          background: "#111",
                          color: "white",
                          cursor: "pointer",
                          opacity: saveBusy ? 0.7 : 1,
                        }}
                        disabled={saveBusy}
                      >
                        {saveBusy ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ opacity: 0.75 }}>No preview.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
