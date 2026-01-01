import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normEmail(v) {
  return (v || "").toString().trim().toLowerCase();
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("staff")
      .select("id,name,email,role,active,notes,created_at,updated_at")
      .order("active", { ascending: false })
      .order("name", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ staff: data || [] });
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const name = (body.name || "").toString().trim();
      const email = normEmail(body.email);
      const role = (body.role || "driver").toString().trim();
      const active = typeof body.active === "boolean" ? body.active : true;
      const notes = (body.notes || "").toString();

      if (!name) return res.status(400).json({ error: "name is required" });
      if (!email) return res.status(400).json({ error: "email is required" });
      if (!["admin", "driver"].includes(role))
        return res.status(400).json({ error: "role must be admin or driver" });

      const { data, error } = await supabase
        .from("staff")
        .insert([{ name, email, role, active, notes }])
        .select("id");

      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ ok: true, id: data?.[0]?.id || null });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
