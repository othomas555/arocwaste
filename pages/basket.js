// pages/basket.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/layout";
import {
  basketGet,
  basketRemove,
  basketSetQty,
  basketClear,
  basketSubtotal,
  basketSubscribe,
} from "../utils/basket";

function formatGBP(amount) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function clampQty(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(50, Math.trunc(n)));
}

export default function BasketPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const refresh = () => setItems(basketGet());
    refresh();
    const unsub = basketSubscribe(refresh);
    return unsub;
  }, []);

  const subtotal = useMemo(() => basketSubtotal(), [items]);

  const hasItems = items.length > 0;

  return (
    <Layout title="Basket | AROC Waste" description="Review your basket and proceed to checkout.">
      <div className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Basket
            </h1>
            <p className="mt-1 text-slate-600">
              Add multiple items (e.g. sofa + microwave) and checkout once.
            </p>
          </div>

          {!hasItems ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-slate-700">Your basket is empty.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/furniture"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Browse furniture
                </Link>
                <Link
                  href="/appliances"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                >
                  Browse appliances
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Items */}
              <div className="lg:col-span-2 space-y-4">
                {items.map((it) => {
                  const line = (Number(it.unitPrice) || 0) * (Number(it.qty) || 0);
                  return (
                    <div
                      key={it.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {it.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {it.category} • {formatGBP(it.unitPrice)} each
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => basketRemove(it.id)}
                          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-lg shadow-sm hover:bg-slate-50"
                            onClick={() => basketSetQty(it.id, clampQty((it.qty || 1) - 1))}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>

                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={it.qty}
                            onChange={(e) => basketSetQty(it.id, clampQty(e.target.value))}
                            className="h-10 w-16 rounded-xl border border-slate-200 bg-white text-center text-sm font-semibold text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                          />

                          <button
                            type="button"
                            className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-lg shadow-sm hover:bg-slate-50"
                            onClick={() => basketSetQty(it.id, clampQty((it.qty || 1) + 1))}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-sm text-slate-700">
                          Line total:{" "}
                          <span className="font-semibold text-slate-900">
                            {formatGBP(line)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => basketClear()}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                  >
                    Clear basket
                  </button>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href="/furniture"
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                    >
                      Add furniture
                    </Link>
                    <Link
                      href="/appliances"
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                    >
                      Add appliances
                    </Link>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="lg:col-span-1">
                <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-lg font-semibold text-slate-900">
                    Summary
                  </div>

                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-slate-600">Items subtotal</div>
                      <div className="font-semibold text-slate-900">
                        {formatGBP(subtotal)}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <p className="text-xs text-slate-500">
                        Add-ons (time option / remove-from-property) will be chosen once at checkout and apply to the whole visit.
                      </p>
                    </div>

                    <Link
                      href="/checkout"
                      className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      Checkout →
                    </Link>

                    <p className="mt-3 text-xs text-slate-500">
                      Next: postcode → date → add-ons → pay securely.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
