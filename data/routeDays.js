// data/routeDays.js
// Keep this dead simple: match on OUTWARD code (first part of postcode).
// You can expand it later by adding more entries.

export const ROUTE_DAYS = [
  // Newport examples
  { outward: "NP19", day: "Thursday", area: "Newport" },
  { outward: "NP20", day: "Thursday", area: "Newport" },

  // Add your own (examples)
  // { outward: "CF31", day: "Tuesday", area: "Bridgend" },
  // { outward: "CF36", day: "Friday", area: "Porthcawl" },
];

// Fallback: match broader area prefix if you want.
// e.g. NP* => Thursday
export const ROUTE_PREFIX_FALLBACK = [
  { prefix: "NP", day: "Thursday", area: "Newport (all NP)" },
];
