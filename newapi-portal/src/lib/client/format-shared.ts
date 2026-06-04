export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatCurrencyCny(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
  }).format(cents / 100);
}

export function formatDateTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === 0) {
    return "-";
  }

  const date =
    typeof value === "number"
      ? new Date(value > 10_000_000_000 ? value : value * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function statusText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const normalized = String(value).toUpperCase();
  const map: Record<string, string> = {
    PENDING: "待支付",
    PAID: "已支付",
    EXPIRED: "已过期",
    CANCELED: "已取消",
    FAILED: "失败",
    READY: "正常",
    AVAILABLE: "可签到",
    CLAIMED: "已签到",
    REVERSED: "已撤销",
    "1": "启用",
    "0": "停用",
  };

  return map[normalized] ?? String(value);
}
