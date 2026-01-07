// pages/ops/billing.js
import { useMemo, useState } from "react";
import Link from "next/link";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function badge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "ok") return "bg-emerald-100 text-emerald-800";
  if (s === "mismatch") return "bg-amber-100 text-amber-800";
  if (s === "error") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

export default function OpsBilling({ initial, _error }) {
  const [rows, setRows] = useState(initial || []);
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState(_error || "");
  const [auditResult, setAuditResult] = useState(null);

  const issues = useMemo(() => {
    return (rows || []).filter((r) => String(r.billing_alignment_status || "unknown") !== "ok");
  }, [rows]);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/ops/subscriptions?limit=300");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Failed to load (${res.status})`);
      setRows(json.data || []);
    } catch (e) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function runAudit() {
    setError("");
    setAuditLoading(true);
    setAuditResult(null);
    try {
      const res = await fetch("/api/ops/billing-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Audit failed (${res.status})`);
      setAuditResult(json);
      await refresh();
    } catch (e) {
      setError(e?.message || "Audit failed");
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Billing audit</h1>
            <p className="text-sm text-gray-600">
              Check Supabase frequency/bags align with Stripe subscription items.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>

            <Link
              href="/ops/subscribers"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Subscribers
            </Link>

            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className={classNames(
                "rounded-lg px-3 py-2 text-sm font-semibold",
                loading ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white hover:bg-black"
              )}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={runAudit}
              disabled={auditLoading}
              className={classNames(
                "rounded-lg px-3 py-2 text-sm font-semibold",
                auditLoading
                  ? "bg-gray-300 text-gray-600"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              {auditLoading ? "Checking…" : "Run audit (50)"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-semibold">Billing audit page error</div>
            <div className="mt-1">{error}</div>
          </div>
        ) : null}

        {auditResult ? (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-900">
            <div className="font-semibold">Audit result</div>
            <div className="mt-1 text-xs text-gray-600">Checked: {auditResult.checked}</div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Needs attention</div>
            <div className="text-xs text-gray-500">{issues.length} issue(s)</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Billing</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Frequency</th>
                  <th className="px-3 py-2 text-left">Bags</th>
                  <th className="px-3 py-2 text-left">Checked</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2 text-right">Fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {issues.length ? (
                  issues.map((r) => (
                    <tr key={r.id} className="bg-white">
                      <td className="px-3 py-2">
                        <span
                          className={classNames(
                            "rounded-md px-2 py-1 text-xs font-semibold",
                            badge(r.billing_alignment_status)
                          )}
                          title={r.billing_alignment_notes || ""}
                        >
                          {r.billing_alignment_status || "unknown"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-900">{r.email || "—"}</td>
                      <td className="px-3 py-2 text-gray-900">{r.frequency || "—"}</td>
                      <td className="px-3 py-2 text-gray-900">{Number(r.extra_bags || 0)}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {r.billing_alignment_checked_at
                          ? String(r.billing_alignment_checked_at).slice(0, 19).replace("T", " ")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {r.billing_alignment_notes || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href="/ops/subscribers"
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                        >
                          Open Subscribers
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-gray-600" colSpan={7}>
                      No billing issues found 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Fix workflow: open subscriber → Check Stripe → Apply to Stripe.
          </div>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx) {
  const proto = (ctx.req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host;
  const baseUrl = `${proto}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/api/ops/subscriptions?limit=300`, {
      headers: {
        authorization: ctx.req.headers.authorization || "",
        cookie: ctx.req.headers.cookie || "",
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { props: { initial: [], _error: json?.error || "Failed to load" } };
    return { props: { initial: json.data || [], _error: "" } };
  } catch (e) {
    return { props: { initial: [], _error: e?.message || "Failed to load" } };
  }
}
