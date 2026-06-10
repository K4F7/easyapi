export const appTimeZone = "Asia/Shanghai";

export function todayDateOnly(): Date {
  return dateOnlyInTimeZone(new Date(), appTimeZone);
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateOnlyInTimeZone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "01";

  return new Date(
    Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))),
  );
}
