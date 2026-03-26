// Consistent date formatting across the app
// Display standard: "Mar 25–27" (same month) or "Mar 25 – Apr 2" (cross-month)
// Full form: "Mar 25 – 27, 2026"

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseParts(label: string): { startD: Date; endD: Date } | null {
  // Handles "Mar 25, 2026 – Mar 27, 2026" (from create-trip)
  const full = label.match(
    /(\w+)\s+(\d+),\s+(\d+)\s*[–\-]\s*(\w+)\s+(\d+),\s+(\d+)/
  );
  if (full) {
    const sm = SHORT_MONTHS.indexOf(full[1]);
    const em = SHORT_MONTHS.indexOf(full[4]);
    if (sm === -1 || em === -1) return null;
    return {
      startD: new Date(+full[3], sm, +full[2]),
      endD:   new Date(+full[6], em, +full[5]),
    };
  }
  // Single date "Mar 25, 2026"
  const single = label.match(/(\w+)\s+(\d+),\s+(\d+)/);
  if (single) {
    const sm = SHORT_MONTHS.indexOf(single[1]);
    if (sm === -1) return null;
    const d = new Date(+single[3], sm, +single[2]);
    return { startD: d, endD: d };
  }
  return null;
}

/** "Mar 25 – 27, 2026" or "Mar 25 – Apr 2, 2026" */
export function formatTripDates(label: string | null | undefined): string {
  if (!label) return '';
  const parts = parseParts(label);
  if (!parts) return label; // fallback to raw
  const { startD, endD } = parts;
  const sm = SHORT_MONTHS[startD.getMonth()];
  const em = SHORT_MONTHS[endD.getMonth()];
  const year = endD.getFullYear();
  if (startD.getMonth() === endD.getMonth() && startD.getFullYear() === endD.getFullYear()) {
    if (startD.getDate() === endD.getDate()) return `${sm} ${startD.getDate()}, ${year}`;
    return `${sm} ${startD.getDate()}–${endD.getDate()}, ${year}`;
  }
  return `${sm} ${startD.getDate()} – ${em} ${endD.getDate()}, ${year}`;
}

/** Relative: "D-5", "D-Day", "Day 2/7", or null if trip ended */
export function tripCountdown(label: string | null | undefined): { text: string; active: boolean } | null {
  if (!label) return null;
  const parts = parseParts(label);
  if (!parts) return null;
  const { startD, endD } = parts;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(startD); start.setHours(0, 0, 0, 0);
  const end   = new Date(endD);   end.setHours(0, 0, 0, 0);
  const diffToStart = Math.round((start.getTime() - today.getTime()) / 86400000);
  if (diffToStart > 0) return { text: `D-${diffToStart}`, active: false };
  if (diffToStart === 0) return { text: 'D-Day', active: true };
  if (today <= end) {
    const total  = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const dayNum = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
    return { text: `Day ${dayNum}/${total}`, active: true };
  }
  return null; // trip ended
}
