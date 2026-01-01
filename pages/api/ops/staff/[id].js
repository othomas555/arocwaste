import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function normEmail(v) {
  return (v || "").toString().trim().toLowerCase();
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

      if (body.name !== undefined) patch.name = (body.name || "").toString().trim();
      if (body.email !== undefined) patch.email = normEmail(body.email);
      if (body.role !== undefined) patch.role = (body.role || "").toString().trim();
      if (body.active !== undefined) patch.active = !!body.active;
      if (body.notes !== undefined) patch.notes = (body.notes || "").toString();

      if (patch.name !== undefined && !patch.name)
        return res.status(400).json({ error: "name cannot be blank" });
      if (patch.email !== undefined && !patch.email)
        return res.status(400).json({ error: "email cannot be blank" });
      if (patch.role !== undefined && !["admin", "driver"].includes(patch.role))
        return res.status(400).json({ error: "role must be admin or driver" });

      const { error } = await supabase.from("staff").update(patch).eq("id", id);
      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  if (req.method === "DELETE") {
    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
