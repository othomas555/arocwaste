// pages/api/ops/clearance-quotes/set-status.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const ALLOWED = new Set(["new", "quoted", "booked", "closed"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();

  if (!id) return res.status(400).json({ error: "Missing id" });
  if (!ALLOWED.has(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("clearance_quotes")
    .update({ status })
    .eq("id", id)
    .select("id,status")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, item: data });
}
