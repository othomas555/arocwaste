// pages/api/public/clearance-quote.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function normalizePostcode(pc) {
  return String(pc || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function safeText(x, max = 2000) {
  const s = String(x ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function isEmail(s) {
  const x = String(s || "").trim();
  if (!x) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

function isPhone(s) {
  const x = String(s || "").trim();
  if (!x) return false;
  // Very loose UK-ish validation: digits + spaces + +()-
  return /^[0-9+\-\s()]{7,30}$/.test(x);
}

async function sendResendEmail({ to, subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true, reason: "Missing RESEND_API_KEY" };

  try {
    const mod = await import("resend");
    const Resend = mod?.Resend;
    if (!Resend) return { ok: false, skipped: true, reason: "Resend SDK not available" };

    const resend = new Resend(key);

    // "from" must be a verified sender/domain in your Resend account
    const from =
      process.env.RESEND_FROM || "AROC Waste <no-reply@arocwaste.co.uk>";

    const payload = {
      from,
      to,
      subject,
      html,
    };

    if (replyTo) payload.reply_to = replyTo;

    const out = await resend.emails.send(payload);
    return { ok: true, out };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};

  const postcode = normalizePostcode(body.postcode);
  const name = safeText(body.name, 200);
  const email = safeText(body.email, 200);
  const phone = safeText(body.phone, 60);

  const clearance_type = safeText(body.clearance_type, 100);
  const address = safeText(body.address, 500);
  const access_notes = safeText(body.access_notes, 2000);
  const preferred_dates = safeText(body.preferred_dates, 500);
  const photos_links = safeText(body.photos_links, 1000);

  const route = body.route || null; // { in_area, default: {...}, postcode }

  if (!postcode) return res.status(400).json({ error: "Missing postcode" });
  if (!name) return res.status(400).json({ error: "Missing name" });

  if (email && !isEmail(email)) {
    return res.status(400).json({ error: "Email looks invalid" });
  }
  if (phone && !isPhone(phone)) {
    return res.status(400).json({ error: "Phone looks invalid" });
  }

  const in_area = !!route?.in_area;
  const def = route?.default || null;

  const row = {
    postcode,
    postcode_normalized: postcode.replace(/\s+/g, ""),
    in_area,
    route_area_id: def?.route_area_id || null,
    route_area: def?.route_area || null,
    route_day: def?.route_day || null,
    slot: def?.slot || null,
    next_date: def?.next_date || null,

    name,
    email: email || null,
    phone: phone || null,

    clearance_type: clearance_type || null,
    address: address || null,
    access_notes: access_notes || null,
    preferred_dates: preferred_dates || null,
    photos_links: photos_links || null,
  };

  const supabase = getSupabaseAdmin();

  const { data: inserted, error: insErr } = await supabase
    .from("clearance_quotes")
    .insert(row)
    .select("id,created_at")
    .single();

  if (insErr) {
    return res.status(500).json({ error: insErr.message });
  }

  // Email ops inbox
  const to = process.env.CLEARANCE_QUOTES_TO || "hello@arocwaste.co.uk";

  const subject = `Clearance quote request — ${postcode} — ${name}`;
  const whenText = def?.next_date ? def.next_date : def?.route_day ? def.route_day : "—";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h2>Clearance quote request</h2>
      <p><strong>Quote ID:</strong> ${inserted.id}</p>
      <p><strong>Created:</strong> ${inserted.created_at}</p>
      <hr />
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email || "—"}</p>
      <p><strong>Phone:</strong> ${phone || "—"}</p>
      <hr />
      <p><strong>Postcode:</strong> ${postcode}</p>
      <p><strong>In coverage:</strong> ${in_area ? "Yes" : "No"}</p>
      <p><strong>Route area:</strong> ${def?.route_area || "—"}</p>
      <p><strong>Route day:</strong> ${def?.route_day || "—"}</p>
      <p><strong>Slot:</strong> ${def?.slot || "—"}</p>
      <p><strong>Next date:</strong> ${whenText}</p>
      <hr />
      <p><strong>Type:</strong> ${clearance_type || "—"}</p>
      <p><strong>Address / nearest street:</strong><br/>${(address || "—").replace(/\n/g, "<br/>")}</p>
      <p><strong>Access notes:</strong><br/>${(access_notes || "—").replace(/\n/g, "<br/>")}</p>
      <p><strong>Preferred dates:</strong><br/>${(preferred_dates || "—").replace(/\n/g, "<br/>")}</p>
      <p><strong>Photos / links:</strong><br/>${(photos_links || "—").replace(/\n/g, "<br/>")}</p>
    </div>
  `;

  const replyTo = email && isEmail(email) ? email : undefined;

  const emailResult = await sendResendEmail({ to, subject, html, replyTo });

  return res.status(200).json({
    ok: true,
    quote_id: inserted.id,
    email: emailResult,
  });
}
