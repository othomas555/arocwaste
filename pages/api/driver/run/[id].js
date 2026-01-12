// pages/api/driver/run/[id].js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function normSlot(v) {
  const s = String(v || "ANY").toUpperCase().trim();
  return ["ANY", "AM", "PM"].includes(s) ? s : "ANY";
}

function matchesRunSlot(runSlot, rowSlot) {
  const r = normSlot(runSlot);
  const raw = String(rowSlot ?? "").trim();
  const s = raw ? normSlot(raw) : "BLANK";
  if (r === "ANY") return true;
  if (r === "AM") return s === "AM" || s === "ANY" || s === "BLANK";
  if (r === "PM") return s === "PM" || s === "ANY" || s === "BLANK";
  return true;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function ymdToUTCDate(ymd) {
  const [Y, M, D] = ymd.split("-").map((n) => Number(n));
  return new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
}
function weekdayFromYMD(ymd) {
  const dt = ymdToUTCDate(ymd);
  return DAY_NAMES[dt.getUTCDay()] || null;
}
function addDaysYMD(ymd, days) {
  const dt = ymdToUTCDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function daysBetweenYMD(a, b) {
  const da = ymdToUTCDate(a);
  const db = ymdToUTCDate(b);
  return Math.round((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000));
}
function freqWeeks(frequency) {
  const f = String(frequency || "").toLowerCase().trim();
  if (f === "weekly") return 1;
  if (f === "fortnightly") return 2;
  if (f === "threeweekly") return 3;
  return 1;
}
function nextOnOrAfter(anchorYMD, routeDay) {
  if (!isValidYMD(anchorYMD)) return null;
  const aDowName = weekdayFromYMD(anchorYMD);
  const aDow = DAY_INDEX[aDowName];
  const tDow = DAY_INDEX[String(routeDay || "").trim()];
  if (aDow === undefined || tDow === undefined) return null;
  const delta = (tDow - aDow + 7) % 7;
  return addDaysYMD(anchorYMD, delta);
}
function isDueOnDate({ runDate, routeDay, anchorDate, frequency }) {
  if (!isValidYMD(runDate) || !isValidYMD(anchorDate)) return false;
  const effectiveAnchor = nextOnOrAfter(anchorDate, routeDay);
  if (!effectiveAnchor) return false;
  const diffDays = daysBetweenYMD(effectiveAnchor, runDate);
  if (diffDays < 0) return false;
  const periodDays = freqWeeks(frequency) * 7;
  return diffDays % periodDays === 0;
}

function toQtyTitle(qty, title) {
  const t = String(title || "").trim();
  if (!t) return "";
  const n = Number(qty);
  const q = Number.isFinite(n) && n > 1 ? Math.trunc(n) : 1;
  return q > 1 ? `${q} × ${t}` : t;
}

function buildBookingDescription(b) {
  const payload = b?.payload || null;

  const ds = String(payload?.driver_summary || "").trim();
  if (ds) return ds;

  const items = payload?.items;
  if (Array.isArray(items) && items.length) {
    const parts = [];
    for (const it of items) {
      const title = String(it?.title || it?.name || "").trim();
      if (!title) continue;
      const qty = Number(it?.qty ?? it?.quantity ?? 1);
      parts.push(toQtyTitle(qty, title));
    }
    if (parts.length) return parts.join(", ");
  }

  const pTitle = payload?.title;
  const pQty = payload?.qty;
  const single = toQtyTitle(pQty, pTitle);
  if (single) return single;

  const colTitle = String(b?.title || "").trim();
  if (colTitle && colTitle.toLowerCase() !== "basket order") return colTitle;

  return "One-off collection";
}

function applyStopOrder({ stopOrder, bookings, subs }) {
  const bookMap = new Map((bookings || []).map((b) => [String(b.id), b]));
  const subMap = new Map((subs || []).map((s) => [String(s.id), s]));

  const out = [];
  const used = new Set();

  if (Array.isArray(stopOrder)) {
    for (const x of stopOrder) {
      const type = String(x?.type || "").toLowerCase();
      const id = String(x?.id || "").trim();
      if (!id) continue;

      if (type === "booking") {
        const b = bookMap.get(id);
        if (b && !used.has(`b:${id}`)) {
          out.push(b);
          used.add(`b:${id}`);
        }
      } else if (type === "subscription") {
        const s = subMap.get(id);
        if (s && !used.has(`s:${id}`)) {
          out.push(s);
          used.add(`s:${id}`);
        }
      }
    }
  }

  for (const b of bookings || []) {
    const k = `b:${String(b.id)}`;
    if (!used.has(k)) out.push(b);
  }
  for (const s of subs || []) {
    const k = `s:${String(s.id)}`;
    if (!used.has(k)) out.push(s);
  }

  return out;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const runId = String(req.query.id || "").trim();
  if (!runId) return res.status(400).json({ error: "Missing run id" });

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

    const email = String(userData.user.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ error: "No email on session" });

    const { data: staffRow, error: eStaff } = await supabase
      .from("staff")
      .select("id,name,email,role,active")
      .ilike("email", email)
      .maybeSingle();

    if (eStaff) return res.status(500).json({ error: eStaff.message });
    if (!staffRow) return res.status(403).json({ error: "No staff record for this email" });
    if (staffRow.active === false) return res.status(403).json({ error: "Staff is inactive" });

    const { data: linkRow, error: eLink } = await supabase
      .from("daily_run_staff")
      .select("run_id, staff_id")
      .eq("run_id", runId)
      .eq("staff_id", staffRow.id)
      .maybeSingle();

    if (eLink) return res.status(500).json({ error: eLink.message });
    if (!linkRow) return res.status(403).json({ error: "You are not assigned to this run" });

    const { data: run, error: eRun } = await supabase
      .from("daily_runs")
      .select(
        `
        id,
        run_date,
        route_day,
        route_area,
        route_slot,
        vehicle_id,
        notes,
        created_at,
        stop_order,
        vehicles:vehicles(id, registration, name)
      `
      )
      .eq("id", runId)
      .maybeSingle();

    if (eRun) return res.status(500).json({ error: eRun.message });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (!isValidYMD(run.run_date)) {
      return res.status(500).json({ error: "Run has invalid run_date", debug: { run_date: run.run_date } });
    }

    const runSlot = normSlot(run.route_slot);

    // ---- Load open issues for this run ----
    const { data: issueRows, error: eIssues } = await supabase
      .from("run_stop_issues")
      .select("stop_type, stop_id, reason, details, created_at")
      .eq("run_id", runId)
      .is("resolved_at", null);

    if (eIssues) return res.status(500).json({ error: eIssues.message });

    const issueMap = new Map();
    for (const r of issueRows || []) {
      const t = String(r.stop_type || "").toLowerCase();
      const sid = String(r.stop_id || "");
      if (!t || !sid) continue;
      issueMap.set(`${t}:${sid}`, {
        issue_reason: r.reason || "",
        issue_details: r.details || "",
        issue_created_at: r.created_at || null,
      });
    }

    // Subscriptions
    let subsQuery = supabase
      .from("subscriptions")
      .select(
        `
        id,
        address,
        postcode,
        extra_bags,
        use_own_bin,
        ops_notes,
        status,
        route_area,
        route_day,
        route_slot,
        frequency,
        anchor_date
      `
      )
      .eq("status", "active")
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    if (runSlot !== "ANY") {
      subsQuery = subsQuery.or(`route_slot.eq.${runSlot},route_slot.eq.ANY,route_slot.is.null,route_slot.eq.""`);
    }

    const { data: subsRaw, error: eSubs } = await subsQuery;
    if (eSubs) return res.status(500).json({ error: eSubs.message });

    const subsDue = [];
    const dueSubIds = [];
    for (const s of subsRaw || []) {
      const anchor = s.anchor_date ? String(s.anchor_date).slice(0, 10) : "";
      if (!anchor) continue;
      if (!matchesRunSlot(runSlot, s.route_slot)) continue;

      if (
        isDueOnDate({
          runDate: run.run_date,
          routeDay: s.route_day,
          anchorDate: anchor,
          frequency: s.frequency,
        })
      ) {
        subsDue.push(s);
        dueSubIds.push(s.id);
      }
    }

    let collectedSet = new Set();
    if (dueSubIds.length) {
      const { data: collectedRows, error: eCollected } = await supabase
        .from("subscription_collections")
        .select("subscription_id")
        .eq("collected_date", run.run_date)
        .in("subscription_id", dueSubIds);

      if (eCollected) return res.status(500).json({ error: eCollected.message });
      for (const r of collectedRows || []) {
        if (r?.subscription_id) collectedSet.add(r.subscription_id);
      }
    }

    const subsStops = (subsDue || []).map((s) => {
      const issue = issueMap.get(`subscription:${String(s.id)}`) || null;
      return {
        type: "subscription",
        id: String(s.id),
        address: s.address || "",
        postcode: s.postcode || "",
        title: "Empty wheelie bin",
        description: "Empty wheelie bin",
        extra_bags: Number(s.extra_bags) || 0,
        use_own_bin: !!s.use_own_bin,
        ops_notes: s.ops_notes || "",
        collected: collectedSet.has(s.id),
        ...(issue ? issue : {}),
        _sortPostcode: String(s.postcode || ""),
        _sortAddress: String(s.address || ""),
      };
    });

    // Bookings
    const { data: bookingRows, error: eBookings } = await supabase
      .from("bookings")
      .select(
        `
        id,
        booking_ref,
        service_date,
        collection_date,
        route_area,
        route_day,
        route_slot,
        address,
        postcode,
        notes,
        phone,
        email,
        name,
        title,
        total_pence,
        payload,
        payment_status,
        status,
        completed_at,
        completed_by_run_id
      `
      )
      .eq("route_area", run.route_area)
      .eq("route_day", run.route_day);

    if (eBookings) return res.status(500).json({ error: eBookings.message });

    const bookingsDue = [];
    for (const b of bookingRows || []) {
      const service = b?.service_date ? String(b.service_date).slice(0, 10) : "";
      const coll = b?.collection_date ? String(b.collection_date).slice(0, 10) : "";
      const dueDate = service || coll;

      if (!dueDate || dueDate !== run.run_date) continue;
      if (!matchesRunSlot(runSlot, b.route_slot)) continue;

      const st = String(b.status || "booked").toLowerCase();
      if (st === "cancelled" || st === "canceled") continue;

      bookingsDue.push(b);
    }

    const bookingStops = (bookingsDue || []).map((b) => {
      const issue = issueMap.get(`booking:${String(b.id)}`) || null;
      return {
        type: "booking",
        id: String(b.id),
        booking_ref: b.booking_ref || "",
        address: b.address || "",
        postcode: b.postcode || "",
        customer_name: b.name || "",
        email: b.email || "",
        phone: b.phone || "",
        notes: b.notes || "",
        title: b.booking_ref || "One-off booking",
        description: buildBookingDescription(b),
        total_pence: b.total_pence ?? null,
        payment_status: b.payment_status || "",
        completed_at: b.completed_at || null,
        completed_by_run_id: b.completed_by_run_id || null,
        ...(issue ? issue : {}),
        _sortPostcode: String(b.postcode || ""),
        _sortAddress: String(b.address || ""),
      };
    });

    // Merge + order
    let merged = applyStopOrder({
      stopOrder: run.stop_order,
      bookings: bookingStops,
      subs: subsStops,
    });

    const hasStopOrder = Array.isArray(run.stop_order) && run.stop_order.length > 0;
    if (!hasStopOrder) {
      merged = merged.sort((a, b) => {
        const ta = String(a.type);
        const tb = String(b.type);
        if (ta !== tb) return ta === "booking" ? -1 : 1;
        const pc = String(a._sortPostcode || "").localeCompare(String(b._sortPostcode || ""));
        if (pc !== 0) return pc;
        return String(a._sortAddress || "").localeCompare(String(b._sortAddress || ""));
      });
    }

    const totalStops = subsStops.length;
    const totalExtraBags = subsStops.reduce((sum, s) => sum + (Number(s.extra_bags) || 0), 0);
    const totalBookings = bookingStops.length;
    const totalCompletedBookings = bookingStops.filter((b) => !!b.completed_at).length;

    const items = merged.map((x) => {
      const copy = { ...x };
      delete copy._sortPostcode;
      delete copy._sortAddress;
      return copy;
    });

    return res.status(200).json({
      ok: true,
      staff: { id: staffRow.id, name: staffRow.name, email: staffRow.email, role: staffRow.role },
      run,
      items,
      totals: { totalStops, totalExtraBags, totalBookings, totalCompletedBookings },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load driver run" });
  }
}
