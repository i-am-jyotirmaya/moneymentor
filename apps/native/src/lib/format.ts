export function formatTone(tone: string) {
  return tone.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatMoney(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      currency: currencyCode,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      style: "currency",
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export function shiftMonthKey(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function formatMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function getMonthOptions(selectedMonth: string) {
  const currentMonth = getCurrentMonthKey();
  const options = new Set(
    Array.from({ length: 36 }, (_, index) =>
      shiftMonthKey(currentMonth, -index),
    ),
  );
  options.add(selectedMonth);
  return Array.from(options).sort((left, right) => right.localeCompare(left));
}

