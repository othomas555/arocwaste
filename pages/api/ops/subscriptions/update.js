// pages/api/ops/subscriptions/update.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const FREQUENCY_TO_DAYS = {
  weekly: 7,
  fortnightly: 14,
  "three-weekly": 21,
};

const ROUTE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROUTE_SLOTS = ["", "ANY", "AM", "PM"];

function londonTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function isValidYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Use “noon UTC” to avoid DST edge weirdness.
function ymdToDateNoonUTC(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function dateToYMDUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDaysYMD(ymd, days) {
  const dt = ymdToDateNoonUTC(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dateToYMDUTC(dt);
}
function weekdayOfYMD(ymd) {
  // JS: 0=Sun..6=Sat
  const d = ymdToDateNoonUTC(ymd).getUTCDay();
  const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return map[d];
}
function nextOccurrenceOfWeekday(fromYMD, desiredDayName) {
  const start = ymdToDateNoonUTC(fromYMD);
  const desiredIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(
    desiredDayName
  );
  if (desiredIndex === -1) return fromYMD;

  const startIndex = start.getUTCDay();
  let delta = (desiredIndex - startIndex + 7) % 7;
  // If "fromYMD" is already that weekday, delta = 0 => same day is acceptable.
  const out = new Date(start);
  out.setUTCDate(out.getUTCDate() + delta);
  return dateToYMDUTC(out);
}

function computeNextFromAnchor({ anchorYMD, frequencyDays, todayYMD }) {
  // next = first date >= today that is anchor + k*freqDays
  let next = anchorYMD;
  // guard against infinite loop
  for (let i = 0; i < 2000; i++) {
    if (next >= todayYMD) return next;
    next = addDaysYMD(next, frequencyDays);
  }
  return null;
}

function validateFrequency(freq) {
  return typeof freq === "string" && Object.prototype.hasOwnProperty.call(FREQUENCY_TO_DAYS, freq);
}
function normalizeSlot(slot) {
  if (slot == null) return "";
  const s = String(slot).trim().toUpperCase();
  if (s === "ANY" || s === "AM" || s === "PM") return s;
  return "";
}
function validateRouteDay(d) {
  return d == null || d === "" || ROUTE_DAYS.includes(d);
}

export default async function handl
