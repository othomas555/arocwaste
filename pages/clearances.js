import Link from "next/link";
import Layout from "../components/layout";

export default function ClearancesPage() {
  return (
    <Layout>
      <div className="bg-[#f7f9ff]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Clearances
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Full and part clearances (garage, shed, garden, house). This page
              is a placeholder while we build the dedicated clearance booking.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <a
                href="tel:01656470040"
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Call 01656 470040
              </a>

              <Link
                href="/man-van"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold hover:border-slate-300"
              >
                Man &amp; Van options
              </Link>
            </div>

            <div className="mt-8 rounded-2xl bg-slate-50 p-5 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">What to include</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>What type of clearance (house/garage/garden)</li>
                <li>How many bulky items (approx.)</li>
                <li>Any access issues (stairs, parking)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
