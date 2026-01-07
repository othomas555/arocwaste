// pages/api/ops/subscriptions/[id].js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const ALLOWED_FREQUENCIES = new Set(["weekly", "fortnightly", "threeweekly"]);
const ALLOWED_STATUSES = new Set([
  "active",
  "pending",
  "paused",
  "cancelled",
  "canceled",
  "inactive",
]);

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function normStr(v, maxLen = 500) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.slice(0, maxLen);
}

function normSlot(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s === "AM" || s === "PM" || s === "ANY") return s;
  return "";
}

function normDateYMD(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  // Accept YYYY-MM-DD only
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

export default async function handler(req, res) {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: "Supabase admin not configured" });

  try {
    const body = req.body || {};
    const patch = {};

    // Core editable fields (ops-safe)
    if (body.frequency !== undefined) {
      const f = String(body.frequency || "").trim().toLowerCase();
      if (!ALLOWED_FREQUENCIES.has(f)) {
        return res.status(400).json({ error: "Invalid frequency" });
      }
      patch.frequency = f;
    }

    if (body.extra_bags !== undefined || body.extraBags !== undefined) {
      const v = body.extra_bags !== undefined ? body.extra_bags : body.extraBags;
      patch.extra_bags = clampInt(v, 0, 10);
    }

    if (body.status !== undefined) {
      const s = String(body.status || "").trim().toLowerCase();
      if (!ALLOWED_STATUSES.has(s)) return res.status(400).json({ error: "Invalid status" });
      patch.status = s;
    }

    // Customer details
    if (body.name !== undefined) patch.name = normStr(body.name, 120) || null;
    if (body.phone !== undefined) patch.phone = normStr(body.phone, 60) || null;
    if (body.address !== undefined) patch.address = normStr(body.address, 500) || null;
    if (body.postcode !== undefined) patch.postcode = normStr(body.postcode, 20) || null;

    // Routing fields (manual overrides)
    if (body.route_area !== undefined || body.routeArea !== undefined) {
      const v = body.route_area !== undefined ? body.route_area : body.routeArea;
      patch.route_area = normStr(v, 120) || null;
    }
    if (body.route_day !== undefined || body.routeDay !== undefined) {
      const v = body.route_day !== undefined ? body.route_day : body.routeDay;
      patch.route_day = normStr(v, 20) || null;
    }
    if (body.route_slot !== undefined || body.routeSlot !== undefined) {
      const v = body.route_slot !== undefined ? body.route_slot : body.routeSlot;
      const slot = normSlot(v);
      patch.route_slot = slot ? slot : null;
    }

    // Collection schedule dates (optional; keep simple)
    if (body.next_collection_date !== undefined || body.nextCollectionDate !== undefined) {
      const v =
        body.next_collection_date !== undefined
          ? body.next_collection_date
          : body.nextCollectionDate;
      const d = normDateYMD(v);
      patch.next_collection_date = d ? d : null;
    }
    if (body.anchor_date !== undefined || body.anchorDate !== undefined) {
      const v = body.anchor_date !== undefined ? body.anchor_date : body.anchorDate;
      const d = normDateYMD(v);
      patch.anchor_date = d ? d : null;
    }

    // Pause controls (optional)
    if (body.pause_until !== undefined || body.pauseUntil !== undefined) {
      const v = body.pause_until !== undefined ? body.pause_until : body.pauseUntil;
      const d = normDateYMD(v);
      patch.pause_until = d ? d : null;
    }
    if (body.paused_reason !== undefined || body.pausedReason !== undefined) {
      const v = body.paused_reason !== undefined ? body.paused_reason : body.pausedReason;
      patch.paused_reason = normStr(v, 200) || null;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .update(patch)
      .eq("id", id)
      .select(
        "id,status,email,name,phone,postcode,address,frequency,extra_bags,use_own_bin,route_area,route_day,route_slot,next_collection_date,anchor_date,pause_until,paused_reason,paused_at,created_at"
      )
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Update failed" });
  }
}
