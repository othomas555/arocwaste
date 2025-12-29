import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function parseISODateOrThrow(s) {
  if (!s || typeof s !== "string") throw new Error("Missing weekStart");
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) throw new Error("Invalid weekStart");
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  // a,b are Date at midnight
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeFrequency(f) {
  const v = String(f || "").toLowerCase();
  if (v === "weekly") return "weekly";
  if (v === "fortnightly") return "fortnightly";
  if (v === "three-weekly" || v === "threeweekly" || v === "three_weekly") return "three-weekly";
  return "weekly"; // sensible default
}

function intervalDaysForFrequency(freq) {
  if (freq === "weekly") return 7;
  if (freq === "fortnightly") return 14;
  if (freq === "three-weekly") return 21;
  return 7;
}

/**
 * Due logic:
 * - each subscription has an anchor date (start of schedule)
 * - it is due in a given week if any scheduled collection date falls within weekStart..weekEnd
 */
function isDueInWeek({ anchorDate, frequency }, weekStart) {
  if (!(anchorDate instanceof Date) || Number.isNaN(anchorDate.getTime())) return false;

  const freq = normalizeFrequency(frequency);
  const interval = intervalDaysForFrequency(freq);

  const weekEnd = addDays(weekStart, 6);

  // If anchor is after week end, not due yet
  if (anchorDate.getTime() > weekEnd.getTime()) return false;

  // Find the first scheduled date on or after weekStart:
  const diff = daysBetween(anchorDate, weekStart); // can be negative
  let k = 0;

  if (diff > 0) {
    k = Math.floor(diff / interval);
    // candidate date at anchor + k*interval might still be before weekStart
  } else {
    k = 0;
  }

  let candidate = addDays(anchorDate, k * interval);
  while (candidate.getTime() < weekStart.getTime()) {
    k += 1;
    candidate = addDays(anchorDate, k * interval);
  }

  return candidate.getTime() <= weekEnd.getTime();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Simple server-side protection
  const adminKey = process.env.OPS_ADMIN_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: "Missing OPS_ADMIN_KEY env var" });
  }

  // You can set this header later if you want to lock it down tighter.
  // For now, we also accept a cookie-less approach: require the key as a request header.
  const provided = req.headers["x-ops-admin-key"];
  if (provided && provided !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body || {};
    const weekStart = parseISODateOrThrow(body.weekStart);

    const frequencyFilter = String(body.frequency || "all").toLowerCase();
    const dueOnly = Boolean(body.dueOnly);
    const postcodeFilter = String(body.postcode || "").trim().toLowerCase();

    const supabase = getSupabaseAdmin();

    // IMPORTANT:
    // Adjust these column names to match your subscriptions table if needed.
    // Expected columns:
    // id, status, frequency, extra_bags, customer_name, address, postcode, anchor_date
    //
    // If you don't have anchor_date yet, see note below.
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id, status, frequency, extra_bags, customer_name, address, postcode, anchor_date"
      )
      .in("status", ["active", "trialing"]); // keep ops list clean

    if (error) throw new Error(error.message);

    let rows = (data || []).map((r) => {
      const anchorDate = r.anchor_date ? new Date(String(r.anchor_date) + "T00:00:00") : null;
      const freq = normalizeFrequency(r.frequency);

      return {
        id: r.id,
        status: r.status || "—",
        frequency: freq,
        extra_bags: r.extra_bags ?? 0,
        customer_name: r.customer_name || "",
        address: r.address || "",
        postcode: r.postcode || "",
        is_due: anchorDate ? isDueInWeek({ anchorDate, frequency: freq }, weekStart) : false,
      };
    });

    // Filter by frequency (if requested)
    if (frequencyFilter !== "all") {
      rows = rows.filter((r) => r.frequency === frequencyFilter);
    }

    // Filter by postcode contains
    if (postcodeFilter) {
      rows = rows.filter((r) => String(r.postcode || "").toLowerCase().includes(postcodeFilter));
    }

    // Due-only
    if (dueOnly) {
      rows = rows.filter((r) => r.is_due);
    }

    // Sort: due first, then postcode, then name
    rows.sort((a, b) => {
      if (a.is_due !== b.is_due) return a.is_due ? -1 : 1;
      const pc = String(a.postcode || "").localeCompare(String(b.postcode || ""));
      if (pc !== 0) return pc;
      return String(a.customer_name || "").localeCompare(String(b.customer_name || ""));
    });

    return res.status(200).json({ rows });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Bad request" });
  }
}
