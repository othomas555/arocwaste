// pages/ops/clearance-quotes.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function fmtDT(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(d);
  } catch {
    return iso;
  }
}

function fmtDateYMD(ymd) {
  if (!ymd) return "—";
  try {
    const d = new Date(`${ymd}T00:00:00`);
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Europe/London",
    }).format(d);
  } catch {
    return ymd;
  }
}

async function apiList({ status, q }) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  params.set("limit", "100");
  params.set("offset", "0");

  const res = await fetch(`/api/ops/clearance-quotes/list?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json?.error || "Failed to load" };
  return json;
}

async function apiSetStatus(id, status) {
  const res = await fetch("/api/ops/clearance-quotes/set-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json?.error || "Failed to update status" };
  return json;
}

export default function OpsClearanceQuotesPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);

  const [openId, setOpenId] = useState("");

  const openItem = useMemo(() => items.find((x) => x.id === openId) || null, [items, openId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const out = await apiList({ status, q });
      if (out?.error) setError(out.error);
      else setItems(out.items || []);
    } catch (e) {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onChangeStatus(id, nextStatus) {
    setSavingId(id);
    setError("");
    try {
      const out = await apiSetStatus(id, nextStatus);
      if (out?.error) {
        setError(out.error);
      } else {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: nextStatus } : x)));
      }
    } catch (e) {
      setError("Failed to update status");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-gray-500">
            <Link href="/ops" className="hover:underline">
              Ops
            </Link>{" "}
            / Clearance Quotes
          </div>
          <h1 className="text-2xl font-bold">Clearance Quotes</h1>
          <p className="mt-1 text-sm text-gray-600">
            Requests submitted from /clearances. Change status as you progress them.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className={cx(
              "rounded-xl border px-4 py-2 text-sm font-medium",
              loading ? "bg-gray-100 text-gray-500" : "bg-white hover:bg-gray-50"
            )}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select
            className="mt-2 w-full rounded-xl border bg-white px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="new">new</option>
            <option value="quoted">quoted</option>
            <option value="booked">booked</option>
            <option value="closed">closed</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="text-sm font-medium text-gray-700">Search (postcode or name)</label>
          <div className="mt-2 flex gap-2">
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. CF33 or John"
            />
            <button
              type="button"
              onClick={load}
              className={cx(
                "rounded-xl px-4 py-2 text-sm font-medium",
                loading ? "bg-gray-100 text-gray-500" : "bg-black text-white hover:opacity-90"
              )}
              disabled={loading}
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Postcode</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Coverage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((x) => {
                const cov = x.in_area
                  ? `${x.route_area || "—"} • ${x.next_date ? fmtDateYMD(x.next_date) : x.route_day || "—"}`
                  : "Not covered";
                return (
                  <tr key={x.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{fmtDT(x.created_at)}</td>
                    <td className="px-4 py-3 font-medium">{x.postcode}</td>
                    <td className="px-4 py-3">{x.name || "—"}</td>
                    <td className="px-4 py-3">{x.clearance_type || "—"}</td>
                    <td className="px-4 py-3">{cov}</td>
                    <td className="px-4 py-3">
                      <select
                        className="rounded-lg border bg-white px-2 py-1"
                        value={x.status || "new"}
                        onChange={(e) => onChangeStatus(x.id, e.target.value)}
                        disabled={savingId === x.id}
                      >
                        <option value="new">new</option>
                        <option value="quoted">quoted</option>
                        <option value="booked">booked</option>
                        <option value="closed">closed</option>
                      </select>
                      {savingId === x.id ? (
                        <span className="ml-2 text-xs text-gray-500">Saving…</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="rounded-lg border bg-white px-3 py-1 text-xs font-medium hover:bg-gray-50"
                        onClick={() => setOpenId(x.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!items.length && !loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={7}>
                    No clearance quotes found.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={7}>
                    Loading…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simple details modal */}
      {openItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-gray-500">Quote</div>
                <div className="text-lg font-semibold">
                  {openItem.postcode} — {openItem.name}
                </div>
                <div className="mt-1 text-xs text-gray-500">{openItem.id}</div>
              </div>
              <button
                type="button"
                className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                onClick={() => setOpenId("")}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="Created" value={fmtDT(openItem.created_at)} />
              <Info label="Status" value={openItem.status || "new"} />
              <Info label="Email" value={openItem.email || "—"} />
              <Info label="Phone" value={openItem.phone || "—"} />
              <Info label="Type" value={openItem.clearance_type || "—"} />
              <Info
                label="Coverage"
                value={
                  openItem.in_area
                    ? `${openItem.route_area || "—"} • ${
                        openItem.next_date ? fmtDateYMD(openItem.next_date) : openItem.route_day || "—"
                      }`
                    : "Not covered"
                }
              />
            </div>

            <div className="mt-4 space-y-3">
              <Block label="Address / nearest street" value={openItem.address} />
              <Block label="Access notes" value={openItem.access_notes} />
              <Block label="Preferred dates" value={openItem.preferred_dates} />
              <Block label="Photos / links" value={openItem.photos_links} />
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {openItem.email ? (
                <a
                  className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  href={`mailto:${openItem.email}?subject=${encodeURIComponent(
                    "AROC Waste clearance quote"
                  )}&body=${encodeURIComponent(
                    `Hi ${openItem.name || ""},\n\nThanks for your clearance request in ${openItem.postcode}.\n\n`
                  )}`}
                >
                  Email customer
                </a>
              ) : null}
              <button
                className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
                onClick={() => setOpenId("")}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border bg-gray-50 p-3">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 text-sm text-gray-900">{value || "—"}</div>
    </div>
  );
}

function Block({ label, value }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{value || "—"}</div>
    </div>
  );
}
