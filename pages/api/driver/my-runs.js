import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const s = String(h);
  if (!s.startsWith("Bearer ")) return null;
  return s.slice("Bearer ".length).trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase env not configured." });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing bearer token." });

  // Server-side Supabase client using anon key, validating the user via the provided JWT
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    // 1) Identify the logged-in user
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) return res.status(401).json({ error: userErr.message || "Not authenticated." });

    const email = String(userData?.user?.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ error: "Authenticated user has no email." });

    // 2) Map user email -> staff record
    const { data: staff, error: staffErr } = await supabase
      .from("staff")
      .select("id,name,email,role,active")
      .eq("email", email)
      .maybeSingle();

    if (staffErr) return res.status(500).json({ error: staffErr.message || "Failed to load staff." });
    if (!staff) return res.status(403).json({ error: "No staff record found for this email." });
    if (staff.active === false) return res.status(403).json({ error: "Staff member is inactive." });

    // 3) Load runs assigned to this staff member
    // IMPORTANT FIX: join table column is run_id (NOT daily_run_id)
    const { data: links, error: linksErr } = await supabase
      .from("daily_run_staff")
      .select(
        `
        run_id,
        daily_runs (
          id,
          run_date,
          route_area,
          route_day,
          route_slot,
          vehicle_id,
          vehicles ( registration, name )
        )
      `
      )
      .eq("staff_id", staff.id)
      .order("run_id", { ascending: false });

    if (linksErr) {
      // If your DB doesn't have the FK for nested daily_runs, this will error.
      // We'll return the error so we can see the true cause.
      return res.status(500).json({ error: linksErr.message || "Failed to load assigned runs." });
    }

    const runs = (links || [])
      .map((x) => x.daily_runs)
      .filter(Boolean);

    // Sort by date ascending so the UI grouping looks sensible
    runs.sort((a, b) => String(a.run_date || "").localeCompare(String(b.run_date || "")));

    return res.status(200).json({ staff, runs });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unexpected error." });
  }
}
