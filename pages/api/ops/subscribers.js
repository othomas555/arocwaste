import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function clampStr(v, max = 200) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const q = String(req.query?.q || "").trim();
      const status = String(req.query?.status || "").trim();

      let query = supabase
        .from("subscriptions")
        .select(
          "id,status,name,email,phone,postcode,address,frequency,extra_bags,use_own_bin,route_day,route_area,route_id,driver_id,start_date,next_collection_date,anchor_date,pause_from,pause_to,ops_notes,created_at,updated_at"
        )
        .order("route_day", { ascending: true })
        .order("route_area", { ascending: true })
        .order("postcode", { ascending: true });

      if (status) query = query.eq("status", status);

      if (q) {
        const safe = q.replace(/,/g, " ");
        query = query.or(
          [
            `name.ilike.%${safe}%`,
            `postcode.ilike.%${safe}%`,
            `address.ilike.%${safe}%`,
            `email.ilike.%${safe}%`,
            `phone.ilike.%${safe}%`,
            `route_area.ilike.%${safe}%`,
          ].join(",")
        );
      }

      const { data, error } = await query;
      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ subscribers: data || [] });
    }

    if (req.method === "PATCH") {
      const body = req.body || {};
      const id = body.id;

      if (!id) return res.status(400).json({ error: "Missing id" });

      const patch = {};

      if ("route_day" in body) patch.route_day = clampStr(body.route_day, 30);
      if ("route_area" in body) patch.route_area = clampStr(body.route_area, 80);
      if ("driver_id" in body) patch.driver_id = body.driver_id ? String(body.driver_id) : null;
      if ("route_id" in body) patch.route_id = body.route_id ? String(body.route_id) : null;

      if ("next_collection_date" in body) {
        const v = body.next_collection_date;
        if (v === null || v === "") patch.next_collection_date = null;
        else if (!isISODate(v))
          return res.status(400).json({ error: "next_collection_date must be YYYY-MM-DD" });
        else patch.next_collection_date = v;
      }

      if ("pause_from" in body) {
        const v = body.pause_from;
        if (v === null || v === "") patch.pause_from = null;
        else if (!isISODate(v))
          return res.status(400).json({ error: "pause_from must be YYYY-MM-DD" });
        else patch.pause_from = v;
      }

      if ("pause_to" in body) {
        const v = body.pause_to;
        if (v === null || v === "") patch.pause_to = null;
        else if (!isISODate(v))
          return res.status(400).json({ error: "pause_to must be YYYY-MM-DD" });
        else patch.pause_to = v;
      }

      if ("ops_notes" in body) patch.ops_notes = clampStr(body.ops_notes, 2000);

      if ("status" in body) {
        patch.status = clampStr(body.status, 40);
      }

      patch.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("subscriptions")
        .update(patch)
        .eq("id", id)
        .select(
          "id,status,route_day,route_area,driver_id,route_id,next_collection_date,pause_from,pause_to,ops_notes,updated_at"
        )
        .single();

      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ ok: true, subscriber: data });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("API /api/ops/subscribers crashed:", e);
    return res.status(500).json({ error: e?.message || String(e) || "Server error" });
  }
}
