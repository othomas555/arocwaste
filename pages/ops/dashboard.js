// pages/ops/dashboard.js
import Link from "next/link";

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
      title: "Catalogue",
      desc: "Edit furniture/appliance items and prices (no GitHub changes needed).",
      href: "/ops/catalogue",
    },
    {
      title: "Today list",
      desc: "Due today + mark collected/undo (writes to subscription_collections).",
      href: "/ops/today",
    },
    {
      title: "Bulk assign routes",
      desc: "Re-apply route_area/day/slot from postcode to existing subscribers.",
      href: "/ops/route-assign",
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
              href="/ops/catalogue"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Edit catalogue
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
            <div className="text-xs font-semibold text-gray-500">Billing issues</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-2xl font-semibold text-gray-900">{billingIssueCount}</div>
              <span
                className={classNames(
                  "rounded-md px-2 py-1 text-xs font-semibold",
                  badgeTone(billingIssueCount)
                )}
              >
                {billingIssueCount === 0 ? "All good" : "Needs attention"}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Anything not marked <span className="font-mono">ok</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-500">Next</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              Run planning → stop ordering → return-to-yard markers
            </div>
            <div className="mt-1 text-xs text-gray-600">We’ll keep it simple and ops-first.</div>
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
              If pricing/items change, update <span className="font-mono">/ops/catalogue</span> (no code deploy needed).
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

  // Pull subscriptions through your ops API (keeps auth consistent and avoids importing admin client in pages)
  try {
    const res = await fetch(`${baseUrl}/api/ops/subscriptions?limit=500`, {
      headers: {
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        props: {
          todayDate,
          billingIssueCount: 0,
          subscriberCount: 0,
        },
      };
    }

    const subs = Array.isArray(json.data) ? json.data : [];
    const activeLike = new Set(["active", "pending", "paused"]);
    const filtered = subs.filter((s) => activeLike.has(String(s.status || "").toLowerCase()));

    const billingIssueCount = filtered.filter(
      (s) => String(s.billing_alignment_status || "unknown") !== "ok"
    ).length;

    return {
      props: {
        todayDate,
        billingIssueCount,
        subscriberCount: filtered.length,
      },
    };
  } catch {
    return {
      props: {
        todayDate,
        billingIssueCount: 0,
        subscriberCount: 0,
      },
    };
  }
}
