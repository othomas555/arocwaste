// pages/api/ops/email-templates.js
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

function s(x) {
  return String(x || "").trim();
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(500).json({ ok: false, error: "Supabase admin not configured" });

    if (req.method === "GET") {
      const eventType = s(req.query.event_type);
      if (!eventType) return res.status(400).json({ ok: false, error: "Missing event_type" });

      const { data, error } = await supabase
        .from("email_templates")
        .select("event_type, subject, body_html, body_text, updated_at, created_at")
        .eq("event_type", eventType)
        .maybeSingle();

      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, template: data || null });
    }

    if (req.method === "POST") {
      const eventType = s(req.body?.event_type);
      const subject = s(req.body?.subject);
      const bodyHtml = String(req.body?.body_html || "");
      const bodyText = String(req.body?.body_text || "");

      if (!eventType) return res.status(400).json({ ok: false, error: "Missing event_type" });
      if (!subject) return res.status(400).json({ ok: false, error: "Missing subject" });
      if (!bodyHtml.trim()) return res.status(400).json({ ok: false, error: "Missing body_html" });

      const payload = {
        event_type: eventType,
        subject,
        body_html: bodyHtml,
        body_text: bodyText.trim() ? bodyText : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("email_templates")
        .upsert(payload, { onConflict: "event_type" });

      if (error) return res.status(500).json({ ok: false, error: error.message });

      // redirect back to ops page for a nice UX
      res.writeHead(302, { Location: `/ops/email-templates?event_type=${encodeURIComponent(eventType)}&saved=1` });
      return res.end();
    }

    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
