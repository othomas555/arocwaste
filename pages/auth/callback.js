import { useEffect, useState } from "react";
import { supabaseClient } from "../../lib/supabaseClient";

export default function AuthCallback() {
  const [error, setError] = useState("");

  useEffect(() => {
    async function run() {
      try {
        if (!supabaseClient) {
          throw new Error(
            "Supabase client not configured. Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY."
          );
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const next = url.searchParams.get("next") || "/my-bins";

        // If Supabase is using the PKCE/code flow, exchange code for session
        if (code) {
          const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // If the token is in the hash (#access_token=...), Supabase will detect it automatically
          // because detectSessionInUrl: true in our client config.
          // We just wait a tick for it to process.
          await supabaseClient.auth.getSession();
        }

        window.location.replace(next);
      } catch (e) {
        setError(e?.message || "Login failed");
      }
    }

    run();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">Signing you in…</h1>
        <p className="mt-2 text-sm text-gray-600">
          Please wait while we confirm your login.
        </p>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
            If nothing happens, go back to{" "}
            <a className="underline" href="/my-bins">
              My Bins
            </a>
            .
          </div>
        )}
      </div>
    </main>
  );
}
