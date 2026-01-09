import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "../../lib/supabaseClient";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function DriverMyRuns() {
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);

  const [error, setError] = useState("");
  const [staff, setStaff] = useState(null);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      setError("");
      setLoading(true);

      if (!supabaseClient) {
        setError("Supabase client not configured.");
        setLoading(false);
        return;
      }

      const { data } = await supabaseClient.auth.getSession();
      if (!mounted) return;

      setSession(data?.session || null);
      setAuthReady(true);
      setLoading(false);
    }

    init();

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function loadRuns() {
    setError("");
    setLoading(true);
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/driver/my-runs", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load runs");

      setStaff(json.staff || null);
      setRuns(Array.isArray(json.runs) ? json.runs : []);
    } catch (e) {
      setError(e?.message || "Failed to load runs");
      setRuns([]);
      setStaff(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authReady && session?.access_token) loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session?.access_token]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of runs || []) {
      const d = String(r.run_date || "");
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(r);
    }
    for (const [k, v] of map.entries()) {
      v.sort((a, b) => String(a.route_area || "").localeCompare(String(b.route_area || "")));
      map.set(k, v);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [runs]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Driver • My runs</h1>
            <p className="text-sm text-slate-600">
              You will only see runs that ops has assigned to you.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/driver/login"
              className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm"
            >
              Login
            </Link>
          </div>
        </div>

        {staff ? (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-700">
              Logged in as <span className="font-semibold">{staff.name || staff.email}</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {!session?.access_token ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
            You’re not logged in. Go to{" "}
            <Link className="underline font-semibold" href="/driver/login">
              /driver/login
            </Link>
            .
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
            Loading…
          </div>
        ) : grouped.length ? (
          <div className="space-y-4">
            {grouped.map(([date, list]) => (
              <div key={date} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">{date}</div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {list.map((r) => (
                    <Link
                      key={r.id}
                      href={`/driver/run/${r.id}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {r.route_area} • {String(r.route_slot || "ANY").toUpperCase()}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {r.route_day}
                        <span className="mx-2 text-slate-300">•</span>
                        {r.vehicles ? (
                          <span>
                            {r.vehicles.registration}
                            {r.vehicles.name ? ` • ${r.vehicles.name}` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-500">No vehicle</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
            No runs assigned yet. Ask ops to assign you to a run.
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={loadRuns}
            disabled={loading || !session?.access_token}
            className={cx(
              "rounded-xl px-4 py-2 text-sm font-semibold",
              loading || !session?.access_token ? "bg-slate-200 text-slate-600" : "bg-slate-900 text-white hover:bg-black"
            )}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
