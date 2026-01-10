import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseClient } from "../../lib/supabaseClient";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function DriverLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      setError("");

      if (!supabaseClient) {
        setError("Supabase client not configured.");
        return;
      }

      const { data } = await supabaseClient.auth.getSession();
      if (!mounted) return;

      setSession(data?.session || null);
    }

    init();

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    // If already logged in, go straight to my runs
    if (session?.access_token) {
      router.replace("/driver/my-runs");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  async function sendMagicLink(e) {
    e.preventDefault();
    setError("");
    setSent(false);

    if (!supabaseClient) {
      setError("Supabase client not configured.");
      return;
    }

    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }

    setSending(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/driver/my-runs`
          : undefined;

      const { error: otpError } = await supabaseClient.auth.signInWithOtp({
        email: cleanEmail,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });

      if (otpError) throw otpError;

      setSent(true);
    } catch (err) {
      setError(err?.message || "Failed to send login link.");
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    setError("");
    try {
      await supabaseClient?.auth?.signOut?.();
      setSession(null);
    } catch (e) {
      setError(e?.message || "Failed to sign out.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Driver • Login</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your email and we’ll send you a login link.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {sent ? (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              Login link sent. Check your email.
            </div>
          ) : null}

          {session?.access_token ? (
            <div className="text-sm text-slate-700">
              You’re already logged in. Taking you to{" "}
              <Link className="underline font-semibold" href="/driver/my-runs">
                My runs
              </Link>
              .
              <div className="mt-4">
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="driver@yourcompany.co.uk"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Use the same email that’s on the staff record.
                </p>
              </div>

              <button
                type="submit"
                disabled={sending}
                className={cx(
                  "w-full rounded-xl px-4 py-2 text-sm font-semibold",
                  sending ? "bg-slate-200 text-slate-600" : "bg-slate-900 text-white hover:bg-black"
                )}
              >
                {sending ? "Sending…" : "Send login link"}
              </button>

              <div className="text-sm text-slate-600">
                <Link className="underline font-semibold" href="/driver/my-runs">
                  Back to My runs
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
