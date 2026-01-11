// pages/ops/catalogue.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function clampNum(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
}

export default function OpsCataloguePage() {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");

  const [category, setCategory] = useState("all");
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({}); // key => editable fields

  async function load() {
    setError("");
    setLoading(true);
    try {
      const qs = category && category !== "all" ? `?category=${encodeURIComponent(category)}` : "";
      const res = await fetch(`/api/ops/catalogue/list${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load catalogue");

      const items = Array.isArray(json.items) ? json.items : [];
      setRows(items);

      const nextDraft = {};
      for (const it of items) {
        const key = `${it.category}::${it.slug}`;
        nextDraft[key] = {
          title: String(it.title || ""),
          subtitle: String(it.subtitle || ""),
          price_pounds: clampNum(it.price_pounds, 0),
          popular: !!it.popular,
          active: it.active !== false,
          sort_order: clampNum(it.sort_order, 0),
        };
      }
      setDraft(nextDraft);
    } catch (e) {
      setError(e?.message || "Failed to load catalogue");
      setRows([]);
      setDraft({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.category || "").toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  async function saveItem(item) {
    const key = `${item.category}::${item.slug}`;
    const d = draft[key];
    if (!d) return;

    setSavingKey(key);
    setError("");

    try {
      const res = await fetch("/api/ops/catalogue/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: item.category,
          slug: item.slug,
          title: d.title,
          subtitle: d.subtitle,
          price_pounds: clampNum(d.price_pounds, 0),
          popular: !!d.popular,
          active: !!d.active,
          sort_order: clampNum(d.sort_order, 0),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Save failed");

      await load();
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Catalogue</h1>
            <p className="text-sm text-gray-600">
              Edit items shown on /furniture and /appliances (and basket checkout).
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/ops/dashboard"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={load}
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-600">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All" : c}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto text-xs text-gray-500">{loading ? "Loading…" : `${rows.length} item(s)`}</div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr className="text-xs font-semibold text-gray-600">
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Subtitle</th>
                <th className="px-4 py-3">Price (£)</th>
                <th className="px-4 py-3">Popular</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Sort</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((it) => {
                const key = `${it.category}::${it.slug}`;
                const d = draft[key] || {};
                const saving = savingKey === key;

                return (
                  <tr key={key} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-gray-900">{it.category}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{it.slug}</td>

                    <td className="px-4 py-3">
                      <input
                        value={d.title ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], title: e.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <input
                        value={d.subtitle ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], subtitle: e.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="1"
                        value={String(d.price_pounds ?? 0)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], price_pounds: e.target.value },
                          }))
                        }
                        className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!!d.popular}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], popular: e.target.checked },
                          }))
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!!d.active}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], active: e.target.checked },
                          }))
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="1"
                        value={String(d.sort_order ?? 0)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], sort_order: e.target.value },
                          }))
                        }
                        className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => saveItem(it)}
                        disabled={saving}
                        className={cx(
                          "rounded-lg px-3 py-2 text-sm font-semibold",
                          saving ? "bg-gray-200 text-gray-600" : "bg-emerald-600 text-white hover:bg-emerald-700"
                        )}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-sm text-gray-600">
                    No catalogue items found.
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-sm text-gray-600">
                    Loading…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
          Tip: You can edit prices here without touching GitHub. Changes apply immediately to the public pages.
        </div>
      </div>
    </div>
  );
}
