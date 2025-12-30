import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "../lib/supabaseClient";

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function MyBins() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const canUseSupabase = useMemo(() => Boolean(supabaseClient), []);

  useEffect(() => {
    if (!supabaseClient) return;

    supabaseClient.auth.getSession().then(({ data }) => {
      setSession(data?.session || null);
    });

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function sendLoginLink(e) {
    e.preventDefault();
    setError("");
    setMsg("");

    if (!canUseSupabase) {
      setError("Supabase client not configured. Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY.");
      return;
    }

    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      setError("Enter a valid email.");
      return;
    }

    setLoading(true);
    try {
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=/my-bins`;

      const { error } = await supabaseClient.auth.signInWithOtp({
        email: clean,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;
      setSent(true);
      setMsg("Check your email for a login link.");
    } catch (e2) {
      setError(e2.message || "Failed to send login link");
    } finally {
      setLoading(false);
    }
  }

  async function loadSubs() {
    setError("");
    setMsg("");
    if (!session?.access_token) return;

    setLoading(true);
    try {
      const res = await fetch("/api/customer/subscriptions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load subscriptions");
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

  async function doUpdate(action, payload = {}) {
    setError("");
    setMsg("");
    if (!session?.access_token) return;

    setLoading(true);
    try {
      const res = await fetch("/api/customer/subscription-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      setMsg("Updated.");
      await loadSubs();
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setError("");
    setMsg("");
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    setSession(null);
    setSubs([]);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-lg px-4 py-10">
          <h1 className="text-2xl font-bold text-gray-900">My Bins</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter your email and we’ll send you a secure login link.
          </p>

          <form onSubmit={sendLoginLink} className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-700">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="you@example.com"
            />

            <button
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send login link"}
            </button>

            {sent ? (
              <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                {msg || "Check your email."}
              </div>
            ) : null}

            {error ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            ) : null}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Bins</h1>
            <p className="text-sm text-gray-600">Signed in as {session.user?.email}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadSubs}
              disabled={loading}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Log out
            </button>
          </div>
        </div>

        {msg ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            {msg}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4">
          {subs.map((s) => (
            <div key={s.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {s.frequency} · {s.status}
                  </div>
                  <div className="mt-1 text-sm text-gray-700">{s.address}</div>
                  <div className="text-sm text-gray-600">{s.postcode}</div>
                  <div className="mt-2 text-sm text-gray-700">
                    Next collection: <span className="font-semibold">{s.next_collection_date || "—"}</span>
                  </div>
                  <div className="text-sm text-gray-700">
                    Extra bags: <span className="font-semibold">{s.extra_bags ?? 0}</span>
                  </div>
                  {s.pause_from || s.pause_to ? (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Paused {s.pause_from ? `from ${s.pause_from}` : ""} {s.pause_to ? `to ${s.pause_to}` : ""}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:min-w-[260px]">
                  <a
                    href={s.portal_url || "#"}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                      s.portal_url
                        ? "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                        : "border-gray-200 bg-gray-50 text-gray-400 pointer-events-none"
                    }`}
                  >
                    Manage in Stripe
                  </a>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-semibold text-gray-700">Pause collections</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="date"
                        defaultValue={todayISO()}
                        onChange={(e) => (s._pauseTo = e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs"
                      />
                      <button
                        disabled={loading}
                        onClick={() => doUpdate("pause", { subscriptionId: s.id, pauseTo: s._pauseTo || todayISO() })}
                        className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Pause
                      </button>
                    </div>

                    <button
                      disabled={loading}
                      onClick={() => doUpdate("resume", { subscriptionId: s.id })}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                To change plan frequency or extra bags, use Stripe portal unless you’ve enabled price IDs for in-site changes.
              </div>
            </div>
          ))}

          {subs.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600 shadow-sm">
              No active subscriptions found for this email.
            </div>
          ) : null}
        </div>

        {loading ? <div className="mt-4 text-xs text-gray-500">Working…</div> : null}
      </div>
    </main>
  );
}
