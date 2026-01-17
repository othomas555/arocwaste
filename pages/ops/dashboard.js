// pages/ops/dashboard.js
import Link from "next/link";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function badgeTone(n) {
  if (!Number.isFinite(n)) return "bg-gray-100 text-gray-800";
  if (n <= 0) return "bg-emerald-100 text-emerald-800";
  if (n <= 5) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function formatYMD(d) {
  if (!d) return "";
  return String(d).slice(0, 10);
}

export default function OpsDashboard({
  todayDate,
  billingIssueCount,
  subscriberCount,
  openOpsIssueCount,
  newClearanceQuoteCount,
}) {
  const cards = [
    {
      title: "Subscribers",
      desc: "View + edit subscribers, routes, schedule and billing sync.",
      href: "/ops/subscribers",
      right: (
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
          {subscriberCount} total
        </span>
      ),
    },
    {
      title: "Billing audit",
      desc: "See mismatches and keep Supabase aligned with Stripe.",
      href: "/ops/billing",
      right: (
        <span
          className={classNames(
            "rounded-md px-2 py-1 text-xs font-semibold",
            badgeTone(billingIssueCount)
          )}
        >
          {billingIssueCount} issue{billingIssueCount === 1 ? "" : "s"}
        </span>
      ),
    },

    // ✅ NEW: Issues inbox + badge
    {
      title: "Issues",
      desc: "Problems raised by drivers. Add action notes, close, and track outcomes.",
      href: "/ops/issues",
      right: (
        <span
          className={classNames(
            "rounded-md px-2 py-1 text-xs font-semibold",
            openOpsIssueCount > 0 ? "bg-red-600 text-white" : "bg-emerald-100 text-emerald-800"
          )}
        >
          {openOpsIssueCount || 0} open
        </span>
      ),
    },

    // ✅ NEW: Clearance Quotes + badge
    {
      title: "Clearance quotes",
      desc: "Requests from /clearances. View details and update status.",
      href: "/ops/clearance-quotes",
      right: (
        <span
          className={classNames(
            "rounded-md px-2 py-1 text-xs font-semibold",
            (newClearanceQuoteCount || 0) > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
          )}
        >
          {newClearanceQuoteCount || 0} new
        </span>
      ),
    },

    // ✅ Notifications (read-only)
    {
      title: "Notifications",
      desc: "View queued/sent/cancelled emails and any failures.",
      href: "/ops/notifications",
      right: (
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
          Queue
        </span>
      ),
    },

    // ✅ Email templates (editable)
    {
      title: "Email templates",
      desc: "Edit customer emails by event type (optional overrides).",
      href: "/ops/email-templates",
      right: (
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
          Edit
        </span>
      ),
    },

    {
      title: "Today list",
      desc: "Due today + mark collected/undo (writes to subscription_collections).",
      href: "/ops/today",
    },
    {
      title: "Daily runs",
      desc: "Create runs, assign vehicle + staff, open run views.",
      href: "/ops/daily-runs",
    },
    {
      title: "Routes (coverage)",
      desc: "Manage areas, postcodes, days + AM/PM slots.",
      href: "/ops/routes",
    },
    {
      title: "Bulk assign routes",
      desc: "Re-apply route_area/day/slot from postcode to existing subscribers.",
      href: "/ops/route-assign",
    },

    // ✅ catalogue editor
    {
      title: "Catalogue",
      desc: "Edit furniture + appliances items and prices (public pages update immediately).",
      href: "/ops/catalogue",
    },

    {
      title: "Staff",
      desc: "Manage drivers/staff used for run assignments.",
      href: "/ops/staff",
    },
    {
      title: "Vehicles",
      desc: "Manage vehicles (capacity_units later for ‘return to yard’).",
      href: "/ops/vehicles",
    },
    {
      title: "Driver portal",
      desc: "Driver login + view assigned runs (NOT behind Basic Auth).",
      href: "/driver/login",
      external: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Ops dashboard</h1>
            <p className="text-sm text-gray-600">
              Hub for domestic bin collections — {formatYMD(todayDate)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/ops/subscribers"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Open Subscribers
            </Link>

            <Link
              href="/ops/notifications"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Notifications
            </Link>

            <Link
              href="/ops/email-templates"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Email templates
            </Link>

            <Link
              href="/ops/clearance-quotes"
              className={classNames(
                "rounded-lg px-3 py-2 text-sm font-semibold",
                (newClearanceQuoteCount || 0) > 0
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              Clearance quotes {(newClearanceQuoteCount || 0) > 0 ? `(${newClearanceQuoteCount})` : ""}
            </Link>

            <Link
              href="/ops/issues"
              className={classNames(
                "rounded-lg px-3 py-2 text-sm font-semibold",
                (openOpsIssueCount || 0) > 0
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              Issues {openOpsIssueCount > 0 ? `(${openOpsIssueCount})` : ""}
            </Link>

            <Link
              href="/ops/billing"
              className={classNames(
                "rounded-lg px-3 py-2 text-sm font-semibold",
                billingIssueCount > 0
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              Billing audit
            </Link>
          </div>
        </div>

        {/* Quick status row */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-500">Subscribers</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{subscriberCount}</div>
            <div className="mt-1 text-xs text-gray-600">Active/pending/paused included</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-500">Issues to resolve</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-2xl font-semibold text-gray-900">{openOpsIssueCount || 0}</div>
              <span
                className={classNames(
                  "rounded-md px-2 py-1 text-xs font-semibold",
                  (openOpsIssueCount || 0) > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                )}
              >
                {(openOpsIssueCount || 0) > 0 ? "Needs attention" : "All clear"}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-600">Driver-reported problems</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-500">Billing issues</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-2xl font-semibold text-gray-900">{billingIssueCount}</div>
              <span
                className={classNames("rounded-md px-2 py-1 text-xs font-semibold", badgeTone(billingIssueCount))}
              >
                {billingIssueCount === 0 ? "All good" : "Needs attention"}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Anything not marked <span className="font-mono">ok</span>
            </div>
          </div>
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900 group-hover:underline">
                    {c.title}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">{c.desc}</div>
                </div>
                {c.right ? <div className="shrink-0">{c.right}</div> : null}
              </div>
              {c.external ? (
                <div className="mt-2 text-[11px] font-semibold text-gray-500">
                  External (no Basic Auth)
                </div>
              ) : null}
            </Link>
          ))}
        </div>

        {/* Reminders / ops notes */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Ops notes</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              If you change frequency/bags in <span className="font-mono">/ops/subscribers</span>,
              use <span className="font-mono">Check Stripe</span> →{" "}
              <span className="font-mono">Apply to Stripe</span> to keep billing aligned.
            </li>
            <li>
              If routes change, update <span className="font-mono">/ops/routes</span> then use{" "}
              <span className="font-mono">/ops/route-assign</span> to apply to existing customers.
            </li>
            <li>
              Driver issues land in <span className="font-mono">/ops/issues</span> — add an action note, then close.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx) {
  const proto = (ctx.req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host;
  const baseUrl = `${proto}://${host}`;

  const todayDate = new Date().toISOString().slice(0, 10);

  // Defaults
  let billingIssueCount = 0;
  let subscriberCount = 0;
  let openOpsIssueCount = 0;
  let newClearanceQuoteCount = 0;

  // 1) Subscriber + billing audit counts (existing behaviour)
  try {
    const res = await fetch(`${baseUrl}/api/ops/subscriptions?limit=500`, {
      headers: {
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });

    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const subs = Array.isArray(json.data) ? json.data : [];
      const activeLike = new Set(["active", "pending", "paused"]);
      const filtered = subs.filter((s) => activeLike.has(String(s.status || "").toLowerCase()));

      subscriberCount = filtered.length;
      billingIssueCount = filtered.filter(
        (s) => String(s.billing_alignment_status || "unknown") !== "ok"
      ).length;
    }
  } catch {
    // keep defaults
  }

  // 2) Open ops issue count (existing behaviour)
  try {
    const res = await fetch(`${baseUrl}/api/ops/issues/count-open`, {
      headers: {
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });

    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      openOpsIssueCount = Number(json.open_count) || 0;
    }
  } catch {
    // keep default
  }

  // 3) NEW: Clearance quote "new" count (server-side, using admin client)
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("clearance_quotes")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");

    if (!error) newClearanceQuoteCount = Number(count) || 0;
  } catch {
    // keep default
  }

  return {
    props: {
      todayDate,
      billingIssueCount,
      subscriberCount,
      openOpsIssueCount,
      newClearanceQuoteCount,
    },
  };
}
