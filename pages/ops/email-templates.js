// pages/ops/email-templates.js
import Link from "next/link";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

const KNOWN_EVENT_TYPES = ["subscription_collected", "booking_completed"];

export default function OpsEmailTemplatesPage({ eventType, template, saved, error }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Email templates</h1>
          <p className="text-sm text-gray-600">
            Optional overrides by <code className="px-1 py-0.5 bg-gray-100 rounded">event_type</code>. If no template exists, the system uses the built-in email.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ops" className="text-sm underline">
            Back to Ops
          </Link>
          <Link href="/ops/notifications" className="text-sm underline">
            Notifications
          </Link>
        </div>
      </div>

      {saved ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-sm">
          Saved.
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-900 text-sm">
          {error}
        </div>
      ) : null}

      <form method="GET" className="rounded border p-4 space-y-2">
        <label className="block text-xs text-gray-600">Select event type</label>
        <div className="flex items-center gap-2">
          <select name="event_type" defaultValue={eventType} className="border rounded px-3 py-2 text-sm">
            {KNOWN_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="px-3 py-2 text-sm rounded border" type="submit">
            Load
          </button>
        </div>
      </form>

      <div className="rounded border p-4 space-y-3">
        <div className="text-sm font-semibold">Editing: {eventType}</div>

        <div className="text-xs text-gray-600">
          Use placeholders like <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{name}}"}</code>,{" "}
          <code className="px-1 py-0.5 bg-gray-100 rounded">{"{{postcode}}"}</code>, etc — values come from{" "}
          <code className="px-1 py-0.5 bg-gray-100 rounded">notification_queue.payload</code>.
        </div>

        <form method="POST" action="/api/ops/email-templates" className="space-y-3">
          <input type="hidden" name="event_type" value={eventType} />

          <div>
            <label className="block text-xs text-gray-600 mb-1">Subject</label>
            <input
              name="subject"
              className="w-full border rounded px-3 py-2 text-sm"
              defaultValue={template?.subject || ""}
              placeholder="e.g. Thanks — your bin has been collected"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Body (HTML)</label>
            <textarea
              name="body_html"
              className="w-full border rounded px-3 py-2 text-sm font-mono"
              rows={14}
              defaultValue={template?.body_html || ""}
              placeholder="<p>Hello {{name}}, ...</p>"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Body (plain text) — optional</label>
            <textarea
              name="body_text"
              className="w-full border rounded px-3 py-2 text-sm font-mono"
              rows={6}
              defaultValue={template?.body_text || ""}
              placeholder="Hello {{name}}, ..."
            />
          </div>

          <button className="px-3 py-2 text-sm rounded bg-black text-white" type="submit">
            Save template
          </button>
        </form>

        <div className="text-xs text-gray-500">
          To revert to built-in emails, delete the row from{" "}
          <code className="px-1 py-0.5 bg-gray-100 rounded">email_templates</code>.
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx) {
  try {
    const q = ctx.query || {};
    const eventType = String(q.event_type || KNOWN_EVENT_TYPES[0]).trim();
    const saved = String(q.saved || "") === "1";

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { props: { eventType, template: null, saved, error: "Supabase admin not configured" } };
    }

    const { data, error } = await supabase
      .from("email_templates")
      .select("event_type, subject, body_html, body_text, updated_at, created_at")
      .eq("event_type", eventType)
      .maybeSingle();

    return {
      props: {
        eventType,
        template: data || null,
        saved,
        error: error ? error.message : "",
      },
    };
  } catch (e) {
    return {
      props: {
        eventType: KNOWN_EVENT_TYPES[0],
        template: null,
        saved: false,
        error: e?.message || "Failed to load template",
      },
    };
  }
}
