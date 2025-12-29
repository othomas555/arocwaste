import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function parseISODateOrThrow(s) {
  if (!s || typeof s !== "string") throw new Error("Missing weekStart");
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) throw new Error("Invalid weekStart");
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  /* ──────────────────────────────────────────────
     Simple ops protection
  ────────────────────────────────────────────── */
  const adminKey = process.env.OPS_ADMIN_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: "Missing OPS_ADMIN_KEY env var" });
  }

  const provided = req.headers["x-ops-admin-key"];
  if (provided && provided !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body || {};
    const weekStart = parseISODateOrThrow(body.weekStart);
    const weekEnd = addDays(weekStart, 6);

    const frequencyFilter = String(body.frequency || "all").toLowerCase();
    const dueOnly = Boolean(body.dueOnly);
    const postcodeFilter = String(body.postcode || "").trim().toLowerCase();

    const supabase = getSupabaseAdmin();

    /* ──────────────────────────────────────────────
       Pull active, not-paused subscriptions
       using next_collection_date as truth
    ────────────────────────────────────────────── */
    const { data, error } = await supabase
      .from("subscriptions")
      .select(`
        id,
        status,
        name,
        frequency,
        extra_bags,
        address,
        postcode,
        route_area,
        service_day,
        next_collection_date,
        pause_from,
        pause_to
      `)
      .in("status", ["active", "trialing"]);

    if (error) throw new Error(error.message);

    let rows = (data || [])
      .map((r) => {
        if (!r.next_collection_date) return null;

        const nextDate = new Date(r.next_collection_date + "T00:00:00");
        const isPaused =
          (r.pause_from && nextDate >= new Date(r.pause_from + "T00:00:00")) &&
          (r.pause_to && nextDate <= new Date(r.pause_to + "T00:00:00"));

        if (isPaused) return null;

        const isDue =
          nextDate >= weekStart && nextDate <= weekEnd;

        return {
          id: r.id,
          status: r.status,
          customer_name: r.name || "—",
          frequency: r.frequency || "—",
          extra_bags: r.extra_bags ?? 0,
          address: r.address || "—",
          postcode: r.postcode || "—",
          route_area: r.route_area || "—",
          service_day: r.service_day ?? null,
          next_collection_date: r.next_collection_date,
          is_due: isDue,
        };
      })
      .filter(Boolean);

    /* ──────────────────────────────────────────────
       Filters
    ────────────────────────────────────────────── */
    if (frequencyFilter !== "all") {
      rows = rows.filter(
        (r) => String(r.frequency).toLowerCase() === frequencyFilter
      );
    }

    if (postcodeFilter) {
      rows = rows.filter((r) =>
        String(r.postcode).toLowerCase().includes(postcodeFilter)
      );
    }

    if (dueOnly) {
      rows = rows.filter((r) => r.is_due);
    }

    /* ──────────────────────────────────────────────
       Sort for ops:
       route_area → service_day → postcode
    ────────────────────────────────────────────── */
    rows.sort((a, b) => {
      if (a.route_area !== b.route_area) {
        return String(a.route_area).localeCompare(String(b.route_area));
      }

      if ((a.service_day ?? 99) !== (b.service_day ?? 99)) {
        return (a.service_day ?? 99) - (b.service_day ?? 99);
      }

      return String(a.postcode).localeCompare(String(b.postcode));
    });

    return res.status(200).json({ rows });
  } catch (e) {
    return res.status(400).json({
      error: e.message || "Bad request",
    });
  }
}
