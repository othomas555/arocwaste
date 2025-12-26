// utils/postcode.js
import { ROUTE_DAYS, ROUTE_PREFIX_FALLBACK } from "../data/routeDays";

export function normalizePostcode(input = "") {
  return String(input).toUpperCase().replace(/\s+/g, "").trim();
}

export function outwardCode(input = "") {
  // UK outward = everything before the space (we're using normalized)
  // e.g. "NP201AB" => try to extract "NP20"
  const pc = normalizePostcode(input);

  // Basic validation (not perfect, but prevents junk)
  if (pc.length < 5) return "";

  // Typical outward patterns:
  // A9, A99, AA9, AA99, AA9A etc.
  // We’ll take letters+digits up until the final 3 inward characters.
  // Inward is usually 3 chars, so outward = pc.slice(0, -3)
  return pc.slice(0, -3);
}

export function findRouteForPostcode(input = "") {
  const out = outwardCode(input);
  if (!out) return null;

  // Exact outward match first (NP20 etc.)
  const exact = ROUTE_DAYS.find(r => r.outward === out);
  if (exact) return exact;

  // Prefix fallback (NP* etc.)
  const fallback = ROUTE_PREFIX_FALLBACK.find(r => out.startsWith(r.prefix));
  if (fallback) return fallback;

  return null;
}

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function nextServiceDatesForDay(dayName, count = 5) {
  // Returns next N dates (yyyy-mm-dd) that fall on the given weekday
  const targetIndex = WEEKDAYS.indexOf(dayName);
  if (targetIndex === -1) return [];

  const results = [];
  const d = new Date();
  d.setHours(0,0,0,0);

  // Start from tomorrow to mimic “next available”
  d.setDate(d.getDate() + 1);

  while (results.length < count) {
    if (d.getDay() === targetIndex) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      results.push(`${yyyy}-${mm}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }

  return results;
}
