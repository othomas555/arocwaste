import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const { data, error } = await supabase
      .from("staff")
      .select("id,name,email,role,active")
      .eq("active", true)
      .order("role", { ascending: true })
      .order("name", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ staff: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to load staff" });
  }
}
