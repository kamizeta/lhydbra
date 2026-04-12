export function log(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown> = {}
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export function tradeLog(action: string, data: Record<string, unknown>) {
  log("info", "trade_lifecycle", { action, ...data });
}
