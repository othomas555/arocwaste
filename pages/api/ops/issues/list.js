// pages/api/ops/issues/list.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function uniq(xs) {
  return Array.from(new Set((xs || []).filter(Boolean).map((x) => String(x))));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const status = String(req.query.status || "open").toLowerCase(); // open|closed|all
    const onlyOpen = status === "open";
    const onlyClosed = status === "closed";

    let q = supabase
      .from("run_stop_issues")
      .select(
        `
        id,
        run_id,
        stop_type,
        stop_id,
        reason,
        details,
        created_at,
        created_by_staff_id,
        resolved_at,
        resolved_by_staff_id,
        resolution_action,
        resolution_outcome,
        run:daily_runs(id, run_date, route_area, route_day, route_slot),
        created_by:staff!run_stop_issues_created_by_staff_id(id, name),
        resolved_by:staff!run_stop_issues_resolved_by_staff_id(id, name)
      `
      )
      .order("created_at", { ascending: false });

    if (onlyOpen) q = q.is("resolved_at", null);
    if (onlyClosed) q = q.not("resolved_at", "is", null);

    const { data: issues, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const rows = issues || [];

    // Fetch stop details in batches
    const bookingIds = uniq(rows.filter((r) => r.stop_type === "booking").map((r) => r.stop_id));
    const subIds = uniq(rows.filter((r) => r.stop_type === "subscription").map((r) => r.stop_id));

    let bookingMap = new Map();
    if (bookingIds.length) {
      const { data: bs, error: eB } = await supabase
        .from("bookings")
        .select("id, booking_ref, address, postcode, name, phone, email, notes, total_pence, payload")
        .in("id", bookingIds);
      if (eB) return res.status(500).json({ error: eB.message });
      bookingMap = new Map((bs || []).map((b) => [String(b.id), b]));
    }

    let subMap = new Map();
    if (subIds.length) {
      const { data: ss, error: eS } = await supabase
        .from("subscriptions")
        .select("id, address, postcode, extra_bags, use_own_bin, ops_notes")
        .in("id", subIds);
      if (eS) return res.status(500).json({ error: eS.message });
      subMap = new Map((ss || []).map((s) => [String(s.id), s]));
    }

    const hydrated = rows.map((r) => {
      const t = String(r.stop_type || "").toLowerCase();
      const sid = String(r.stop_id || "");
      const stop = t === "booking" ? bookingMap.get(sid) : subMap.get(sid);

      return {
        ...r,
        stop: stop || null,
      };
    });

    return res.status(200).json({ ok: true, issues: hydrated });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to list issues" });
  }
}
