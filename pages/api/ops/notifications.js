// pages/api/ops/notifications.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function asStr(x) {
  return String(x || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin not configured" });
    }

    // Auth: require a Supabase access token from the client
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const accessToken = m ? m[1] : "";
    if (!accessToken) {
      return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Invalid or expired token" });
    }

    const userId = userData.user.id;

    // Authorize: only Ops/admin/staff
    // NOTE: assumes you have profiles(id uuid pk, role text)
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      return res.status(500).json({ ok: false, error: `Failed to read profile: ${profErr.message}` });
    }

    const role = (profile?.role || "").toLowerCase();
    const allowed = ["ops", "admin", "staff"];
    if (!allowed.includes(role)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    // Filters
    const page = clampInt(req.query.page, 1, 5000);
    const pageSize = clampInt(req.query.pageSize, 25, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const status = asStr(req.query.status); // queued|sent|cancelled|failed
    const eventType = asStr(req.query.event_type);
    const q = asStr(req.query.q); // search string: email, target_id, event_type
    const targetType = asStr(req.query.target_type);
    const targetId = asStr(req.query.target_id);

    let query = supabaseAdmin
      .from("notification_queue")
      .select(
        "id, created_at, event_type, target_type, target_id, recipient_email, scheduled_at, status, sent_at, cancelled_at, last_error, payload",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (eventType) query = query.eq("event_type", eventType);
    if (targetType) query = query.eq("target_type", targetType);
    if (targetId) query = query.eq("target_id", targetId);

    // Simple search across a few useful fields.
    // NOTE: Using OR requires PostgREST syntax; keep it minimal and safe.
    if (q) {
      const esc = q.replace(/,/g, ""); // avoid breaking OR syntax
      query = query.or(
        `recipient_email.ilike.%${esc}%,target_id.ilike.%${esc}%,event_type.ilike.%${esc}%`
      );
    }

    query = query.range(from, to);

    const { data: rows, error, count } = await query;

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({
      ok: true,
      page,
      pageSize,
      total: count || 0,
      rows: rows || [],
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
