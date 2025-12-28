import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in Vercel",
      });
    }

    // simple query: check table exists and we can read
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .limit(1);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, sample: data || [] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
