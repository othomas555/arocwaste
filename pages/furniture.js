import Link from "next/link";
import Layout from "../components/layout";
import { furnitureItems, furnitureSteps } from "../data/furniture";

function MoneyPill({ price }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm bg-white/70 backdrop-blur">
      <span className="font-semibold">£{price}</span>
      <span className="text-gray-500">from</span>
    </div>
  );
}

function Icon({ name }) {
  // Simple “nice” inline SVG icons — no extra image files needed.
  // Distinct look vs Bineezy, still modern.
  const base = "stroke-current text-gray-900";
  const soft = "text-gray-500";
  switch (name) {
    case "sofa":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <path d="M14 30v-6c0-4 3-7 7-7h22c4 0 7 3 7 7v6" />
          <path d="M10 34c0-3 2-5 5-5h34c3 0 5 2 5 5v8H10v-8z" />
          <path d="M14 42v6M50 42v6" className={soft} />
        </svg>
      );
    case "mattress":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <rect x="12" y="18" width="40" height="26" rx="6" />
          <path d="M16 26h32M16 32h32M16 38h32" className={soft} />
        </svg>
      );
    case "bed":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <path d="M14 28v-8c0-3 2-5 5-5h26c3 0 5 2 5 5v8" />
          <path d="M10 32h44v12H10z" />
          <path d="M14 44v6M50 44v6" className={soft} />
        </svg>
      );
    case "wardrobe":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <rect x="16" y="14" width="32" height="40" rx="4" />
          <path d="M32 14v40" className={soft} />
          <path d="M28 34h0.01M36 34h0.01" />
        </svg>
      );
    case "table":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <path d="M14 26h36" />
          <path d="M18 26l-4 22M46 26l4 22" className={soft} />
          <path d="M24 26v22M40 26v22" className={soft} />
        </svg>
      );
    case "appliance":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <rect x="18" y="12" width="28" height="40" rx="6" />
          <circle cx="32" cy="34" r="8" className={soft} />
          <path d="M22 18h20" className={soft} />
        </svg>
      );
    case "fridge":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <rect x="20" y="10" width="24" height="44" rx="6" />
          <path d="M20 32h24" className={soft} />
          <path d="M24 22h0.01M24 40h0.01" />
        </svg>
      );
    case "truck":
      return (
        <svg viewBox="0 0 64 64" className={`w-10 h-10 ${base}`} fill="none" strokeWidth="2">
          <path d="M10 38V22h26v16H10z" />
          <path d="M36 26h10l8 8v4H36V26z" className={soft} />
          <circle cx="20" cy="42" r="4" />
          <circle cx="46" cy="42" r="4" />
        </svg>
      );
    default:
      return (
        <div className="w-10 h-10 rounded-xl bg-gray-100 border" />
      );
  }
}

function ItemCard({ item }) {
  return (
    <div className="group relative rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border bg-gray-50 p-3">
            <Icon name={item.icon} />
          </div>
          <div>
            <h3 className="font-semibold text-lg leading-tight">{item.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{item.desc}</p>
          </div>
        </div>

        <MoneyPill price={item.price} />
      </div>

      <div className="mt-5 flex items-center justify-between">
        {item.popular ? (
          <span className="text-xs rounded-full bg-gray-900 text-white px-3 py-1">
            Popular
          </span>
        ) : (
          <span className="text-xs text-gray-500">Quick online booking</span>
        )}

        <Link
          href={`/book/furniture?item=${encodeURIComponent(item.id)}`}
          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-white text-sm font-semibold transition group-hover:translate-x-0.5"
        >
          Get started →
        </Link>
      </div>
    </div>
  );
}

export default function FurniturePage() {
  const popular = furnitureItems.filter((x) => x.popular);
  const rest = furnitureItems.filter((x) => !x.popular);

  return (
    <Layout>
      {/* Hero */}
      <div className="bg-gradient-to-b from-gray-50 to-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-gray-700">
                AROC Waste • Furniture collections
              </p>
              <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight">
                Furniture collection, booked in minutes.
              </h1>
              <p className="mt-3 text-gray-600 max-w-xl">
                Choose what you need collecting, pick the best day for your area, and pay securely online.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/book/furniture?item=${encodeURIComponent(popular?.[0]?.id || furnitureItems[0].id)}`}
                  className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-white font-semibold"
                >
                  Start a booking →
                </Link>
                <a
                  href="#items"
                  className="inline-flex items-center justify-center rounded-xl border px-5 py-3 font-semibold"
                >
                  View items
                </a>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="rounded-full border bg-white px-3 py-1">Card payments</span>
                <span className="rounded-full border bg-white px-3 py-1">Fast booking</span>
                <span className="rounded-full border bg-white px-3 py-1">Responsible disposal</span>
              </div>
            </div>

            {/* Right-side accent panel */}
            <div className="rounded-2xl border bg-white p-6 shadow-sm w-full md:w-[360px]">
              <div className="text-sm text-gray-600">Most booked</div>
              <div className="mt-2 font-semibold text-lg">{popular?.[0]?.title || furnitureItems[0].title}</div>
              <div className="mt-2 text-sm text-gray-600">
                From <span className="font-semibold text-gray-900">£{popular?.[0]?.price ?? furnitureItems[0].price}</span>
              </div>
              <Link
                href={`/book/furniture?item=${encodeURIComponent(popular?.[0]?.id || furnitureItems[0].id)}`}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-2 text-white font-semibold"
              >
                Get started
              </Link>
              <p className="mt-3 text-xs text-gray-500">
                Tip: Photos help us confirm access & loading time.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div id="items" className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Popular items</h2>
            <p className="mt-2 text-gray-600">The most common collections we do.</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {popular.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>

        <div className="mt-12 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">All furniture items</h2>
            <p className="mt-2 text-gray-600">Choose the closest match — you can add notes at checkout.</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {rest.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>

        {/* How it works */}
        <div className="mt-14 rounded-2xl border bg-gray-50 p-6">
          <h2 className="text-xl font-semibold">How it works</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            {furnitureSteps.map((s) => (
              <div key={s.title} className="rounded-2xl border bg-white p-4">
                <div className="font-semibold">{s.title}</div>
                <div className="mt-1 text-sm text-gray-600">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
