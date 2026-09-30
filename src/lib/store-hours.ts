export interface DayOpeningHours {
  open: string;
  close: string;
  closed?: boolean;
}

export type StoreOpeningHours = Record<string, DayOpeningHours>;

export interface StoreOperatingStatus {
  is_open: boolean;
  closed_reason?: "inactive" | "manual" | "schedule";
  next_open_label?: string;
}

function timeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday);
  return { weekday: Math.max(0, weekday), minutes: Number(value.hour) * 60 + Number(value.minute) };
}

export function getStoreOperatingStatus(store: {
  is_active?: boolean;
  manual_closed?: boolean;
  opening_hours?: StoreOpeningHours | null;
  timezone?: string | null;
}, now = new Date()): StoreOperatingStatus {
  if (store.is_active === false) return { is_open: false, closed_reason: "inactive" };
  if (store.manual_closed) return { is_open: false, closed_reason: "manual" };
  if (!store.opening_hours) return { is_open: true };

  const timezone = store.timezone || "Asia/Jakarta";
  let today: ReturnType<typeof localParts>;
  try { today = localParts(now, timezone); }
  catch { today = localParts(now, "Asia/Jakarta"); }

  const todayHours = store.opening_hours[String(today.weekday)];
  const previousHours = store.opening_hours[String((today.weekday + 6) % 7)];
  const isWithin = (hours: DayOpeningHours | undefined, minute: number, previousDay = false) => {
    if (!hours || hours.closed || !/^\d{2}:\d{2}$/.test(hours.open) || !/^\d{2}:\d{2}$/.test(hours.close)) return false;
    const opening = timeMinutes(hours.open);
    const closing = timeMinutes(hours.close);
    return closing <= opening
      ? previousDay ? minute < closing : minute >= opening
      : !previousDay && minute >= opening && minute < closing;
  };

  if (isWithin(todayHours, today.minutes) || isWithin(previousHours, today.minutes, true)) {
    return { is_open: true };
  }

  for (let offset = 0; offset < 7; offset++) {
    const day = (today.weekday + offset) % 7;
    const hours = store.opening_hours[String(day)];
    if (!hours || hours.closed || !/^\d{2}:\d{2}$/.test(hours.open)) continue;
    if (offset === 0 && timeMinutes(hours.open) <= today.minutes) continue;
    const weekdayLabel = offset === 0 ? "hari ini" : offset === 1 ? "besok" :
      new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: timezone }).format(new Date(now.getTime() + offset * 86400000));
    return { is_open: false, closed_reason: "schedule", next_open_label: `${weekdayLabel} pukul ${hours.open}` };
  }

  return { is_open: false, closed_reason: "schedule" };
}
