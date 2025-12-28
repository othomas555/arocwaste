// utils/basket.js
// Simple, production-safe basket storage using localStorage.
// Emits a custom event so header count updates instantly.

const STORAGE_KEY = "aroc_basket_v1";
const EVENT_NAME = "aroc:basket";

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function readRaw() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const items = safeParse(raw, []);
  return Array.isArray(items) ? items : [];
}

function writeRaw(items) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function clampQty(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(50, Math.trunc(n)));
}

/**
 * Basket item shape:
 * {
 *   id: "appliances:fridge-or-freezer",
 *   category: "appliances" | "furniture",
 *   slug: "fridge-or-freezer",
 *   title: "Standard fridge or freezer",
 *   unitPrice: 35,
 *   qty: 1
 * }
 */

export function basketGet() {
  return readRaw();
}

export function basketSet(items) {
  writeRaw(Array.isArray(items) ? items : []);
}

export function basketClear() {
  writeRaw([]);
}

export function basketAdd({ category, slug, title, unitPrice, qty = 1 }) {
  if (!category || !slug) return;

  const items = readRaw();
  const id = `${category}:${slug}`;

  const safeTitle = String(title || slug);
  const safePrice = Number(unitPrice);
  const safeQty = clampQty(qty);

  const idx = items.findIndex((x) => x.id === id);
  if (idx >= 0) {
    const next = [...items];
    next[idx] = {
      ...next[idx],
      qty: clampQty((next[idx]?.qty || 1) + safeQty),
      // keep latest title/price in case data changed
      title: safeTitle,
      unitPrice: Number.isFinite(safePrice) ? safePrice : next[idx].unitPrice,
    };
    writeRaw(next);
    return;
  }

  const next = [
    ...items,
    {
      id,
      category,
      slug,
      title: safeTitle,
      unitPrice: Number.isFinite(safePrice) ? safePrice : 0,
      qty: safeQty,
    },
  ];

  writeRaw(next);
}

export function basketRemove(id) {
  const items = readRaw();
  writeRaw(items.filter((x) => x.id !== id));
}

export function basketSetQty(id, qty) {
  const items = readRaw();
  const next = items.map((x) =>
    x.id === id ? { ...x, qty: clampQty(qty) } : x
  );
  writeRaw(next);
}

export function basketCount() {
  const items = readRaw();
  return items.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
}

export function basketSubtotal() {
  const items = readRaw();
  return items.reduce((sum, x) => {
    const price = Number(x.unitPrice) || 0;
    const qty = Number(x.qty) || 0;
    return sum + price * qty;
  }, 0);
}

// Subscribe helper (header button uses this)
export function basketSubscribe(callback) {
  if (typeof window === "undefined") return () => {};

  const onCustom = () => callback();
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) callback();
  };

  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
