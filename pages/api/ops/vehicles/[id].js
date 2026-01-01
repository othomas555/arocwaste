import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normReg(v) {
  return (v || "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing id" });
  }

  if (req.method === "PUT") {
    try {
      const body = req.body || {};
      const patch = {};

      if (body.registration !== undefined) patch.registration = normReg(body.registration);
      if (body.name !== undefined) patch.name = (body.name || "").toString().trim() || null;
      if (body.capacity_units !== undefined) {
        const n = Number(body.capacity_units);
        patch.capacity_units = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      }
      if (body.active !== undefined) patch.active = !!body.active;
      if (body.notes !== undefined) patch.notes = (body.notes || "").toString();

      if (patch.registration !== undefined && !patch.registration) {
        return res.status(400).json({ error: "registration cannot be blank" });
      }

      const { error } = await supabase.from("vehicles").update(patch).eq("id", id);
      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  if (req.method === "DELETE") {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
