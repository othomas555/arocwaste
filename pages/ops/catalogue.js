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
  const [draft, setDraft] = useState({}); // key => { ...editable fields }

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

      a
