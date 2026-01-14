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

function getAllowedOpsDomains() {
  // Comma-separated list, e.g. "cox-skips.co.uk,arocwaste.co.uk"
  // If not set, default to cox-skips.co.uk
  const raw = process.env.OPS_ALLOWED_EMAIL_DOMAINS || "cox-skips.co.uk";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function emailAllowed(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  const domain = e.split("@").pop();
  if (!domain) return false;

  const allowed = getAllowedOpsDomains();
  return allowed.includes(domain);
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

    // Authorize: only Ops/staff emails (keeps this endpoint locked down without needing profiles table)
    const email = userData.user.email || "";
    if (!emailAllowed(email)) {
      return res.status(403).json({
        ok: false,
        error: "Forbidden",
        detail: `Email domain not allowed for Ops access.`,
      });
    }

    // Filters
    const page = clampInt(req.query.page, 1, 5000);
    const pageSize = clampInt(req.query.pageSize, 25, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const status = asStr(req.query.status);
    const eventType = asStr(req.query.event_type);
    const q = asStr(req.query.q);
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

    if (q) {
      const esc = q.replace(/,/g, "");
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
