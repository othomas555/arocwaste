// pages/api/me.js
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(500).json({ ok: false, error: "Supabase admin not configured" });

    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const accessToken = m ? m[1] : "";
    if (!accessToken) return res.status(401).json({ ok: false, error: "Missing token" });

    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data?.user) return res.status(401).json({ ok: false, error: "Invalid token" });

    return res.status(200).json({
      ok: true,
      id: data.user.id,
      email: data.user.email,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
