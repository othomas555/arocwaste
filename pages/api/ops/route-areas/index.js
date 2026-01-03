// pages/api/ops/route-areas/index.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const DAYS = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);
const SLOTS = new Set(["AM", "PM", "ANY"]);

function normalizePrefixes(input) {
  // Accept: array, comma-separated, newline-separated
  let raw = [];
  if (Array.isArray(input)) raw = input;
  else if (typeof input === "string") raw = input.split(/[\n,]+/g);
  else raw = [];

  const cleaned = raw
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase().replace(/\s+/g, " ").trim()); // keep internal spaces e.g. "CF33 4"

  // Deduplicate while preserving order
  const seen = new Set();
  const out = [];
  for (const p of cleaned) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function bad(res, msg, status = 400) {
  return res.status(status).json({ error: msg });
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("route_areas")
      .select("id,name,route_day,slot,postcode_prefixes,active,notes,created_at,updated_at")
      .order("active", { ascending: false })
      .order("name", { ascending: true });

    if (error) return bad(res, error.message, 500);
    return res.status(200).json({ data: data || [] });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const route_day = String(body.route_day || "").trim();
    const slot = String(body.slot || "ANY").trim();
    const active = body.active === undefined ? true : !!body.active;
    const notes = body.notes ? String(body.notes).trim() : null;
    const postcode_prefixes = normalizePrefixes(body.postcode_prefixes);

    if (!name) return bad(res, "Name is required.");
    if (!DAYS.has(route_day)) return bad(res, "route_day must be a valid day name (e.g. Monday).");
    if (!SLOTS.has(slot)) return bad(res, "slot must be AM, PM, or ANY.");

    const { data, error } = await supabase
      .from("route_areas")
      .insert([
        {
          name,
          route_day,
          slot,
          active,
          notes,
          postcode_prefixes,
        },
      ])
      .select("id")
      .single();

    if (error) return bad(res, error.message, 500);
    return res.status(200).json({ id: data.id });
  }

  res.setHeader("Allow", "GET, POST");
  return bad(res, "Method not allowed", 405);
}
