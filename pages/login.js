import Layout from "../components/layout";

export default function LoginPage() {
  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mx-auto max-w-lg rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-extrabold tracking-tight">Log in</h1>
            <p className="mt-3 text-slate-600">
              Account features are coming soon. For now, bookings can be made
              without an account.
            </p>

            <div className="mt-8 space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input
                  disabled
                  placeholder="Coming soon"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Password</label>
                <input
                  disabled
                  placeholder="Coming soon"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                />
              </div>

              <button
                disabled
                className="w-full rounded-2xl bg-slate-300 px-6 py-3 text-sm font-semibold text-white cursor-not-allowed"
              >
                Log in
              </button>

              <p className="text-xs text-slate-500">
                We’ll add proper logins once payments + bookings are fully live.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
