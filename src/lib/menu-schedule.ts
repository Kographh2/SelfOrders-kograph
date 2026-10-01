type ScheduledMenu = { available_from?: string | null; available_until?: string | null; available_days?: number[] | null };

function localTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: weekdays.indexOf(values.weekday), minutes: Number(values.hour) * 60 + Number(values.minute) };
}

function minutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isMenuScheduledNow(item: ScheduledMenu, timeZone: string, at = new Date()) {
  if (!item.available_from && !item.available_until) return true;
  if (!item.available_from || !item.available_until) return false;
  let current: ReturnType<typeof localTime>;
  try { current = localTime(at, timeZone); }
  catch { current = localTime(at, "Asia/Jakarta"); }
  const start = minutes(item.available_from);
  const end = minutes(item.available_until);
  if (start === null || end === null) return false;
  const days = item.available_days?.length ? item.available_days : [0, 1, 2, 3, 4, 5, 6];
  if (start < end) return days.includes(current.day) && current.minutes >= start && current.minutes < end;
  const previousDay = (current.day + 6) % 7;
  return (days.includes(current.day) && current.minutes >= start) ||
    (days.includes(previousDay) && current.minutes < end);
}
