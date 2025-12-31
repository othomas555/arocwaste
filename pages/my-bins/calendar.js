import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "../../lib/supabaseClient";

function toISO(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameISO(a, b) {
  return String(a || "") === String(b || "");
}

export default function MyBinsCalendar() {
  const [session, setSession] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canUseSupabase = useMemo(() => Boolean(supabaseClient), []);

  useEffect(() => {
    if (!supabaseClient) return;

    supabaseClient.auth.getSession().then(({ data }) => setSession(data?.session || null));
    const { data: sub } = supabaseClient.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function loadSubs() {
    setError("");
    if (!session?.access_token) return;

    setLoading(true);
    try {
      const res = await fetch("/api/customer/subscriptions", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setSubs(Array.isArray(data?.subscriptions) ? data.subscriptions : []);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session?.access_token) loadSubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const calendarStart = useMemo(() => startOfWeekMonday(today), [today]);
  const weeksToShow = 8;
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < weeksToShow * 7; i++) out.push(addDays(calendarStart, i));
    return out;
  }, [calendarStart]);

  if (!canUseSupabase) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-xl px-4 py-12">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Supabase client not configured.
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-xl px-4 py-12">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-lg font-semibold text-gray-900">Please log in</div>
            <p className="mt-2 text-sm text-gray-600">
              Go to <a className="underline" href="/my-bins">My Bins</a> to sign in.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const primary = subs[0] || null;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Collections calendar</h1>
            <p className="text-sm text-gray-600">
              Signed in as {session.user?.email} ·{" "}
              <a className="underline" href="/my-bins">Back to My Bins</a>
            </p>
          </div>
          <button
            onClick={loadSubs}
            disabled={loading}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {!primary ? (
          <div className="mt-6 rounded-2xl border bg-white p-6 text-sm text-gray-600 shadow-sm">
            No active subscriptions found.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-1">
              <div className="text-sm font-semibold text-gray-900">Your details</div>
              <div className="mt-2 text-sm text-gray-700">{primary.address}</div>
              <div className="text-sm text-gray-600">{primary.postcode}</div>

              <div className="mt-4 grid gap-2 text-sm">
                <div>
                  Frequency: <span className="font-semibold">{primary.frequency}</span>
                </div>
                <div>
                  Extra bags: <span className="font-semibold">{primary.extra_bags ?? 0}</span>
                </div>
                <div>
                  Next collection:{" "}
                  <span className="font-semibold">{primary.next_collection_date || "—"}</span>
                </div>
              </div>

              {primary.pause_from || primary.pause_to ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Paused {primary.pause_from ? `from ${primary.pause_from}` : ""}{" "}
                  {primary.pause_to ? `to ${primary.pause_to}` : ""}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  Active
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Next 8 weeks</div>
                <div className="text-xs text-gray-500">Mon → Sun</div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-2">
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-600">{d}</div>
                ))}

                {days.map((d) => {
                  const iso = toISO(d);
                  const isToday = sameISO(iso, toISO(today));
                  const isNext = sameISO(iso, primary.next_collection_date);

                  return (
                    <div
                      key={iso}
                      className={[
                        "rounded-xl border px-2 py-2 text-center text-xs",
                        isToday ? "border-black" : "border-gray-200",
                        isNext ? "bg-green-50 border-green-200" : "bg-white",
                      ].join(" ")}
                    >
                      <div className="text-gray-900 font-semibold">{d.getDate()}</div>
                      <div className="text-gray-500">{d.getMonth() + 1}</div>
                      {isNext ? (
                        <div className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-900">
                          Collection
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 text-xs text-gray-500">
                This calendar highlights your <span className="font-semibold">next</span> collection date. (We can expand it to show every scheduled date next.)
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
