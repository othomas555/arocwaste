import Layout from "../components/layout";
import Link from "next/link";

export default function Success() {
  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-3xl border border-slate-100 bg-white p-10 shadow-sm text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Payment received ✅
            </h1>
            <p className="mt-3 text-slate-600">
              Thanks — your booking is confirmed. We’ll be in touch if we need anything else.
            </p>
            <div className="mt-8">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
