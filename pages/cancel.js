import Layout from "../components/layout";
import Link from "next/link";

export default function Cancel() {
  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-3xl border border-slate-100 bg-white p-10 shadow-sm text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Payment cancelled
            </h1>
            <p className="mt-3 text-slate-600">
              No worries — your payment didn’t go through. You can try again.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => history.back()}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold hover:border-slate-300"
              >
                Go back
              </button>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Contact us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
