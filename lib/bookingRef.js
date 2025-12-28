export function formatBookingRef(n) {
  const padded = String(n).padStart(5, "0");
  return `AROC-${padded}`;
}

export function fallbackBookingRef() {
  // Fallback if KV isn't configured. Not sequential, but unique + readable.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `AROC-${y}${m}${d}-${hh}${mm}${ss}`;
}
