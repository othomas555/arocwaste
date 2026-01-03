// pages/api/ops/route-areas/[id].js
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
  let raw = [];
  if (Array.isArray(input)) raw = input;
  else if (typeof input === "string") raw = input.split(/[\n,]+/g);
  else raw = [];

  const cleaned = raw
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase().replace(/\s+/g, " ").trim());

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
  const id = req.query.id;

  if (!id) return bad(res, "Missing id.");

  if (req.method === "PUT") {
    const body = req.body || {};
    const patch = {};

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return bad(res, "Name cannot be blank.");
      patch.name = name;
    }

    if (body.route_day !== undefined) {
      const route_day = String(body.route_day || "").trim();
      if (!DAYS.has(route_day)) return bad(res, "route_day must be a valid day name (e.g. Monday).");
      patch.route_day = route_day;
    }

    if (body.slot !== undefined) {
      const slot = String(body.slot || "").trim();
      if (!SLOTS.has(slot)) return bad(res, "slot must be AM, PM, or ANY.");
      patch.slot = slot;
    }

    if (body.active !== undefined) patch.active = !!body.active;

    if (body.notes !== undefined) {
      const notes = body.notes ? String(body.notes).trim() : null;
      patch.notes = notes;
    }

    if (body.postcode_prefixes !== undefined) {
      patch.postcode_prefixes = normalizePrefixes(body.postcode_prefixes);
    }

    if (!Object.keys(patch).length) return bad(res, "Nothing to update.");

    const { error } = await supabase.from("route_areas").update(patch).eq("id", id);
    if (error) return bad(res, error.message, 500);

    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { error } = await supabase.from("route_areas").delete().eq("id", id);
    if (error) return bad(res, error.message, 500);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, DELETE");
  return bad(res, "Method not allowed", 405);
}
