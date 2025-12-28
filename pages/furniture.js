import { useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";
import { furnitureItems } from "../data/furniture";
import { basketAdd } from "../utils/basket";

function formatGBP(amount) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function FurniturePage() {
  const items = Array.isArray(furnitureItems) ? furnitureItems : [];
  const popular = useMemo(() => items.filter((i) => i.popular), [items]);
  const all = items;

  const [justAddedId, setJustAddedId] = useState("");

  function addItem(item) {
    basketAdd({
      category: "furniture",
      slug: item.id, // furniture uses id
      title: item.title,
      unitPrice: Number(item.price) || 0,
      qty: 1,
    });
    setJustAddedId(item.id);
    setTimeout(() => setJustAddedId(""), 1200);
  }

  return (
    <Layout title="Furniture Collection | AROC Waste" description="Add furniture items to your basket and checkout once.">
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              <span className="text-slate-400">AROC Waste</span>
              <span className="text-slate-300">•</span>
              <span>Furniture collections</span>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-7">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Furniture collection, booked online.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  Add multiple items to your basket (sofa + armchair + microwave later) and checkout once.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="#items"
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    View items
                  </Link>
                  <Link
                    href="/basket"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                  >
                    View basket →
                  </Link>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {["One checkout", "Card payments", "Fast booking"].map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">How it works</div>
                  <ol className="mt-3 space-y-2 text-sm text-slate-700">
                    <li>1) Add items to your basket</li>
                    <li>2) Go to basket → checkout</li>
                    <li>3) Choose postcode/date + extras once</li>
                    <li>4) Pay securely</li>
                  </ol>
                  <Link
                    href="/basket"
                    className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Go to basket
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="-mx-4 border-t border-slate-200 bg-slate-50 px-4 py-10 sm:py-12">
            <div className="mx-auto max-w-6xl">
              {popular.length > 0 && (
                <>
                  <div className="mb-5">
                    <h2 className="text-xl font-semibold text-slate-900">Popular items</h2>
                    <p className="mt-1 text-sm text-slate-600">Common furniture removals.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {popular.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                            <span className="text-lg">▦</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                            <div className="mt-0.5 text-xs text-slate-600">{item.subtitle}</div>
                            <div className="mt-3">
                              <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                                Popular
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {formatGBP(item.price)}
                            <span className="text-slate-400 font-normal">each</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => addItem(item)}
                            className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            {justAddedId === item.id ? "Added ✓" : "Add to basket"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className={popular.length > 0 ? "mt-12" : ""} id="items">
                <h2 className="text-xl font-semibold text-slate-900">All furniture items</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Add as many as you like, then checkout once.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {all.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                            <span className="text-lg">▦</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                            <div className="mt-0.5 text-xs text-slate-600">{item.subtitle}</div>
                            <div className="mt-3 text-xs text-slate-500">Add to basket and checkout once</div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {formatGBP(item.price)}
                            <span className="text-slate-400 font-normal">each</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => addItem(item)}
                            className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            {justAddedId === item.id ? "Added ✓" : "Add to basket"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900">Ready?</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Go to your basket to choose postcode/date and pay securely.
                  </p>
                  <div className="mt-4">
                    <Link
                      href="/basket"
                      className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      View basket →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* end band */}
        </div>
      </div>
    </Layout>
  );
}
