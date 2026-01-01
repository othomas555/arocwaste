import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function getBearer(req) {
  const h = req.headers.authorization || "";
  const [t, v] = h.split(" ");
  if (t !== "Bearer" || !v) return null;
  return v;
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const body = req.body || {};
  const run_id = (body.run_id || "").toString().trim();
  const subscription_id = (body.subscription_id || "").toString().trim();

  if (!run_id) return res.status(400).json({ error: "run_id is required" });
  if (!subscription_id) return res.status(400).json({ error: "subscription_id is required" });

  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res.status(500).json({ error: "Supabase env missing" });

  const authClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid session" });

  const email = (userData.user.email || "").toLowerCase();
  if (!email) return res.status(401).json({ error: "User email missing" });

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ error: "Supabase admin not configured" });

  const { data: staff, error: staffErr } = await admin
    .from("staff")
    .select("id,active")
    .ilike("email", email)
    .maybeSingle();

  if (staffErr) return res.status(500).json({ error: staffErr.message });
  if (!staff || !staff.active) return res.status(403).json({ error: "Not an active staff member" });

  // confirm staff assigned to run
  const { data: link, error: linkErr } = await admin
    .from("daily_run_staff")
    .select("run_id")
    .eq("run_id", run_id)
    .eq("staff_id", staff.id)
    .maybeSingle();

  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!link) return res.status(403).json({ error: "You are not assigned to this run" });

  const { data: run, error: runErr } = await admin
    .from("daily_runs")
    .select("run_date")
    .eq("id", run_id)
    .single();

  if (runErr) return res.status(400).json({ error: runErr.message });
  if (!isYMD(run.run_date)) return res.status(500).json({ error: "Run date invalid" });

  const { error: delErr } = await admin
    .from("subscription_collections")
    .delete()
    .eq("subscription_id", subscription_id)
    .eq("collected_date", run.run_date);

  if (delErr) return res.status(400).json({ error: delErr.message });

  return res.status(200).json({ ok: true });
}
