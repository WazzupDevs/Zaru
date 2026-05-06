/**
 * "YYYY-MM-DD HH:mm" string parser — placeholder for A4d-3's native
 * date+time picker. Lets the user type the event window into plain text
 * inputs while still enforcing a real Date construction.
 *
 * Returns null when the string isn't a complete + valid timestamp. The
 * picker we'll wire in A4d-3 will replace the input and most of this
 * helper, but the Date-shaped output is the same so call sites won't
 * change.
 */
const ISO_LIKE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

export function parseLocalDateTime(input: string): Date | null {
  const match = ISO_LIKE.exec(input.trim());
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  // Local-time interpretation. The API expects ISO-8601 with timezone,
  // so call sites do `.toISOString()` on the returned Date.
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Validate round-trip — JS Date silently shifts invalid days like
  // Feb 30. If the components don't survive the round-trip the input
  // wasn't a real calendar timestamp.
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day ||
    dt.getHours() !== hour ||
    dt.getMinutes() !== minute
  ) {
    return null;
  }
  return dt;
}

/**
 * Formats a Date for the placeholder input — "YYYY-MM-DD HH:mm". Used
 * by the quote screen to show a sensible default (now + 7 days at 14:00).
 */
export function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
