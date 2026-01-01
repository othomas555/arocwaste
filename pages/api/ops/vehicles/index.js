import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normReg(v) {
  return (v || "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id,registration,name,capacity_units,active,notes,created_at,updated_at")
      .order("active", { ascending: false })
      .order("registration", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ vehicles: data || [] });
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const registration = normReg(body.registration);
      const name = (body.name || "").toString().trim() || null;
      const capacity_units = Number.isFinite(Number(body.capacity_units))
        ? Math.max(0, Math.floor(Number(body.capacity_units)))
        : 0;
      const active = typeof body.active === "boolean" ? body.active : true;
      const notes = (body.notes || "").toString();

      if (!registration) return res.status(400).json({ error: "registration is required" });

      const { data, error } = await supabase
        .from("vehicles")
        .insert([{ registration, name, capacity_units, active, notes }])
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
